-- Read-only, private reported-sales snapshots. No actual figures are in source control.
-- Apply after the combined Google/email access migration. Seed data separately, privately.
begin;
create table public.portal_sales_imports (
  id text primary key,
  source text not null check (length(btrim(source)) between 1 and 100),
  as_of date not null,
  imported_at timestamptz not null default now()
);
create table public.portal_sales_daily (
  batch_id text not null references public.portal_sales_imports(id),
  store_id text not null check (store_id in ('honten','816')),
  sales_date date not null,
  sales_jpy bigint check (sales_jpy between 0 and 10000000000),
  cumulative_jpy bigint check (cumulative_jpy between 0 and 10000000000),
  reported_yoy numeric(8,2) check (reported_yoy between 0 and 10000),
  primary key (batch_id,store_id,sales_date)
);
alter table public.portal_sales_imports enable row level security;
alter table public.portal_sales_daily enable row level security;
revoke all on public.portal_sales_imports, public.portal_sales_daily from public, anon, authenticated;
grant select on public.portal_sales_imports, public.portal_sales_daily to authenticated;
create function public.portal_sales_can_read(p_store_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.portal_access_allowed() and exists (
    select 1 from public.portal_members m join auth.users u on u.id=m.user_id
    where m.user_id=auth.uid() and m.status='approved' and m.email=lower(u.email)
      and u.email_confirmed_at is not null and m.role in ('manager','company','system')
      and (m.role in ('company','system') or
        (m.store_id is not null and (p_store_id is null or p_store_id=m.store_id)))
  );
$$;
revoke all on function public.portal_sales_can_read(text) from public, anon, authenticated;
grant execute on function public.portal_sales_can_read(text) to authenticated;
create policy sales_headers_finance_role on public.portal_sales_imports for select to authenticated
  using (public.portal_sales_can_read(null));
create policy sales_rows_store_scope on public.portal_sales_daily for select to authenticated
  using (public.portal_sales_can_read(store_id));
commit;
