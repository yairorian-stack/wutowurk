-- Apply to the private Supabase project. No staff identities or addresses are seeded.
create table public.portal_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  job_title text check (job_title in ('総合責任者','店長業務','社員','パートアルバイト','他メンバー')),
  role text not null default 'staff' check (role in ('staff','manager','company','system')),
  store_id text check (store_id in ('honten','816')),
  status text not null default 'pending' check (status in ('pending','approved','disabled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint approved_store_required check (status <> 'approved' or role in ('company','system') or store_id is not null),
  constraint approved_job_required check (status <> 'approved' or job_title is not null)
);
create table public.portal_member_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid, target_id uuid not null,
  operation text not null, before_value jsonb, after_value jsonb not null, created_at timestamptz not null default now()
);
alter table public.portal_members enable row level security;
alter table public.portal_member_audit enable row level security;
revoke all on public.portal_members, public.portal_member_audit from public, anon, authenticated;
grant select on public.portal_members, public.portal_member_audit to authenticated;

create function public.portal_is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.portal_members m join auth.users u on u.id=m.user_id
    where m.user_id=auth.uid() and m.status='approved' and m.role in ('company','system')
      and u.email_confirmed_at is not null and lower(u.email)=m.email
  );
$$;
revoke all on function public.portal_is_admin() from public, anon, authenticated;
grant execute on function public.portal_is_admin() to authenticated;
create policy member_self_or_admin on public.portal_members for select to authenticated using (user_id=auth.uid() or public.portal_is_admin());
create policy audit_admin_only on public.portal_member_audit for select to authenticated using (public.portal_is_admin());

create function public.portal_request_access(p_display_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare who uuid := auth.uid(); address text; row_value public.portal_members; old_value jsonb;
begin
  if who is null then raise exception 'authentication required'; end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 or p_display_name ~ '[[:cntrl:]]' then raise exception 'invalid name'; end if;
  select lower(email) into address from auth.users where id=who and email_confirmed_at is not null;
  if address is null then raise exception 'verified email required'; end if;
  insert into public.portal_members(user_id,email,display_name) values(who,address,btrim(p_display_name)) on conflict(user_id) do nothing;
  select * into row_value from public.portal_members where user_id=who for update;
  if row_value.status='pending' then
    old_value:=to_jsonb(row_value);
    update public.portal_members set display_name=btrim(p_display_name),email=address,updated_at=now() where user_id=who returning * into row_value;
    insert into public.portal_member_audit(actor_id,target_id,operation,before_value,after_value) values(who,who,'request_access',old_value,to_jsonb(row_value));
  end if;
  return to_jsonb(row_value);
end;
$$;
revoke all on function public.portal_request_access(text) from public, anon, authenticated;
grant execute on function public.portal_request_access(text) to authenticated;

create function public.portal_manage_member(p_user_id uuid,p_job_title text,p_role text,p_store_id text,p_status text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor public.portal_members; target public.portal_members; before_value jsonb;
begin
  perform pg_advisory_xact_lock(21461025);
  if not public.portal_is_admin() then raise exception 'administrator required'; end if;
  select * into actor from public.portal_members where user_id=auth.uid();
  select * into target from public.portal_members where user_id=p_user_id for update;
  if not found then raise exception 'member not found'; end if;
  if actor.role <> 'system' and (target.role in ('company','system') or p_role in ('company','system')) then raise exception 'system administrator required'; end if;
  if target.status='approved' and target.role in ('company','system') and (p_status <> 'approved' or p_role not in ('company','system'))
    and (select count(*) from public.portal_members m join auth.users u on u.id=m.user_id where m.status='approved' and m.role in ('company','system') and u.email_confirmed_at is not null and lower(u.email)=m.email) <= 1 then raise exception 'last administrator cannot be removed'; end if;
  before_value:=to_jsonb(target);
  update public.portal_members set job_title=p_job_title,role=p_role,store_id=p_store_id,status=p_status,updated_at=now() where user_id=p_user_id returning * into target;
  insert into public.portal_member_audit(actor_id,target_id,operation,before_value,after_value) values(actor.user_id,target.user_id,'manage_member',before_value,to_jsonb(target));
  return to_jsonb(target);
end;
$$;
revoke all on function public.portal_manage_member(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.portal_manage_member(uuid,text,text,text,text) to authenticated;
