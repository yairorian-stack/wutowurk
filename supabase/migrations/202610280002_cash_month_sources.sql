-- Apply AFTER 202610280001. Existing records are retained; auth/RLS helpers are unchanged.
begin;
alter table public.portal_cash_months drop constraint portal_cash_months_store_id_check;
alter table public.portal_cash_months add constraint portal_cash_months_store_id_check check(store_id in ('honten','816'));
alter table public.portal_cash_records drop constraint portal_cash_records_store_id_check;
alter table public.portal_cash_records add constraint portal_cash_records_store_id_check check(store_id in ('honten','816'));
alter table public.portal_cash_records add column month date generated always as (transaction_date-(extract(day from transaction_date)::integer-1)) stored;
alter table public.portal_cash_records drop constraint portal_cash_records_pkey;
alter table public.portal_cash_records add primary key(store_id,month,source_key);
create table public.portal_cash_sync_status (
  store_id text not null check(store_id in ('honten','816')), month date not null check(extract(day from month)=1),
  status text not null check(status in ('success','failed','blocked')), message_code text not null
    check(message_code in ('SYNC_OK','SOURCE_REVIEW_PENDING','SOURCE_VALIDATION_FAILED','SALES_MISMATCH','SYNC_FAILED','CROSSCHECK_PENDING')),
  attempted_at timestamptz not null default now(), last_success_at timestamptz,
  primary key(store_id,month)
);
alter table public.portal_cash_sync_status enable row level security;
revoke all on public.portal_cash_sync_status from public,anon,authenticated;
grant select on public.portal_cash_sync_status to authenticated;
create policy cash_status_scope on public.portal_cash_sync_status for select to authenticated using(public.portal_sales_can_read(store_id));
insert into public.portal_cash_sync_status(store_id,month,status,message_code)
  select store_id,month,'failed','CROSSCHECK_PENDING' from public.portal_cash_months;
-- Explicitly quarantine the known inconsistent months; no amounts or source IDs are seeded.
insert into public.portal_cash_sync_status(store_id,month,status,message_code) values
  ('816','2026-08-01','blocked','SOURCE_REVIEW_PENDING'),('816','2026-09-01','blocked','SOURCE_REVIEW_PENDING')
  on conflict(store_id,month) do update set status='blocked',message_code='SOURCE_REVIEW_PENDING';
-- Quarantined months expose warning metadata only, never raw amounts or openings.
drop policy cash_month_scope on public.portal_cash_months;
create policy cash_month_scope on public.portal_cash_months for select to authenticated using(public.portal_sales_can_read(store_id) and not exists(select 1 from public.portal_cash_sync_status s where s.store_id=portal_cash_months.store_id and s.month=portal_cash_months.month and s.status='blocked'));
drop policy cash_records_scope on public.portal_cash_records;
create policy cash_records_scope on public.portal_cash_records for select to authenticated using(active and public.portal_sales_can_read(store_id) and not exists(select 1 from public.portal_cash_sync_status s where s.store_id=portal_cash_records.store_id and s.month=portal_cash_records.month and s.status='blocked'));
alter table public.portal_sync_runs drop constraint portal_sync_runs_message_code_check;
alter table public.portal_sync_runs add constraint portal_sync_runs_message_code_check
  check(message_code in ('HANOURA_YEAR_PENDING','SOURCE_VALIDATION_FAILED','SYNC_FAILED','SYNC_OK','CASH_REVIEW_PENDING'));
-- The old all-or-nothing Honten RPC cannot bypass the new cross-check requirement.
revoke all on function public.portal_apply_sheets_sync(text,jsonb,jsonb,date,bigint) from service_role;
create function public.portal_apply_sales_sync(p_run_id text,p_sales jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  lock table public.portal_sales_records in share row exclusive mode;
  if exists(select 1 from public.portal_sync_audit where run_id=p_run_id||':sales') then return; end if;
  if p_run_id is null or length(p_run_id) not between 1 and 100 or p_sales is null or jsonb_typeof(p_sales)<>'array' or jsonb_array_length(p_sales) not between 1 and 3000 then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  if exists(select 1 from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date,sales_jpy bigint,labor_minutes integer)
    where store_id is null or store_id not in ('honten','816') or sales_date is null or sales_date<'2026-08-01' or sales_date>(now() at time zone 'Asia/Tokyo')::date or sales_jpy is null or sales_jpy not between 0 and 10000000000 or labor_minutes not between 0 and 600000)
    or exists(select 1 from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date) group by store_id,sales_date having count(*)>1)
    then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  -- Unexpected large historical corrections require manual review, never silent overwrite.
  if exists(select 1 from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date,sales_jpy bigint)
    join public.portal_sales_records r using(store_id,sales_date) where r.sales_jpy is not null
    and abs(r.sales_jpy-x.sales_jpy)>greatest(100000,r.sales_jpy*0.5)) then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  if exists(with incoming as (
      select store_id,sales_date,sales_jpy from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date,sales_jpy bigint)
    ), combined as (
      select r.store_id,r.sales_date,r.sales_jpy from public.portal_sales_records r where not exists(select 1 from incoming i where i.store_id=r.store_id and i.sales_date=r.sales_date)
      union all select * from incoming
    ) select 1 from combined group by store_id,date_trunc('month',sales_date) having sum(sales_jpy)>10000000000) then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  -- A correction invalidates historical cumulative YoY values from that date onward.
  update public.portal_sales_records r set reported_yoy=null where exists(
    select 1 from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date,sales_jpy bigint)
    join public.portal_sales_records old on old.store_id=x.store_id and old.sales_date=x.sales_date
    where old.sales_jpy is distinct from x.sales_jpy and r.store_id=x.store_id and r.sales_date>=x.sales_date and date_trunc('month',r.sales_date)=date_trunc('month',x.sales_date));
  insert into public.portal_sales_records(store_id,sales_date,sales_jpy,labor_minutes)
    select store_id,sales_date,sales_jpy,labor_minutes from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date,sales_jpy bigint,labor_minutes integer)
    on conflict(store_id,sales_date) do update set sales_jpy=excluded.sales_jpy,labor_minutes=excluded.labor_minutes,updated_at=now();

  insert into public.portal_sync_audit(run_id,payload) values(p_run_id||':sales',jsonb_build_object('sales',p_sales));
  insert into public.portal_sync_runs(run_id,last_success_at,status,message_code,sales_count)
    values(p_run_id,now(),'warning','CASH_REVIEW_PENDING',jsonb_array_length(p_sales))
    on conflict(run_id) do update set last_success_at=now(),status='warning',message_code='CASH_REVIEW_PENDING',sales_count=excluded.sales_count;
end;
$$;
create function public.portal_record_cash_failure(p_store_id text,p_month date,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_store_id is null or p_store_id not in ('honten','816') or p_month is null or extract(day from p_month)<>1 then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  insert into public.portal_cash_sync_status(store_id,month,status,message_code)
    values(p_store_id,p_month,'failed',case when p_code in ('SOURCE_VALIDATION_FAILED','SALES_MISMATCH') then p_code else 'SYNC_FAILED' end)
    on conflict(store_id,month) do update set status=case when portal_cash_sync_status.status='blocked' then 'blocked' else 'failed' end,
      message_code=case when portal_cash_sync_status.status='blocked' then 'SOURCE_REVIEW_PENDING' else excluded.message_code end,attempted_at=now();
end;
$$;
create function public.portal_apply_cash_month(p_run_id text,p_store_id text,p_month date,p_opening bigint,p_rows jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare old_count integer; old_last date; problem text;
begin
  if p_run_id is null or length(p_run_id) not between 1 and 100 or p_store_id is null or p_store_id not in ('honten','816') or p_month is null or extract(day from p_month)<>1 then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  lock table public.portal_sales_records,public.portal_cash_records in share row exclusive mode;
  if exists(select 1 from public.portal_sync_audit where run_id=p_run_id||':cash:'||p_store_id||':'||p_month::text) then return true; end if;
  begin
    if exists(select 1 from public.portal_cash_sync_status where store_id=p_store_id and month=p_month and status='blocked') then raise exception 'SOURCE_REVIEW_PENDING'; end if;
    if p_opening is null or p_opening not between -10000000000 and 10000000000 or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 5000 then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
    if exists(select 1 from jsonb_to_recordset(p_rows) as x(store_id text,source_key text,transaction_date date,source_order integer,receipt_jpy bigint,payment_jpy bigint,balance_jpy bigint,category text,description text)
      where store_id is distinct from p_store_id or source_key is null or length(source_key) not between 1 and 200 or source_order is null or source_order<=0
      or transaction_date is null or date_trunc('month',transaction_date)::date<>p_month or transaction_date>(now() at time zone 'Asia/Tokyo')::date
      or receipt_jpy is null or payment_jpy is null or receipt_jpy not between 0 and 10000000000 or payment_jpy not between 0 and 10000000000
      or receipt_jpy+payment_jpy<=0 or (receipt_jpy>0 and payment_jpy>0) or balance_jpy is null or balance_jpy not between -10000000000 and 10000000000
      or category is null or length(category) not between 1 and 100 or description is null or length(description)>500)
      or exists(select 1 from jsonb_to_recordset(p_rows) as x(source_key text) group by source_key having count(*)>1)
      or exists(select 1 from jsonb_to_recordset(p_rows) as x(source_order integer) group by source_order having count(*)>1)
      then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
    if exists(select 1 from (
      select balance_jpy,p_opening+sum(receipt_jpy-payment_jpy) over(order by source_order) expected,
        transaction_date,lag(transaction_date) over(order by source_order) previous
      from jsonb_to_recordset(p_rows) as x(source_order integer,receipt_jpy bigint,payment_jpy bigint,balance_jpy bigint,transaction_date date)
    ) t where balance_jpy<>expected or transaction_date<previous) then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
    -- Every dated cashbook day must agree with the independently imported daily report.
    if exists(select 1 from (
      select transaction_date,sum(case when category='売上' then receipt_jpy-payment_jpy else 0 end) sale
      from jsonb_to_recordset(p_rows) as x(transaction_date date,category text,receipt_jpy bigint,payment_jpy bigint) group by transaction_date
    ) x left join public.portal_sales_records s on s.store_id=p_store_id and s.sales_date=x.transaction_date
      where s.sales_jpy is null or s.sales_jpy<>x.sale) then raise exception 'SALES_MISMATCH'; end if;
    select count(*),max(transaction_date) into old_count,old_last from public.portal_cash_records where store_id=p_store_id and active and month=p_month;
    if jsonb_array_length(p_rows)<old_count or (select max(transaction_date) from jsonb_to_recordset(p_rows) as x(transaction_date date))<old_last then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
    if exists(select 1 from public.portal_cash_records where active and store_id=p_store_id and transaction_date<p_month and transaction_date>=(p_month-interval '1 month')::date)
      and p_opening<>(select balance_jpy from public.portal_cash_records where active and store_id=p_store_id and transaction_date<p_month and transaction_date>=(p_month-interval '1 month')::date order by transaction_date desc,source_order desc limit 1) then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
    insert into public.portal_cash_months values(p_store_id,p_month,p_opening,now()) on conflict(store_id,month) do update set opening_jpy=excluded.opening_jpy,updated_at=now();
    update public.portal_cash_records set active=false where store_id=p_store_id and month=p_month;
    insert into public.portal_cash_records(store_id,source_key,transaction_date,source_order,category,description,receipt_jpy,payment_jpy,balance_jpy)
      select store_id,source_key,transaction_date,source_order,category,description,receipt_jpy,payment_jpy,balance_jpy from jsonb_to_recordset(p_rows) as x(store_id text,source_key text,transaction_date date,source_order integer,category text,description text,receipt_jpy bigint,payment_jpy bigint,balance_jpy bigint)
      on conflict(store_id,month,source_key) do update set transaction_date=excluded.transaction_date,source_order=excluded.source_order,category=excluded.category,description=excluded.description,receipt_jpy=excluded.receipt_jpy,payment_jpy=excluded.payment_jpy,balance_jpy=excluded.balance_jpy,active=true,updated_at=now();
    insert into public.portal_sync_audit(run_id,payload) values(p_run_id||':cash:'||p_store_id||':'||p_month::text,jsonb_build_object('store',p_store_id,'month',p_month,'opening',p_opening,'rows',p_rows));
    insert into public.portal_cash_sync_status(store_id,month,status,message_code,last_success_at)
      values(p_store_id,p_month,'success','SYNC_OK',now()) on conflict(store_id,month) do update set status='success',message_code='SYNC_OK',attempted_at=now(),last_success_at=now();
    return true;
  exception when others then
    problem:=case when sqlerrm='SALES_MISMATCH' then 'SALES_MISMATCH' else 'SOURCE_VALIDATION_FAILED' end;
    perform public.portal_record_cash_failure(p_store_id,p_month,problem);
    return false;
  end;
end;
$$;
create function public.portal_finish_sheets_run(p_run_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare warning boolean;
begin
  if not exists(select 1 from public.portal_sync_audit where run_id=p_run_id||':sales') then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  select exists(select 1 from public.portal_cash_sync_status where status<>'success') into warning;
  update public.portal_sync_runs set status=case when warning then 'warning' else 'success' end,
    message_code=case when warning then 'CASH_REVIEW_PENDING' else 'SYNC_OK' end,
    cash_count=(select count(*) from public.portal_cash_records where active) where run_id=p_run_id;
  return not warning;
end;
$$;
revoke all on function public.portal_apply_sales_sync(text,jsonb),public.portal_apply_cash_month(text,text,date,bigint,jsonb),public.portal_record_cash_failure(text,date,text),public.portal_finish_sheets_run(text) from public,anon,authenticated;
grant execute on function public.portal_apply_sales_sync(text,jsonb),public.portal_apply_cash_month(text,text,date,bigint,jsonb),public.portal_record_cash_failure(text,date,text),public.portal_finish_sheets_run(text) to service_role;
commit;
