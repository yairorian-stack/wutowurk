-- Read scope is independent of edit/admin authority.
begin;
alter table public.portal_google_invitations add column read_all_stores boolean not null default false;
alter table public.portal_members add column read_all_stores boolean not null default false;
create function public.portal_copy_invited_read_scope() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.read_all_stores := coalesce((select read_all_stores from public.portal_google_invitations where email=new.email and enabled),false);
  return new;
end; $$;
revoke all on function public.portal_copy_invited_read_scope() from public,anon,authenticated;
create trigger portal_invited_read_scope before insert on public.portal_members
for each row execute function public.portal_copy_invited_read_scope();
create or replace function public.portal_sales_can_read(p_store_id text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.portal_access_allowed() and exists (
  select 1 from public.portal_members m join auth.users u on u.id=m.user_id
  where m.user_id=auth.uid() and m.status='approved' and m.email=lower(u.email)
   and u.email_confirmed_at is not null and m.role in ('staff','manager','company','system')
   and (p_store_id is null or m.role in ('company','system') or m.read_all_stores or m.store_id=p_store_id)
 );
$$;
revoke all on function public.portal_sales_can_read(text) from public,anon,authenticated;
grant execute on function public.portal_sales_can_read(text) to authenticated;
create or replace function public.portal_apply_staff_access_sync(p_run_id text, p_staff jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_value jsonb;
  added_count integer;
  updated_count integer;
  disabled_count integer;
  removed_count integer;
  target record;
  saved_member public.portal_members;
  before_value jsonb;
  after_value jsonb;
begin
  perform pg_advisory_xact_lock(21461028);
  if p_run_id is null
    or length(p_run_id) not between 1 and 100
    or p_staff is null
    or jsonb_typeof(p_staff) <> 'array'
    or jsonb_array_length(p_staff) not between 1 and 500
  then
    raise exception 'SOURCE_VALIDATION_FAILED';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_staff) as x(
      email text, display_name text, job_title text, role text,
      store_id text, enabled boolean, read_all_stores boolean
    )
    where email is null
      or email <> lower(btrim(email))
      or length(email) > 254
      or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or display_name is null
      or length(btrim(display_name)) not between 1 and 80
      or display_name ~ '[[:cntrl:]]'
      or job_title not in ('総合責任者','店長業務','社員','パートアルバイト','他メンバー')
      or role not in ('staff','manager','company','system')
      or enabled is null
      or (role in ('staff','manager') and store_id not in ('honten','816'))
      or (role in ('company','system') and store_id is not null)
  ) or exists (
    select 1
    from jsonb_to_recordset(p_staff) as x(email text)
    group by email having count(*) > 1
  ) or not exists (
    select 1
    from jsonb_to_recordset(p_staff) as x(role text, enabled boolean)
    where enabled and role in ('company','system')
  ) then
    raise exception 'SOURCE_VALIDATION_FAILED';
  end if;

  select result into result_value
    from public.portal_staff_access_sync_audit where run_id = p_run_id;
  if found then return result_value; end if;

  lock table public.portal_google_invitations,
    public.portal_members,
    public.portal_member_audit in share row exclusive mode;

  with incoming as (
    select * from jsonb_to_recordset(p_staff) as x(
      email text, display_name text, job_title text, role text,
      store_id text, enabled boolean, read_all_stores boolean
    )
  )
  select
    count(*) filter (where i.email is null),
    count(*) filter (
      where i.email is not null and (
        i.display_name is distinct from x.display_name
        or i.job_title is distinct from x.job_title
        or i.role is distinct from x.role
        or i.store_id is distinct from x.store_id
        or i.enabled is distinct from x.enabled
        or i.read_all_stores is distinct from coalesce(x.read_all_stores,false)
      )
    ),
    count(*) filter (where not x.enabled)
  into added_count, updated_count, disabled_count
  from incoming x
  left join public.portal_google_invitations i using (email);

  insert into public.portal_google_invitations(
    email, display_name, job_title, role, store_id, enabled, read_all_stores
  )
  select email, btrim(display_name), job_title, role, store_id, enabled, coalesce(read_all_stores,false)
  from jsonb_to_recordset(p_staff) as x(
    email text, display_name text, job_title text, role text,
    store_id text, enabled boolean, read_all_stores boolean
  )
  on conflict(email) do update set
    display_name = excluded.display_name,
    job_title = excluded.job_title,
    role = excluded.role,
    store_id = excluded.store_id,
    enabled = excluded.enabled,
    read_all_stores = excluded.read_all_stores;

  -- The sheet is a complete snapshot. Removed rows revoke invitations too.
  update public.portal_google_invitations i set enabled=false
  where i.enabled and not exists(select 1 from jsonb_to_recordset(p_staff) as x(email text) where x.email=i.email);
  get diagnostics removed_count = row_count;
  disabled_count := disabled_count + removed_count;

  for target in
    select m.*, x.display_name as next_name, x.job_title as next_title,
      x.role as next_role, x.store_id as next_store, x.enabled as next_enabled, coalesce(x.read_all_stores,false) as next_all
    from public.portal_members m
    join jsonb_to_recordset(p_staff) as x(
      email text, display_name text, job_title text, role text,
      store_id text, enabled boolean, read_all_stores boolean
    ) on x.email = m.email
    for update of m
  loop
    before_value := to_jsonb(target) - array[
      'next_name','next_title','next_role','next_store','next_enabled','next_all'
    ];
    if target.display_name is distinct from btrim(target.next_name)
      or target.job_title is distinct from target.next_title
      or target.role is distinct from target.next_role
      or target.store_id is distinct from target.next_store
      or target.read_all_stores is distinct from target.next_all
      or target.status is distinct from
        (case when target.next_enabled then 'approved' else 'disabled' end)
    then
      update public.portal_members set
        display_name = btrim(target.next_name),
        job_title = target.next_title,
        role = target.next_role,
        store_id = target.next_store,
        read_all_stores = target.next_all,
        status = case when target.next_enabled then 'approved' else 'disabled' end,
        updated_at = now()
      where user_id = target.user_id
      returning * into saved_member;
      after_value := to_jsonb(saved_member);
      insert into public.portal_member_audit(
        actor_id, target_id, operation, before_value, after_value
      ) values (
        null, target.user_id, 'staff_sheet_sync', before_value, after_value
      );
    end if;
  end loop;

  for target in
    select m.* from public.portal_members m
    join public.portal_google_invitations i on i.email=m.email
    where not i.enabled and m.status<>'disabled' for update of m
  loop
    before_value := to_jsonb(target);
    update public.portal_members set status='disabled', updated_at=now()
      where user_id=target.user_id returning * into saved_member;
    insert into public.portal_member_audit(actor_id,target_id,operation,before_value,after_value)
      values(null,target.user_id,'staff_sheet_sync',before_value,to_jsonb(saved_member));
  end loop;

  if not exists (
    select 1
    from public.portal_members m
    join auth.users u on u.id = m.user_id
    join public.portal_google_invitations i on i.email = m.email and i.enabled
    where m.status = 'approved'
      and m.role in ('company','system')
      and u.email_confirmed_at is not null
      and lower(u.email) = m.email
  ) then
    raise exception 'SOURCE_VALIDATION_FAILED';
  end if;

  result_value := jsonb_build_object(
    'added', added_count,
    'updated', updated_count,
    'disabled', disabled_count,
    'total', jsonb_array_length(p_staff)
  );
  insert into public.portal_staff_access_sync_audit(run_id,payload,result)
    values(p_run_id,p_staff,result_value);
  return result_value;
end;
$$;

revoke all on function public.portal_apply_staff_access_sync(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.portal_apply_staff_access_sync(text,jsonb)
  to service_role;

commit;
