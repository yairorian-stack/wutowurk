-- Apply ONCE after 202610250001_membership.sql. No real identities are seeded.
begin;
create table public.portal_google_invitations (
  email text primary key check (email=lower(btrim(email)) and position('@' in email)>1),
  display_name text not null check (length(btrim(display_name)) between 1 and 80 and display_name !~ '[[:cntrl:]]'),
  job_title text not null check (job_title in ('総合責任者','店長業務','社員','パートアルバイト','他メンバー')),
  role text not null check (role in ('staff','manager','company','system')),
  store_id text check (store_id in ('honten','816')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (role in ('company','system') or store_id is not null)
);
alter table public.portal_google_invitations enable row level security;
revoke all on public.portal_google_invitations from public, anon, authenticated;
-- Only the project owner/privileged deployment migration manages the initial list.
-- Google accounts outside this list may exist in Auth but gain no portal access.
create function public.portal_google_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.portal_google_invitations i on i.email=lower(u.email) and i.enabled
    join auth.identities g on g.user_id=u.id and g.provider='google'
    where u.id=auth.uid() and u.email_confirmed_at is not null
      and lower(g.identity_data->>'email')=lower(u.email)
      and g.identity_data->>'email_verified'='true'
      -- Linked non-Google identities would make a generic oauth AMR ambiguous.
      and not exists (select 1 from auth.identities other where other.user_id=u.id and other.provider<>'google')
      and coalesce(auth.jwt()->'amr','[]'::jsonb) @> '[{"method":"oauth"}]'::jsonb
      and coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
  );
$$;
revoke all on function public.portal_google_allowed() from public, anon, authenticated;
grant execute on function public.portal_google_allowed() to authenticated;

create or replace function public.portal_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.portal_google_allowed() and exists (
    select 1 from public.portal_members m join auth.users u on u.id=m.user_id
    where m.user_id=auth.uid() and m.status='approved' and m.role in ('company','system')
      and u.email_confirmed_at is not null and lower(u.email)=m.email
  );
$$;
drop policy member_self_or_admin on public.portal_members;
create policy member_self_or_admin on public.portal_members for select to authenticated
  using (public.portal_google_allowed() and (user_id=auth.uid() or public.portal_is_admin()));
-- The existing audit policy delegates to portal_is_admin, which now also checks Google + allowlist.
-- Retire the old email-OTP enrollment function; do not drop existing staff or audit records.
revoke execute on function public.portal_request_access(text) from public, anon, authenticated;

create function public.portal_accept_google_invitation(p_display_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare who uuid := auth.uid(); invite public.portal_google_invitations; member public.portal_members;
  address text; old_value jsonb; changed boolean := false;
begin
  perform pg_advisory_xact_lock(21461025);
  if not public.portal_google_allowed() then raise exception 'invited verified Google account required'; end if;
  select lower(email) into address from auth.users where id=who;
  select * into invite from public.portal_google_invitations where email=address and enabled for share;
  if not found then raise exception 'invitation unavailable'; end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 or p_display_name ~ '[[:cntrl:]]'
     or regexp_replace(normalize(p_display_name,NFKC),'[[:space:]]','','g') <>
        regexp_replace(normalize(invite.display_name,NFKC),'[[:space:]]','','g') then raise exception 'registered name required'; end if;
  select * into member from public.portal_members where user_id=who for update;
  if not found then
    insert into public.portal_members(user_id,email,display_name,job_title,role,store_id,status)
      values(who,address,invite.display_name,invite.job_title,invite.role,invite.store_id,'approved') returning * into member;
    changed := true;
  elsif member.email<>address or member.status='disabled' then
    raise exception 'member unavailable';
  elsif member.status='pending' then
    old_value := to_jsonb(member);
    update public.portal_members set display_name=invite.display_name,job_title=invite.job_title,
      role=invite.role,store_id=invite.store_id,status='approved',updated_at=now()
      where user_id=who returning * into member;
    changed := true;
  end if;
  -- An existing approved member keeps administrator-managed role, store and status.
  if changed then
    insert into public.portal_member_audit(actor_id,target_id,operation,before_value,after_value)
      values(who,who,'accept_google_invitation',old_value,to_jsonb(member));
  end if;
  return to_jsonb(member);
end;
$$;
revoke all on function public.portal_accept_google_invitation(text) from public, anon, authenticated;
grant execute on function public.portal_accept_google_invitation(text) to authenticated;
-- Count only enabled invited administrators when protecting the last administrator.
create or replace function public.portal_manage_member(p_user_id uuid,p_job_title text,p_role text,p_store_id text,p_status text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor public.portal_members; target public.portal_members; before_value jsonb;
begin
  perform pg_advisory_xact_lock(21461025);
  if not public.portal_is_admin() then raise exception 'administrator required'; end if;
  select * into actor from public.portal_members where user_id=auth.uid();
  select * into target from public.portal_members where user_id=p_user_id for update;
  if not found then raise exception 'member not found'; end if;
  if actor.role <> 'system' and (target.role in ('company','system') or p_role in ('company','system')) then raise exception 'system administrator required'; end if;
  if target.status='approved' and target.role in ('company','system') and (p_status <> 'approved' or p_role not in ('company','system'))
    and (select count(*) from public.portal_members m join auth.users u on u.id=m.user_id join public.portal_google_invitations i on i.email=m.email and i.enabled where m.status='approved' and m.role in ('company','system') and u.email_confirmed_at is not null and lower(u.email)=m.email) <= 1 then raise exception 'last administrator cannot be removed'; end if;
  before_value:=to_jsonb(target);
  update public.portal_members set job_title=p_job_title,role=p_role,store_id=p_store_id,status=p_status,updated_at=now() where user_id=p_user_id returning * into target;
  insert into public.portal_member_audit(actor_id,target_id,operation,before_value,after_value) values(actor.user_id,target.user_id,'manage_member',before_value,to_jsonb(target));
  return to_jsonb(target);
end;
$$;
revoke all on function public.portal_manage_member(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.portal_manage_member(uuid,text,text,text,text) to authenticated;

commit;
