-- Update mentor search for the current Learner / Mentor / Both roles.
-- The older verification SQL filtered for role='tutor' and only Classes 11–12,
-- which makes current verified mentor profiles disappear from search.
-- Run in Supabase SQL Editor as the project owner.

create or replace function public.get_verified_tutor_directory(
  p_state text default null,
  p_city text default null
)
returns table (
  user_id uuid,
  display_name text,
  grade smallint,
  school text,
  city text,
  state text,
  country text,
  headline text,
  subjects text[],
  verified boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view mentors';
  end if;

  return query
  select
    tp.user_id,
    p.display_name,
    p.grade,
    loc.school,
    loc.city,
    loc.state,
    loc.country,
    tp.headline,
    coalesce(tp.subjects, array[]::text[]),
    true
  from public.tutor_profiles tp
  join public.profiles p on p.id = tp.user_id
  join public.profile_locations loc on loc.user_id = tp.user_id
  where tp.is_available is true
    and p.role in ('mentor', 'both', 'tutor')
    and exists (
      select 1
      from public.tutor_verification_requests vr
      where vr.user_id = tp.user_id
        and vr.status = 'verified'
    )
    and (p_state is null or lower(trim(loc.state)) = lower(trim(p_state)))
    and (p_city is null or lower(trim(loc.city)) = lower(trim(p_city)))
  order by tp.created_at desc;
end;
$$;

revoke all on function public.get_verified_tutor_directory(text, text) from public, anon;
grant execute on function public.get_verified_tutor_directory(text, text) to authenticated;
