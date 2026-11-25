-- Repair the ambiguous timezone column in session slot generation.
-- Run after peer_connect_v2_social_scheduling.sql in Supabase SQL Editor.

create or replace function public.get_peer_session_slots(
  p_mentor_id uuid,
  p_session_type_id uuid,
  p_from date,
  p_days integer default 14
)
returns table(starts_at timestamptz, ends_at timestamptz, timezone text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration integer;
  v_timezone text;
  v_date date;
  v_availability record;
  v_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to see session times'; end if;
  if p_days < 1 or p_days > 31 then raise exception 'Choose between 1 and 31 days'; end if;

  if not exists (
    select 1
    from public.connections as c
    where c.status = 'accepted'
      and ((c.requester_id = (select auth.uid()) and c.recipient_id = p_mentor_id)
        or (c.recipient_id = (select auth.uid()) and c.requester_id = p_mentor_id))
  ) then
    raise exception 'An accepted connection is required before viewing booking times';
  end if;

  -- Qualifying st.timezone avoids clashing with the function's output column
  -- named timezone.
  select st.duration_minutes, st.timezone
    into v_duration, v_timezone
  from public.peer_session_types as st
  where st.id = p_session_type_id
    and st.mentor_id = p_mentor_id
    and st.is_active;
  if not found then raise exception 'This session type is unavailable'; end if;

  for v_date in
    select generate_series(p_from, p_from + (p_days - 1), interval '1 day')::date
  loop
    for v_availability in
      select a.*
      from public.peer_weekly_availability as a
      where a.mentor_id = p_mentor_id
        and a.is_active
        and a.weekday = extract(isodow from v_date)::integer
        and a.timezone = v_timezone
    loop
      for v_local in
        select generate_series(
          v_date + v_availability.starts_at,
          v_date + v_availability.ends_at - make_interval(mins => v_duration),
          interval '15 minutes'
        )
      loop
        v_start := v_local at time zone v_timezone;
        v_end := v_start + make_interval(mins => v_duration);

        if v_start > now()
          and not exists (
            select 1
            from public.peer_blocked_times as b
            where b.mentor_id = p_mentor_id
              and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
          )
          and not exists (
            select 1
            from public.peer_sessions as s
            where s.mentor_id = p_mentor_id
              and s.status in ('pending', 'confirmed')
              and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
          )
          and not exists (
            select 1
            from public.peer_sessions as s
            where s.learner_id = (select auth.uid())
              and s.status in ('pending', 'confirmed')
              and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
          )
        then
          starts_at := v_start;
          ends_at := v_end;
          timezone := v_timezone;
          return next;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

revoke all on function public.get_peer_session_slots(uuid, uuid, date, integer) from public, anon;
grant execute on function public.get_peer_session_slots(uuid, uuid, date, integer) to authenticated;
