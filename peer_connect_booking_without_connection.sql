-- Direct booking replaces connection requests as the prerequisite for sessions.
-- Run after peer_connect_company_fixed_sessions.sql.
-- Existing sessions keep their connection_id values; new sessions use NULL.

begin;

alter table public.peer_sessions alter column connection_id drop not null;

create or replace function public.is_peer_mentor_bookable(p_mentor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tutor_verification_requests v
    join public.profiles p on p.id = v.user_id
    join public.tutor_profiles tp on tp.user_id = p.id
    where v.user_id = p_mentor_id and v.status = 'verified'
      and p.role in ('mentor', 'both') and tp.is_available
  );
$$;
revoke all on function public.is_peer_mentor_bookable(uuid) from public, anon;
grant execute on function public.is_peer_mentor_bookable(uuid) to authenticated;

-- Learners can read the single platform-managed booking row for verified mentors.
drop policy if exists "Accepted peers view platform booking row" on public.peer_session_types;
drop policy if exists "Learners view verified mentor booking row" on public.peer_session_types;
create policy "Learners view verified mentor booking row"
  on public.peer_session_types for select to authenticated
  using (
    is_active and is_platform_session
    and exists (
      select 1 from public.profiles learner
      where learner.id = (select auth.uid()) and learner.role in ('learner', 'both')
    )
    and public.is_peer_mentor_bookable(mentor_id)
  );

create or replace function public.enforce_peer_session_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration integer;
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if tg_op = 'INSERT' then
    if new.learner_id <> (select auth.uid()) or new.status <> 'pending' then
      raise exception 'Only the signed-in learner can request a session';
    end if;
    if new.connection_id is not null then
      raise exception 'New sessions are booked directly; connection requests are not used';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = new.learner_id and p.role in ('learner', 'both')
    ) then
      raise exception 'Choose a learner or both account to book a session';
    end if;
    if new.starts_at <= now() then raise exception 'Choose a future session time'; end if;

    select st.duration_minutes, st.timezone
      into v_duration, v_timezone
    from public.peer_session_types st
    where st.id = new.session_type_id
      and st.mentor_id = new.mentor_id
      and st.is_platform_session and st.is_active;
    if not found then raise exception 'Company booking setup is not ready for this mentor'; end if;
    if v_duration <> 30 or v_timezone <> 'Asia/Kolkata'
       or new.timezone <> 'Asia/Kolkata'
       or new.ends_at <> new.starts_at + interval '30 minutes' then
      raise exception 'Peer Connect sessions use fixed 30-minute India-time slots';
    end if;

    v_local_start := new.starts_at at time zone 'Asia/Kolkata';
    v_local_end := new.ends_at at time zone 'Asia/Kolkata';
    if v_local_start::date <> v_local_end::date
       or v_local_start::time < time '08:00'
       or v_local_end::time > time '20:00'
       or extract(minute from v_local_start)::integer not in (0, 30)
       or extract(second from v_local_start) <> 0 then
      raise exception 'Choose a company slot between 08:00 and 20:00 India time';
    end if;
    if exists (
      select 1 from public.peer_blocked_times b
      where b.mentor_id = new.mentor_id
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception 'The mentor has blocked that time';
    end if;
    if not exists (
      select 1
      from public.tutor_verification_requests v
      join public.profiles p on p.id = v.user_id
      join public.tutor_profiles tp on tp.user_id = p.id
      where v.user_id = new.mentor_id and v.status = 'verified'
        and p.role in ('mentor', 'both') and tp.is_available
    ) then
      raise exception 'The mentor must be verified and available before sessions can be booked';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.connection_id is distinct from old.connection_id
     or new.session_type_id is distinct from old.session_type_id
     or new.learner_id is distinct from old.learner_id
     or new.mentor_id is distinct from old.mentor_id
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.timezone is distinct from old.timezone then
    raise exception 'Session details cannot be changed after booking';
  end if;
  if (select auth.uid()) = old.learner_id then
    if new.status <> 'cancelled' or old.status not in ('pending', 'confirmed')
       or new.mentor_note <> old.mentor_note then
      raise exception 'Learners may only cancel a pending or confirmed session';
    end if;
  elsif (select auth.uid()) = old.mentor_id then
    if not ((old.status = 'pending' and new.status in ('confirmed', 'declined', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('completed', 'no_show', 'cancelled')))
      or new.learner_note <> old.learner_note then
      raise exception 'That session status change is not allowed';
    end if;
  else
    raise exception 'Only a session participant can update it';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

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
  v_date date;
  v_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to see session times'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('learner', 'both')
  ) then
    raise exception 'Choose a learner or both account to view booking times';
  end if;
  if p_days < 1 or p_days > 31 then raise exception 'Choose between 1 and 31 days'; end if;
  if not exists (
    select 1 from public.peer_session_types st
    where st.id = p_session_type_id and st.mentor_id = p_mentor_id
      and st.is_platform_session and st.duration_minutes = 30
      and st.timezone = 'Asia/Kolkata' and st.is_active
  ) then
    raise exception 'Company booking setup is not ready for this mentor';
  end if;
  if not exists (
    select 1
    from public.tutor_verification_requests v
    join public.profiles p on p.id = v.user_id
    join public.tutor_profiles tp on tp.user_id = p.id
    where v.user_id = p_mentor_id and v.status = 'verified'
      and p.role in ('mentor', 'both') and tp.is_available
  ) then
    raise exception 'The mentor is not currently verified and available for bookings';
  end if;

  for v_date in
    select generate_series(p_from, p_from + (p_days - 1), interval '1 day')::date
  loop
    for v_local in
      select generate_series(v_date + time '08:00', v_date + time '19:30', interval '30 minutes')
    loop
      v_start := v_local at time zone 'Asia/Kolkata';
      v_end := v_start + interval '30 minutes';
      if v_start > now()
        and not exists (
          select 1 from public.peer_blocked_times b
          where b.mentor_id = p_mentor_id
            and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
        )
        and not exists (
          select 1 from public.peer_sessions s
          where s.mentor_id = p_mentor_id and s.status in ('pending', 'confirmed')
            and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
        )
        and not exists (
          select 1 from public.peer_sessions s
          where s.learner_id = (select auth.uid()) and s.status in ('pending', 'confirmed')
            and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
        )
      then
        starts_at := v_start;
        ends_at := v_end;
        timezone := 'Asia/Kolkata';
        return next;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.get_peer_session_slots(uuid, uuid, date, integer) from public, anon;
grant execute on function public.get_peer_session_slots(uuid, uuid, date, integer) to authenticated;

commit;
