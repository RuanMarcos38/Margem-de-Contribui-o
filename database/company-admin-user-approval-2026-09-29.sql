-- Permite ao administrador da empresa aprovar apenas usuários vinculados à sua própria empresa.
-- Preserva o fluxo global do super_admin e não altera a estrutura existente.

create or replace function private.list_company_user_approvals_impl(target_company uuid)
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
  if not (
    private.is_master_admin()
    or exists (
      select 1
      from public.memberships m
      join public.profiles p on p.id = m.user_id
      where m.company_id = target_company
        and m.user_id = (select auth.uid())
        and m.role = any(array['super_admin'::public.app_role,'admin'::public.app_role])
        and p.status = 'active'::public.record_status
        and p.approval_status = 'approved'
    )
  ) then
    raise exception 'company admin required' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.full_name,
    p.approval_status,
    p.status::text,
    u.created_at,
    (select count(*) from public.memberships mx where mx.user_id = u.id),
    coalesce(
      (select array_agg(distinct mx.role::text order by mx.role::text)
       from public.memberships mx
       where mx.user_id = u.id and mx.company_id = target_company),
      array[]::text[]
    )
  from auth.users u
  join public.profiles p on p.id = u.id
  where exists (
    select 1
    from public.memberships mt
    where mt.user_id = u.id
      and mt.company_id = target_company
  )
  order by
    case p.approval_status when 'pending' then 0 when 'blocked' then 1 else 2 end,
    u.created_at desc;
end
$$;

revoke all on function private.list_company_user_approvals_impl(uuid) from public, anon;
grant execute on function private.list_company_user_approvals_impl(uuid) to authenticated, service_role;

create or replace function public.list_company_user_approvals(target_company uuid)
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
  select * from private.list_company_user_approvals_impl(target_company);
$$;

revoke all on function public.list_company_user_approvals(uuid) from public, anon;
grant execute on function public.list_company_user_approvals(uuid) to authenticated, service_role;

create or replace function private.set_company_user_approval_impl(
  target_company uuid,
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
  v_target_is_master boolean;
begin
  if not (
    private.is_master_admin()
    or exists (
      select 1
      from public.memberships m
      join public.profiles p on p.id = m.user_id
      where m.company_id = target_company
        and m.user_id = (select auth.uid())
        and m.role = any(array['super_admin'::public.app_role,'admin'::public.app_role])
        and p.status = 'active'::public.record_status
        and p.approval_status = 'approved'
    )
  ) then
    raise exception 'company admin required' using errcode = '42501';
  end if;

  if p_status not in ('pending','approved','blocked') then
    raise exception 'invalid approval status';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.company_id = target_company
      and m.user_id = target_user
  ) then
    raise exception 'user is not linked to this company' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.memberships m
    where m.user_id = target_user
      and m.role = 'super_admin'::public.app_role
  ) into v_target_is_master;

  if v_target_is_master and not private.is_master_admin() then
    raise exception 'only master admin can change a master account' using errcode = '42501';
  end if;

  if target_user = (select auth.uid()) and p_status <> 'approved' then
    raise exception 'administrator cannot block its own account' using errcode = '42501';
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
    target_company,
    (select auth.uid()),
    'company_user_approval_changed',
    'profile',
    target_user::text,
    jsonb_build_object('approval_status', v_old),
    jsonb_build_object('approval_status', p_status)
  );
end
$$;

revoke all on function private.set_company_user_approval_impl(uuid,uuid,text) from public, anon;
grant execute on function private.set_company_user_approval_impl(uuid,uuid,text) to authenticated, service_role;

create or replace function public.set_company_user_approval(
  target_company uuid,
  target_user uuid,
  p_status text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_company_user_approval_impl(target_company,target_user,p_status);
$$;

revoke all on function public.set_company_user_approval(uuid,uuid,text) from public, anon;
grant execute on function public.set_company_user_approval(uuid,uuid,text) to authenticated, service_role;
