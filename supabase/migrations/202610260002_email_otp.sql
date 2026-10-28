-- Additive migration: retain Google OAuth and the existing private allowlist.
-- Apply once after 202610260001_google_allowlist.sql. No recipients are added here.
begin;
create or replace function public.portal_google_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.portal_google_invitations i on i.email=lower(u.email) and i.enabled
    join auth.identities g on g.user_id=u.id and g.provider='google'
    where u.id=auth.uid() and u.email_confirmed_at is not null
      and lower(g.identity_data->>'email')=lower(u.email)
      and g.identity_data->>'email_verified'='true'
      -- Email OTP is an approved alternative. Other OAuth providers remain excluded.
      and not exists (select 1 from auth.identities other where other.user_id=u.id and other.provider not in ('google','email'))
      and coalesce(auth.jwt()->'amr','[]'::jsonb) @> '[{"method":"oauth"}]'::jsonb
      and coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
  );
$$;
revoke all on function public.portal_google_allowed() from public, anon, authenticated;
grant execute on function public.portal_google_allowed() to authenticated;

create function public.portal_email_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.portal_google_invitations i on i.email=lower(u.email) and i.enabled
    where u.id=auth.uid() and u.email_confirmed_at is not null
      and coalesce(auth.jwt()->'amr','[]'::jsonb) @> '[{"method":"otp"}]'::jsonb
  );
$$;
revoke all on function public.portal_email_allowed() from public, anon, authenticated;
grant execute on function public.portal_email_allowed() to authenticated;
create function public.portal_access_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.portal_google_allowed() or public.portal_email_allowed();
$$;
revoke all on function public.portal_access_allowed() from public, anon, authenticated;
grant execute on function public.portal_access_allowed() to authenticated;
create or replace function public.portal_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.portal_access_allowed() and exists (
    select 1 from public.portal_members m join auth.users u on u.id=m.user_id
    where m.user_id=auth.uid() and m.status='approved' and m.role in ('company','system')
      and u.email_confirmed_at is not null and lower(u.email)=m.email
  );
$$;
drop policy member_self_or_admin on public.portal_members;
create policy member_self_or_admin on public.portal_members for select to authenticated
  using (public.portal_access_allowed() and (user_id=auth.uid() or public.portal_is_admin()));
create function public.portal_accept_email_invitation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare who uuid := auth.uid(); invite public.portal_google_invitations; member public.portal_members;
  address text; old_value jsonb; changed boolean := false;
begin
  perform pg_advisory_xact_lock(21461025);
  if not public.portal_email_allowed() then raise exception 'invited verified email OTP required'; end if;
  select lower(email) into address from auth.users where id=who;
  select * into invite from public.portal_google_invitations where email=address and enabled for share;
  if not found then raise exception 'invitation unavailable'; end if;
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
      values(who,who,'accept_email_invitation',old_value,to_jsonb(member));
  end if;
  return to_jsonb(member);
end;
$$;
revoke all on function public.portal_accept_email_invitation() from public, anon, authenticated;
grant execute on function public.portal_accept_email_invitation() to authenticated;

-- Public capability probe returns no addresses, membership, SMTP or configuration data.
create function public.portal_email_otp_ready() returns boolean language sql stable set search_path = '' as $$ select true; $$;
revoke all on function public.portal_email_otp_ready() from public, anon, authenticated;
grant execute on function public.portal_email_otp_ready() to anon, authenticated;
commit;
select count(*) as enabled_pilot_accounts,
  to_regprocedure('public.portal_access_allowed()') is not null as combined_guard_ready,
  to_regprocedure('public.portal_accept_email_invitation()') is not null as email_otp_ready
from public.portal_google_invitations where enabled;
