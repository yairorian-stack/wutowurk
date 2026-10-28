-- Additive migration: retain the original imported snapshots and all auth policies.
begin;
create table public.portal_sales_records (
  store_id text not null check (store_id in ('honten','816')),
  sales_date date not null,
  sales_jpy bigint check (sales_jpy between 0 and 10000000000),
  reported_yoy numeric(8,2),
  labor_minutes integer check (labor_minutes between 0 and 600000),
  updated_at timestamptz not null default now(),
  primary key(store_id,sales_date)
);
-- Preserve every historical store/day, including days absent from the newest batch.
insert into public.portal_sales_records(store_id,sales_date,sales_jpy,reported_yoy)
select distinct on (d.store_id,d.sales_date) d.store_id,d.sales_date,d.sales_jpy,d.reported_yoy
from public.portal_sales_daily d join public.portal_sales_imports b on b.id=d.batch_id
where d.sales_date<=b.as_of order by d.store_id,d.sales_date,b.imported_at desc,b.id desc;
create table public.portal_cash_months (
  store_id text not null check(store_id='honten'), month date not null check(extract(day from month)=1),
  opening_jpy bigint not null, updated_at timestamptz not null default now(), primary key(store_id,month)
);
create table public.portal_cash_records (
  store_id text not null check(store_id='honten'), source_key text not null check(length(source_key) between 1 and 200),
  transaction_date date not null, source_order integer not null check(source_order>0),
  category text not null check(length(category) between 1 and 100), description text not null check(length(description)<=500),
  receipt_jpy bigint not null check(receipt_jpy between 0 and 10000000000),
  payment_jpy bigint not null check(payment_jpy between 0 and 10000000000), balance_jpy bigint not null,
  active boolean not null default true, updated_at timestamptz not null default now(),
  primary key(store_id,source_key), check(receipt_jpy+payment_jpy>0 and (receipt_jpy=0 or payment_jpy=0))
);
create table public.portal_sync_runs (
  run_id text primary key check(length(run_id) between 1 and 100), attempted_at timestamptz not null default now(),
  last_success_at timestamptz, status text not null check(status in ('success','warning','failed')),
  message_code text not null check(message_code in ('HANOURA_YEAR_PENDING','SOURCE_VALIDATION_FAILED','SYNC_FAILED')),
  sales_count integer not null default 0, cash_count integer not null default 0
);
-- Private rollback evidence, never exposed to any portal user or the browser.
create table public.portal_sync_audit (run_id text primary key, payload jsonb not null, recorded_at timestamptz not null default now());
alter table public.portal_sales_records enable row level security;
alter table public.portal_cash_months enable row level security;
alter table public.portal_cash_records enable row level security;
alter table public.portal_sync_runs enable row level security;
alter table public.portal_sync_audit enable row level security;
revoke all on public.portal_sales_records,public.portal_cash_months,public.portal_cash_records,public.portal_sync_runs,public.portal_sync_audit from public,anon,authenticated;
grant select on public.portal_sales_records,public.portal_cash_months,public.portal_cash_records,public.portal_sync_runs to authenticated;
create policy sales_records_scope on public.portal_sales_records for select to authenticated using(public.portal_sales_can_read(store_id));
create policy cash_month_scope on public.portal_cash_months for select to authenticated using(public.portal_sales_can_read(store_id));
create policy cash_records_scope on public.portal_cash_records for select to authenticated using(active and public.portal_sales_can_read(store_id));
create policy sync_runs_scope on public.portal_sync_runs for select to authenticated using(public.portal_sales_can_read(null));
create function public.portal_apply_sheets_sync(p_run_id text,p_sales jsonb,p_cash jsonb,p_cash_month date,p_opening bigint) returns void
language plpgsql security definer set search_path='' as $$
declare old_count integer; old_last date;
begin
  lock table public.portal_sales_records,public.portal_cash_records in share row exclusive mode;
  if exists(select 1 from public.portal_sync_runs where run_id=p_run_id and last_success_at is not null) then return; end if;
  if p_run_id is null or length(p_run_id) not between 1 and 100 or p_opening is null or p_cash_month is null or extract(day from p_cash_month)<>1
    or p_opening not between -10000000000 and 10000000000
    or jsonb_typeof(p_sales)<>'array' or jsonb_typeof(p_cash)<>'array'
    or jsonb_array_length(p_sales) not between 1 and 3000 or jsonb_array_length(p_cash) not between 1 and 5000 then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
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
  if exists(select 1 from jsonb_to_recordset(p_cash) as x(store_id text,source_key text,transaction_date date,source_order integer,receipt_jpy bigint,payment_jpy bigint,balance_jpy bigint,category text,description text)
    where store_id is distinct from 'honten' or source_key is null or length(source_key) not between 1 and 200 or source_order is null or source_order<=0
    or transaction_date is null or date_trunc('month',transaction_date)::date<>p_cash_month or transaction_date>(now() at time zone 'Asia/Tokyo')::date
    or receipt_jpy is null or payment_jpy is null or receipt_jpy not between 0 and 10000000000 or payment_jpy not between 0 and 10000000000
    or receipt_jpy+payment_jpy<=0 or (receipt_jpy>0 and payment_jpy>0) or balance_jpy is null or balance_jpy not between -10000000000 and 10000000000 or category is null or length(category) not between 1 and 100 or description is null or length(description)>500)
    or exists(select 1 from jsonb_to_recordset(p_cash) as x(source_key text) group by source_key having count(*)>1)
    or exists(select 1 from jsonb_to_recordset(p_cash) as x(source_order integer) group by source_order having count(*)>1)
    then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  if exists(select 1 from (
    select balance_jpy,p_opening+sum(receipt_jpy-payment_jpy) over(order by source_order) expected,
      transaction_date,lag(transaction_date) over(order by source_order) previous
    from jsonb_to_recordset(p_cash) as x(source_order integer,receipt_jpy bigint,payment_jpy bigint,balance_jpy bigint,transaction_date date)
  ) t where balance_jpy<>expected or transaction_date<previous) then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  select count(*),max(transaction_date) into old_count,old_last from public.portal_cash_records where store_id='honten' and active and date_trunc('month',transaction_date)::date=p_cash_month;
  if jsonb_array_length(p_cash)<old_count or (select max(transaction_date) from jsonb_to_recordset(p_cash) as x(transaction_date date))<old_last then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  if exists(select 1 from jsonb_to_recordset(p_cash) as x(source_key text)
    join public.portal_cash_records r using(source_key) where date_trunc('month',r.transaction_date)::date<>p_cash_month) then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  -- If a preceding month's verified closing balance exists, reconcile the carry-forward.
  if exists(select 1 from public.portal_cash_records where active and store_id='honten' and transaction_date<p_cash_month and transaction_date>=(p_cash_month-interval '1 month')::date)
    and p_opening<>(select balance_jpy from public.portal_cash_records where active and store_id='honten' and transaction_date<p_cash_month and transaction_date>=(p_cash_month-interval '1 month')::date order by transaction_date desc,source_order desc limit 1) then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  -- A correction invalidates historical cumulative YoY values from that date onward.
  update public.portal_sales_records r set reported_yoy=null where exists(
    select 1 from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date,sales_jpy bigint)
    join public.portal_sales_records old on old.store_id=x.store_id and old.sales_date=x.sales_date
    where old.sales_jpy is distinct from x.sales_jpy and r.store_id=x.store_id and r.sales_date>=x.sales_date and date_trunc('month',r.sales_date)=date_trunc('month',x.sales_date));
  insert into public.portal_sales_records(store_id,sales_date,sales_jpy,labor_minutes)
    select store_id,sales_date,sales_jpy,labor_minutes from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date,sales_jpy bigint,labor_minutes integer)
    on conflict(store_id,sales_date) do update set sales_jpy=excluded.sales_jpy,labor_minutes=excluded.labor_minutes,updated_at=now();
  insert into public.portal_cash_months values('honten',p_cash_month,p_opening,now()) on conflict(store_id,month) do update set opening_jpy=excluded.opening_jpy,updated_at=now();
  -- Replace the current source-month atomically; keep superseded rows as inactive evidence.
  update public.portal_cash_records set active=false where store_id='honten' and date_trunc('month',transaction_date)::date=p_cash_month;
  insert into public.portal_cash_records(store_id,source_key,transaction_date,source_order,category,description,receipt_jpy,payment_jpy,balance_jpy)
    select store_id,source_key,transaction_date,source_order,category,description,receipt_jpy,payment_jpy,balance_jpy from jsonb_to_recordset(p_cash) as x(store_id text,source_key text,transaction_date date,source_order integer,category text,description text,receipt_jpy bigint,payment_jpy bigint,balance_jpy bigint)
    on conflict(store_id,source_key) do update set transaction_date=excluded.transaction_date,source_order=excluded.source_order,category=excluded.category,description=excluded.description,receipt_jpy=excluded.receipt_jpy,payment_jpy=excluded.payment_jpy,balance_jpy=excluded.balance_jpy,active=true,updated_at=now();
  insert into public.portal_sync_audit(run_id,payload) values(p_run_id,jsonb_build_object('sales',p_sales,'cash',p_cash,'month',p_cash_month,'opening',p_opening));
  insert into public.portal_sync_runs(run_id,last_success_at,status,message_code,sales_count,cash_count)
    values(p_run_id,now(),'warning','HANOURA_YEAR_PENDING',jsonb_array_length(p_sales),jsonb_array_length(p_cash))
    on conflict(run_id) do update set last_success_at=now(),status='warning',message_code='HANOURA_YEAR_PENDING',sales_count=excluded.sales_count,cash_count=excluded.cash_count;
end;
$$;
create function public.portal_record_sync_failure(p_run_id text,p_code text) returns void
language sql security definer set search_path='' as $$
  insert into public.portal_sync_runs(run_id,status,message_code)
  values(p_run_id,'failed',case when p_code='SOURCE_VALIDATION_FAILED' then p_code else 'SYNC_FAILED' end)
  on conflict(run_id) do nothing;
$$;
revoke all on function public.portal_apply_sheets_sync(text,jsonb,jsonb,date,bigint),public.portal_record_sync_failure(text,text) from public,anon,authenticated;
grant execute on function public.portal_apply_sheets_sync(text,jsonb,jsonb,date,bigint),public.portal_record_sync_failure(text,text) to service_role;
commit;
