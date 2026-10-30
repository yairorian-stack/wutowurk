-- The public RPC never returns invitation membership or a delivery result.
-- Its only possible outbound destination is this project's Auth OTP endpoint.
begin;
create extension if not exists pg_net with schema extensions;
create table public.portal_staff_otp_config (
  singleton boolean primary key default true check(singleton),
  project_url text not null check(project_url ~ '^https://[a-z0-9]{20}\.supabase\.co$'),
  publishable_key text not null check(publishable_key ~ '^sb_publishable_[A-Za-z0-9_-]+$')
);
alter table public.portal_staff_otp_config enable row level security;
revoke all on public.portal_staff_otp_config from public,anon,authenticated;
create table public.portal_staff_otp_dispatch (
  request_id bigint primary key,
  recipient_hash text not null,
  requested_at timestamptz not null default now()
);
create index on public.portal_staff_otp_dispatch(requested_at);
alter table public.portal_staff_otp_dispatch enable row level security;
revoke all on public.portal_staff_otp_dispatch from public,anon,authenticated;

create function public.portal_staff_otp_ready() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.portal_staff_otp_config);
$$;
revoke all on function public.portal_staff_otp_ready() from public,anon,authenticated;
grant execute on function public.portal_staff_otp_ready() to anon,authenticated;

create function public.portal_request_staff_otp(p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare cfg public.portal_staff_otp_config; address_hash text; queued bigint;
begin
  if p_email is null or length(p_email)>254 or p_email<>lower(btrim(p_email))
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return; end if;
  -- Always return void, including for unlisted, disabled and limited addresses.
  if not exists(select 1 from public.portal_google_invitations where email=p_email and enabled)
    or exists(select 1 from public.portal_members where email=p_email and status='disabled') then return; end if;
  select * into cfg from public.portal_staff_otp_config;
  if not found then return; end if;
  perform pg_advisory_xact_lock(21461029);
  address_hash := encode(extensions.digest(p_email,'sha256'),'hex');
  delete from public.portal_staff_otp_dispatch where requested_at<now()-interval '24 hours';
  if exists(select 1 from public.portal_staff_otp_dispatch where recipient_hash=address_hash and requested_at>now()-interval '60 seconds')
    or (select count(*) from public.portal_staff_otp_dispatch where recipient_hash=address_hash and requested_at>now()-interval '1 hour')>=5
    or (select count(*) from public.portal_staff_otp_dispatch where requested_at>now()-interval '1 hour')>=30 then return; end if;
  queued := net.http_post(
    url := cfg.project_url || '/auth/v1/otp',
    body := jsonb_build_object('email',p_email,'create_user',true),
    headers := jsonb_build_object('Content-Type','application/json','apikey',cfg.publishable_key),
    timeout_milliseconds := 15000
  );
  insert into public.portal_staff_otp_dispatch(request_id,recipient_hash) values(queued,address_hash);
end;
$$;
revoke all on function public.portal_request_staff_otp(text) from public,anon,authenticated;
grant execute on function public.portal_request_staff_otp(text) to anon,authenticated;
commit;
