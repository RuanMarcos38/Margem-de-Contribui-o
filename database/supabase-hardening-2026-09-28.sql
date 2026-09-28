-- Supabase hardening aplicado em produção em 2026-09-28.
-- Objetivo: reduzir superfície de SECURITY DEFINER, fortalecer RLS e criar índices de FKs.
-- Este arquivo é um registro reproduzível; não é executado automaticamente pela aplicação.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

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
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
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
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
      and m.role = any(allowed)
  );
$$;

revoke all on function private.is_company_member(uuid) from public, anon;
revoke all on function private.has_company_role(uuid, public.app_role[]) from public, anon;
grant execute on function private.is_company_member(uuid) to authenticated, service_role;
grant execute on function private.has_company_role(uuid, public.app_role[]) to authenticated, service_role;

create or replace function public.is_company_member(target_company uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_company_member(target_company); $$;

create or replace function public.has_company_role(target_company uuid, allowed public.app_role[])
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.has_company_role(target_company, allowed); $$;

revoke all on function public.is_company_member(uuid) from public, anon;
revoke all on function public.has_company_role(uuid, public.app_role[]) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated, service_role;
grant execute on function public.has_company_role(uuid, public.app_role[]) to authenticated, service_role;

alter function public.calculate_guided_price(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) security invoker;
alter function public.calculate_quick_pricing(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) security invoker;
alter function public.calculate_month_result(uuid,numeric,jsonb) security invoker;
alter function public.calculate_decision_engine(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) security invoker;

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
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  insert into public.companies(name, legal_name, tax_id, state_code, city)
  values (
    trim(p_name), nullif(trim(p_legal_name),''), nullif(trim(p_tax_id),''),
    nullif(trim(p_state_code),''), nullif(trim(p_city),'')
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

create or replace function public.create_company_with_admin(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_state_code text default null,
  p_city text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_company_with_admin_impl(p_name,p_legal_name,p_tax_id,p_state_code,p_city);
$$;

revoke all on function public.create_company_with_admin(text,text,text,text,text) from public, anon;
grant execute on function public.create_company_with_admin(text,text,text,text,text) to authenticated, service_role;

drop policy if exists memberships_manage on public.memberships;
drop policy if exists memberships_select on public.memberships;
drop policy if exists memberships_insert on public.memberships;
drop policy if exists memberships_update on public.memberships;
drop policy if exists memberships_delete on public.memberships;

create policy memberships_select on public.memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_company_role(company_id, array['super_admin'::public.app_role,'admin'::public.app_role])
);

create policy memberships_insert on public.memberships for insert to authenticated
with check (
  public.has_company_role(company_id, array['super_admin'::public.app_role,'admin'::public.app_role])
);

create policy memberships_update on public.memberships for update to authenticated
using (
  public.has_company_role(company_id, array['super_admin'::public.app_role,'admin'::public.app_role])
)
with check (
  public.has_company_role(company_id, array['super_admin'::public.app_role,'admin'::public.app_role])
);

create policy memberships_delete on public.memberships for delete to authenticated
using (
  public.has_company_role(company_id, array['super_admin'::public.app_role,'admin'::public.app_role])
);

drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_company_admin_read on public.profiles;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.memberships me
    join public.memberships target on target.company_id = me.company_id
    where me.user_id = (select auth.uid())
      and me.role = any(array['super_admin'::public.app_role,'admin'::public.app_role])
      and target.user_id = profiles.id
  )
);

create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create index if not exists idx_cnae_catalog_source_key on public.cnae_catalog(source_key);
create index if not exists idx_decision_engine_runs_created_by on public.decision_engine_runs(created_by);
create index if not exists idx_monthly_results_created_by on public.monthly_results(created_by);
create index if not exists idx_ncm_catalog_source_key on public.ncm_catalog(source_key);
create index if not exists idx_simple_annex_brackets_source_key on public.simple_annex_brackets(source_key);

commit;
