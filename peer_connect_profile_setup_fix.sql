-- Fix Peer Connect profile setup persistence.
-- Apply once in Supabase SQL Editor. The function only edits the signed-in user's row.

-- The app reads this public profile field for account setup and profile headers.
-- The verification migration grants selected-column access, so explicitly add
-- the banner field that was missing from that allowlist.
grant select (profile_banner_url) on public.profiles to authenticated;

create or replace function public.save_peer_connect_profile(
  p_display_name text,
  p_grade smallint,
  p_role text,
  p_school text,
  p_city text,
  p_state text,
  p_country text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in again before saving your profile';
  end if;
  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 100 then
    raise exception 'Enter a name between 1 and 100 characters';
  end if;
  if p_grade is null or p_grade not between 9 and 12 then
    raise exception 'Choose a class from 9 to 12';
  end if;
  if p_role is null or p_role not in ('learner','mentor','both') then
    raise exception 'Choose Learner, Mentor, or Both';
  end if;
  if p_school is null or char_length(trim(p_school)) not between 1 and 180
     or p_city is null or char_length(trim(p_city)) not between 1 and 100
     or p_state is null or char_length(trim(p_state)) not between 1 and 100
     or p_country is null or char_length(trim(p_country)) not between 1 and 100 then
    raise exception 'Enter your school, city, state, and country';
  end if;

  update public.profiles
     set display_name = trim(p_display_name), grade = p_grade, role = p_role
   where id = v_user_id
   returning id into v_profile_id;
  if v_profile_id is null then
    raise exception 'Your account profile is missing. Sign out and create the profile again';
  end if;

  insert into public.profile_locations (user_id, school, city, state, country)
  values (v_user_id, trim(p_school), trim(p_city), trim(p_state), trim(p_country))
  on conflict (user_id) do update
    set school = excluded.school,
        city = excluded.city,
        state = excluded.state,
        country = excluded.country,
        updated_at = now();
end;
$$;

revoke all on function public.save_peer_connect_profile(text,smallint,text,text,text,text,text) from public, anon;
grant execute on function public.save_peer_connect_profile(text,smallint,text,text,text,text,text) to authenticated;
