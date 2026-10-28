-- Store-manager daily reports. These records stay separate from the Google Sheets
-- import so a later import cannot erase a report entered in the portal.
create table public.portal_manager_daily_reports (
  store_id text not null check (store_id in ('honten','816')),
  report_date date not null,
  sales_jpy bigint not null check (sales_jpy between 0 and 10000000000),
  cash_sales_jpy bigint not null check (cash_sales_jpy between 0 and 10000000000),
  credit_sales_jpy bigint not null check (credit_sales_jpy between 0 and 10000000000),
  qr_sales_jpy bigint not null check (qr_sales_jpy between 0 and 10000000000),
  gift_certificate_jpy bigint not null check (gift_certificate_jpy between 0 and 10000000000),
  other_cashless_jpy bigint not null check (other_cashless_jpy between 0 and 10000000000),
  labor_minutes integer not null check (labor_minutes between 0 and 600000),
  voucher_count integer not null default 0 check (voucher_count between 0 and 100000),
  voucher_discount_jpy bigint not null default 0 check (voucher_discount_jpy between 0 and 10000000000),
  memo text not null default '' check (length(memo) <= 1200),
  submitted_by uuid not null references auth.users(id),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, report_date),
  constraint manager_daily_tender_total check (
    sales_jpy = cash_sales_jpy + credit_sales_jpy + qr_sales_jpy
      + gift_certificate_jpy + other_cashless_jpy
  )
);

create table public.portal_manager_cash_expenses (
  id uuid primary key default gen_random_uuid(),
  store_id text not null check (store_id in ('honten','816')),
  report_date date not null,
  sort_order integer not null check (sort_order between 1 and 30),
  category text not null check (length(btrim(category)) between 1 and 80),
  description text not null check (length(btrim(description)) between 1 and 200),
  amount_jpy bigint not null check (amount_jpy between 1 and 100000000),
  submitted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, report_date, sort_order),
  foreign key (store_id, report_date)
    references public.portal_manager_daily_reports(store_id, report_date)
    on delete cascade
);

create table public.portal_manager_daily_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  store_id text not null check (store_id in ('honten','816')),
  report_date date not null,
  revision integer not null check (revision > 0),
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.portal_manager_daily_reports enable row level security;
alter table public.portal_manager_cash_expenses enable row level security;
alter table public.portal_manager_daily_audit enable row level security;

revoke all on public.portal_manager_daily_reports,
  public.portal_manager_cash_expenses,
  public.portal_manager_daily_audit from public, anon, authenticated;
grant select on public.portal_manager_daily_reports,
  public.portal_manager_cash_expenses,
  public.portal_manager_daily_audit to authenticated;

create function public.portal_manager_can_edit(p_store_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_members m
    join auth.users u on u.id = m.user_id
    where m.user_id = auth.uid()
      and m.status = 'approved'
      and u.email_confirmed_at is not null
      and lower(u.email) = m.email
      and (
        m.role in ('company','system')
        or (m.role = 'manager' and m.store_id = p_store_id)
      )
  );
$$;

revoke all on function public.portal_manager_can_edit(text) from public, anon, authenticated;
grant execute on function public.portal_manager_can_edit(text) to authenticated;

create policy manager_daily_read_scope
  on public.portal_manager_daily_reports for select to authenticated
  using (public.portal_sales_can_read(store_id));
create policy manager_expense_read_scope
  on public.portal_manager_cash_expenses for select to authenticated
  using (public.portal_sales_can_read(store_id));
create policy manager_daily_audit_scope
  on public.portal_manager_daily_audit for select to authenticated
  using (public.portal_manager_can_edit(store_id));

create function public.portal_submit_manager_daily(
  p_store_id text,
  p_report_date date,
  p_cash_sales_jpy bigint,
  p_credit_sales_jpy bigint,
  p_qr_sales_jpy bigint,
  p_gift_certificate_jpy bigint,
  p_other_cashless_jpy bigint,
  p_labor_minutes integer,
  p_voucher_count integer,
  p_voucher_discount_jpy bigint,
  p_memo text,
  p_expenses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid := auth.uid();
  total_sales bigint;
  next_revision integer;
  before_report jsonb;
  before_expenses jsonb;
  saved_report public.portal_manager_daily_reports;
  saved_expenses jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('portal-manager-daily:' || coalesce(p_store_id,'') || ':' || coalesce(p_report_date::text,'')));
  if who is null or not public.portal_manager_can_edit(p_store_id) then
    raise exception 'manager access required' using errcode = '42501';
  end if;
  if p_store_id is null
    or p_store_id not in ('honten','816')
    or p_report_date is null
    or p_report_date < date '2026-08-01'
    or p_report_date > (now() at time zone 'Asia/Tokyo')::date
    or coalesce(p_cash_sales_jpy,-1) not between 0 and 10000000000
    or coalesce(p_credit_sales_jpy,-1) not between 0 and 10000000000
    or coalesce(p_qr_sales_jpy,-1) not between 0 and 10000000000
    or coalesce(p_gift_certificate_jpy,-1) not between 0 and 10000000000
    or coalesce(p_other_cashless_jpy,-1) not between 0 and 10000000000
    or coalesce(p_labor_minutes,-1) not between 0 and 600000
    or coalesce(p_voucher_count,-1) not between 0 and 100000
    or coalesce(p_voucher_discount_jpy,-1) not between 0 and 10000000000
    or p_memo is null
    or length(p_memo) > 1200
    or p_expenses is null
    or jsonb_typeof(p_expenses) <> 'array'
    or jsonb_array_length(p_expenses) > 30
  then
    raise exception 'invalid manager daily report';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_expenses)
      as x(category text, description text, amount_jpy bigint)
    where category is null
      or description is null
      or amount_jpy is null
      or length(btrim(category)) not between 1 and 80
      or length(btrim(description)) not between 1 and 200
      or category ~ '[[:cntrl:]]'
      or description ~ '[[:cntrl:]]'
      or amount_jpy not between 1 and 100000000
  ) then
    raise exception 'invalid cash expense';
  end if;

  total_sales := p_cash_sales_jpy + p_credit_sales_jpy + p_qr_sales_jpy
    + p_gift_certificate_jpy + p_other_cashless_jpy;
  if total_sales > 10000000000 then
    raise exception 'invalid sales total';
  end if;

  select to_jsonb(r), r.revision + 1
    into before_report, next_revision
    from public.portal_manager_daily_reports r
    where r.store_id = p_store_id and r.report_date = p_report_date
    for update;
  if next_revision is null then next_revision := 1; end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.sort_order), '[]'::jsonb)
    into before_expenses
    from public.portal_manager_cash_expenses e
    where e.store_id = p_store_id and e.report_date = p_report_date;

  insert into public.portal_manager_daily_reports (
    store_id, report_date, sales_jpy, cash_sales_jpy, credit_sales_jpy,
    qr_sales_jpy, gift_certificate_jpy, other_cashless_jpy, labor_minutes,
    voucher_count, voucher_discount_jpy, memo, submitted_by, revision
  ) values (
    p_store_id, p_report_date, total_sales, p_cash_sales_jpy, p_credit_sales_jpy,
    p_qr_sales_jpy, p_gift_certificate_jpy, p_other_cashless_jpy, p_labor_minutes,
    p_voucher_count, p_voucher_discount_jpy, btrim(p_memo), who, next_revision
  )
  on conflict (store_id, report_date) do update set
    sales_jpy = excluded.sales_jpy,
    cash_sales_jpy = excluded.cash_sales_jpy,
    credit_sales_jpy = excluded.credit_sales_jpy,
    qr_sales_jpy = excluded.qr_sales_jpy,
    gift_certificate_jpy = excluded.gift_certificate_jpy,
    other_cashless_jpy = excluded.other_cashless_jpy,
    labor_minutes = excluded.labor_minutes,
    voucher_count = excluded.voucher_count,
    voucher_discount_jpy = excluded.voucher_discount_jpy,
    memo = excluded.memo,
    submitted_by = excluded.submitted_by,
    revision = excluded.revision,
    updated_at = now()
  returning * into saved_report;

  delete from public.portal_manager_cash_expenses
    where store_id = p_store_id and report_date = p_report_date;
  insert into public.portal_manager_cash_expenses (
    store_id, report_date, sort_order, category, description, amount_jpy, submitted_by
  )
  select p_store_id, p_report_date, item.ordinality::integer, btrim(x.category),
    btrim(x.description), x.amount_jpy, who
  from jsonb_array_elements(p_expenses) with ordinality as item(value, ordinality)
  cross join lateral jsonb_to_record(item.value)
    as x(category text, description text, amount_jpy bigint);

  select coalesce(jsonb_agg(to_jsonb(e) order by e.sort_order), '[]'::jsonb)
    into saved_expenses
    from public.portal_manager_cash_expenses e
    where e.store_id = p_store_id and e.report_date = p_report_date;
  insert into public.portal_manager_daily_audit (
    actor_id, store_id, report_date, revision, before_value, after_value
  ) values (
    who, p_store_id, p_report_date, next_revision,
    case when before_report is null then null else jsonb_build_object('report', before_report, 'expenses', before_expenses) end,
    jsonb_build_object('report', to_jsonb(saved_report), 'expenses', saved_expenses)
  );
  return jsonb_build_object('report', to_jsonb(saved_report), 'expenses', saved_expenses);
end;
$$;

revoke all on function public.portal_submit_manager_daily(
  text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,bigint,text,jsonb
) from public, anon, authenticated;
grant execute on function public.portal_submit_manager_daily(
  text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,bigint,text,jsonb
) to authenticated;
