-- Add optional tender descriptions without changing or deleting existing reports.
begin;

alter table public.portal_manager_daily_reports
  add column cash_sales_label text not null default '' check (length(cash_sales_label) <= 120),
  add column credit_sales_label text not null default '' check (length(credit_sales_label) <= 120),
  add column qr_sales_label text not null default '' check (length(qr_sales_label) <= 120),
  add column gift_certificate_label text not null default '' check (length(gift_certificate_label) <= 120),
  add column other_cashless_label text not null default '' check (length(other_cashless_label) <= 120);

create function public.portal_submit_manager_daily_v2(
  p_store_id text,
  p_report_date date,
  p_cash_sales_jpy bigint,
  p_cash_sales_label text,
  p_credit_sales_jpy bigint,
  p_credit_sales_label text,
  p_qr_sales_jpy bigint,
  p_qr_sales_label text,
  p_gift_certificate_jpy bigint,
  p_gift_certificate_label text,
  p_other_cashless_jpy bigint,
  p_other_cashless_label text,
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
    or p_cash_sales_label is null
    or p_credit_sales_label is null
    or p_qr_sales_label is null
    or p_gift_certificate_label is null
    or p_other_cashless_label is null
    or length(btrim(p_cash_sales_label)) > 120
    or length(btrim(p_credit_sales_label)) > 120
    or length(btrim(p_qr_sales_label)) > 120
    or length(btrim(p_gift_certificate_label)) > 120
    or length(btrim(p_other_cashless_label)) > 120
    or p_cash_sales_label ~ '[[:cntrl:]]'
    or p_credit_sales_label ~ '[[:cntrl:]]'
    or p_qr_sales_label ~ '[[:cntrl:]]'
    or p_gift_certificate_label ~ '[[:cntrl:]]'
    or p_other_cashless_label ~ '[[:cntrl:]]'
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
    store_id, report_date, sales_jpy, cash_sales_jpy, cash_sales_label,
    credit_sales_jpy, credit_sales_label, qr_sales_jpy, qr_sales_label,
    gift_certificate_jpy, gift_certificate_label, other_cashless_jpy,
    other_cashless_label, labor_minutes, voucher_count, voucher_discount_jpy,
    memo, submitted_by, revision
  ) values (
    p_store_id, p_report_date, total_sales, p_cash_sales_jpy,
    btrim(p_cash_sales_label), p_credit_sales_jpy, btrim(p_credit_sales_label),
    p_qr_sales_jpy, btrim(p_qr_sales_label), p_gift_certificate_jpy,
    btrim(p_gift_certificate_label), p_other_cashless_jpy,
    btrim(p_other_cashless_label), p_labor_minutes, p_voucher_count,
    p_voucher_discount_jpy, btrim(p_memo), who, next_revision
  )
  on conflict (store_id, report_date) do update set
    sales_jpy = excluded.sales_jpy,
    cash_sales_jpy = excluded.cash_sales_jpy,
    cash_sales_label = excluded.cash_sales_label,
    credit_sales_jpy = excluded.credit_sales_jpy,
    credit_sales_label = excluded.credit_sales_label,
    qr_sales_jpy = excluded.qr_sales_jpy,
    qr_sales_label = excluded.qr_sales_label,
    gift_certificate_jpy = excluded.gift_certificate_jpy,
    gift_certificate_label = excluded.gift_certificate_label,
    other_cashless_jpy = excluded.other_cashless_jpy,
    other_cashless_label = excluded.other_cashless_label,
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

revoke all on function public.portal_submit_manager_daily_v2(
  text,date,bigint,text,bigint,text,bigint,text,bigint,text,bigint,text,
  integer,integer,bigint,text,jsonb
) from public, anon, authenticated;
grant execute on function public.portal_submit_manager_daily_v2(
  text,date,bigint,text,bigint,text,bigint,text,bigint,text,bigint,text,
  integer,integer,bigint,text,jsonb
) to authenticated;

commit;
