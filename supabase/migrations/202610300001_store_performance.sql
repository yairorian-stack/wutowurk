-- Preserve reviewed cumulative YoY from the same Sheets snapshot as daily sales.
-- No changes to membership, RLS, grants or cash data.
begin;
create or replace function public.portal_apply_sales_sync(p_run_id text,p_sales jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  lock table public.portal_sales_records in share row exclusive mode;
  if exists(select 1 from public.portal_sync_audit where run_id=p_run_id||':sales') then return; end if;
  if p_run_id is null or length(p_run_id) not between 1 and 100 or p_sales is null or jsonb_typeof(p_sales)<>'array' or jsonb_array_length(p_sales) not between 1 and 3000 then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  if exists(select 1 from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date,sales_jpy bigint,labor_minutes integer)
    where store_id is null or store_id not in ('honten','816') or sales_date is null or sales_date<'2026-08-01' or sales_date>(now() at time zone 'Asia/Tokyo')::date or sales_jpy is null or sales_jpy not between 0 and 10000000000 or labor_minutes not between 0 and 600000)
    or exists(select 1 from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date) group by store_id,sales_date having count(*)>1)
    then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
  if exists(select 1 from jsonb_to_recordset(p_sales) as x(reported_yoy numeric)
    where reported_yoy not between 0 and 10000) then raise exception 'SOURCE_VALIDATION_FAILED'; end if;
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
  insert into public.portal_sales_records(store_id,sales_date,sales_jpy,labor_minutes,reported_yoy)
    select store_id,sales_date,sales_jpy,labor_minutes,reported_yoy from jsonb_to_recordset(p_sales) as x(store_id text,sales_date date,sales_jpy bigint,labor_minutes integer,reported_yoy numeric)
    on conflict(store_id,sales_date) do update set sales_jpy=excluded.sales_jpy,labor_minutes=excluded.labor_minutes,reported_yoy=excluded.reported_yoy,updated_at=now();

  insert into public.portal_sync_audit(run_id,payload) values(p_run_id||':sales',jsonb_build_object('sales',p_sales));
  insert into public.portal_sync_runs(run_id,last_success_at,status,message_code,sales_count)
    values(p_run_id,now(),'warning','CASH_REVIEW_PENDING',jsonb_array_length(p_sales))
    on conflict(run_id) do update set last_success_at=now(),status='warning',message_code='CASH_REVIEW_PENDING',sales_count=excluded.sales_count;
end;
$$;
commit;
