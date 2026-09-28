-- Fluxo de aprovação de usuários pelo Administrador Master.
-- Aplicado em produção em 2026-09-28.
-- Mantém a estrutura atual: auth.users -> public.profiles -> public.memberships.

alter table public.profiles
  add column if not exists approval_status text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_approval_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_approval_status_check
      check (approval_status in ('pending','approved','blocked'));
  end if;
end
$$;

update public.profiles p
set approval_status = 'approved'
where exists (
  select 1 from public.memberships m where m.user_id = p.id
);

update public.memberships m
set role = 'super_admin'::public.app_role
where m.id = (
  select m2.id
  from public.memberships m2
  join auth.users u on u.id = m2.user_id
  where m2.role = 'admin'::public.app_role
  order by u.created_at asc, m2.created_at asc
  limit 1
)
and not exists (
  select 1 from public.memberships x
  where x.role = 'super_admin'::public.app_role
);

create or replace function private.is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.user_id = (select auth.uid())
      and m.role = 'super_admin'::public.app_role
      and p.status = 'active'::public.record_status
      and p.approval_status = 'approved'
  );
$$;

revoke all on function private.is_master_admin() from public, anon;
grant execute on function private.is_master_admin() to authenticated, service_role;

create or replace function private.is_company_member(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
      and p.status = 'active'::public.record_status
      and p.approval_status = 'approved'
  );
$$;

create or replace function private.has_company_role(target_company uuid, allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
      and m.role = any(allowed)
      and p.status = 'active'::public.record_status
      and p.approval_status = 'approved'
  );
$$;

revoke all on function private.is_company_member(uuid) from public, anon;
revoke all on function private.has_company_role(uuid, public.app_role[]) from public, anon;
grant execute on function private.is_company_member(uuid) to authenticated, service_role;
grant execute on function private.has_company_role(uuid, public.app_role[]) to authenticated, service_role;

create or replace function private.create_company_with_admin_impl(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_state_code text default null,
  p_city text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_approved boolean;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  select (
    p.status = 'active'::public.record_status
    and p.approval_status = 'approved'
  )
  into v_approved
  from public.profiles p
  where p.id = v_user;

  if coalesce(v_approved, false) is not true then
    raise exception 'account pending master approval' using errcode = '42501';
  end if;

  insert into public.companies(name, legal_name, tax_id, state_code, city)
  values (
    trim(p_name), nullif(trim(p_legal_name),''),
    nullif(trim(p_tax_id),''), nullif(trim(p_state_code),''),
    nullif(trim(p_city),'')
  )
  returning id into v_company;

  insert into public.memberships(company_id,user_id,role)
  values(v_company,v_user,'admin');

  insert into public.cost_categories(company_id,name,cost_type,allocation_method) values
    (v_company,'Matéria-prima','variable','unit'),
    (v_company,'Personalização','variable','unit'),
    (v_company,'Embalagem','variable','unit'),
    (v_company,'Mão de obra direta','variable','unit'),
    (v_company,'Aluguel','fixed','revenue'),
    (v_company,'Administrativo','fixed','revenue');

  insert into public.sales_channels(company_id,name,channel_type) values
    (v_company,'Venda Direta','direct'),
    (v_company,'WhatsApp','direct'),
    (v_company,'Marketplace','marketplace');

  insert into public.payment_methods(company_id,name,fee_pct,installments) values
    (v_company,'PIX',0,1),
    (v_company,'Cartão à vista',0,1);

  return v_company;
end
$$;

revoke all on function private.create_company_with_admin_impl(text,text,text,text,text) from public, anon;
grant execute on function private.create_company_with_admin_impl(text,text,text,text,text) to authenticated, service_role;

create or replace function private.list_user_approvals_impl()
returns table(
  user_id uuid,
  email text,
  full_name text,
  approval_status text,
  account_status text,
  created_at timestamptz,
  company_count bigint,
  roles text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_master_admin() then
    raise exception 'master admin required' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.full_name,
    p.approval_status,
    p.status::text,
    u.created_at,
    (select count(*) from public.memberships m where m.user_id = u.id),
    coalesce(
      (select array_agg(distinct m.role::text order by m.role::text)
       from public.memberships m where m.user_id = u.id),
      array[]::text[]
    )
  from auth.users u
  join public.profiles p on p.id = u.id
  order by
    case p.approval_status when 'pending' then 0 when 'blocked' then 1 else 2 end,
    u.created_at desc;
end
$$;

revoke all on function private.list_user_approvals_impl() from public, anon;
grant execute on function private.list_user_approvals_impl() to authenticated, service_role;

create or replace function public.list_user_approvals()
returns table(
  user_id uuid,
  email text,
  full_name text,
  approval_status text,
  account_status text,
  created_at timestamptz,
  company_count bigint,
  roles text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_user_approvals_impl();
$$;

revoke all on function public.list_user_approvals() from public, anon;
grant execute on function public.list_user_approvals() to authenticated, service_role;

create or replace function private.set_user_approval_impl(
  target_user uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not private.is_master_admin() then
    raise exception 'master admin required' using errcode = '42501';
  end if;

  if p_status not in ('pending','approved','blocked') then
    raise exception 'invalid approval status';
  end if;

  if target_user = (select auth.uid()) and p_status <> 'approved' then
    raise exception 'master cannot block its own account' using errcode = '42501';
  end if;

  select approval_status into v_old
  from public.profiles
  where id = target_user;

  if v_old is null then
    raise exception 'user profile not found';
  end if;

  update public.profiles
  set approval_status = p_status
  where id = target_user;

  insert into public.audit_logs(
    company_id, user_id, action, entity_type, entity_id, old_data, new_data
  )
  values(
    null,
    (select auth.uid()),
    'user_approval_changed',
    'profile',
    target_user::text,
    jsonb_build_object('approval_status', v_old),
    jsonb_build_object('approval_status', p_status)
  );
end
$$;

revoke all on function private.set_user_approval_impl(uuid,text) from public, anon;
grant execute on function private.set_user_approval_impl(uuid,text) to authenticated, service_role;

create or replace function public.set_user_approval(
  target_user uuid,
  p_status text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_user_approval_impl(target_user,p_status);
$$;

revoke all on function public.set_user_approval(uuid,text) from public, anon;
grant execute on function public.set_user_approval(uuid,text) to authenticated, service_role;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or private.is_master_admin()
  or exists (
    select 1
    from public.memberships me
    join public.memberships target on target.company_id = me.company_id
    where me.user_id = (select auth.uid())
      and me.role = any(array['super_admin'::public.app_role,'admin'::public.app_role])
      and target.user_id = profiles.id
  )
);

revoke update on table public.profiles from authenticated;
grant update (full_name, avatar_url, job_title, preferences, last_access_at)
on table public.profiles to authenticated;

drop policy if exists memberships_select on public.memberships;
drop policy if exists memberships_insert on public.memberships;
drop policy if exists memberships_update on public.memberships;
drop policy if exists memberships_delete on public.memberships;

create policy memberships_select on public.memberships
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_master_admin()
  or public.has_company_role(company_id, array['admin'::public.app_role])
);

create policy memberships_insert on public.memberships
for insert to authenticated
with check (
  private.is_master_admin()
  or (
    public.has_company_role(company_id, array['admin'::public.app_role])
    and role <> 'super_admin'::public.app_role
  )
);

create policy memberships_update on public.memberships
for update to authenticated
using (
  private.is_master_admin()
  or (
    public.has_company_role(company_id, array['admin'::public.app_role])
    and role <> 'super_admin'::public.app_role
  )
)
with check (
  private.is_master_admin()
  or (
    public.has_company_role(company_id, array['admin'::public.app_role])
    and role <> 'super_admin'::public.app_role
  )
);

create policy memberships_delete on public.memberships
for delete to authenticated
using (
  private.is_master_admin()
  or (
    public.has_company_role(company_id, array['admin'::public.app_role])
    and role <> 'super_admin'::public.app_role
  )
);
