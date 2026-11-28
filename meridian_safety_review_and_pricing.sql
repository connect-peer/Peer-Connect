-- Meridian safety reviewer access and mentor price choices.
-- This does not add anyone to verification_admins. Existing team admins in
-- that table are the only accounts this reviewer check will recognize.

begin;

create or replace function public.is_peer_connect_verification_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.verification_admins as reviewer
    where reviewer.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_peer_connect_verification_admin() from public, anon, authenticated;
grant execute on function public.is_peer_connect_verification_admin() to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tutor_profiles'::regclass
      and conname = 'tutor_profiles_meridian_price_check'
  ) then
    alter table public.tutor_profiles
      add constraint tutor_profiles_meridian_price_check
      check (session_price_inr in (99, 149)) not valid;
  end if;
end;
$$;

-- Existing mentor profile prices are mapped to the nearest of the two new
-- choices. Previously booked calls keep their own saved price.
update public.tutor_profiles
set session_price_inr = case
  when session_price_inr is null or session_price_inr <= 99 then 99
  else 149
end
where session_price_inr is distinct from case
  when session_price_inr is null or session_price_inr <= 99 then 99
  else 149
end;

alter table public.tutor_profiles
  validate constraint tutor_profiles_meridian_price_check;

commit;
