-- Peer Connect v2.0.0: community posts and accepted-connection scheduling.
-- Apply in Supabase SQL Editor as the project owner before deploying the frontend.
-- Uses only user-scoped policies; never place a service-role key in the static app.
begin;

-- Social feed media, comments, and likes.
alter table public.posts add column if not exists media_url text;
alter table public.posts add column if not exists media_type text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_media_type_check') then
    alter table public.posts add constraint posts_media_type_check
      check (media_type is null or media_type in ('image','video'));
  end if;
end $$;

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_created_idx on public.post_comments(post_id, created_at);
alter table public.post_comments enable row level security;
grant select, insert, delete on public.post_comments to authenticated;
drop policy if exists "Authenticated read post comments" on public.post_comments;
create policy "Authenticated read post comments" on public.post_comments for select to authenticated using (true);
drop policy if exists "Users add own post comments" on public.post_comments;
create policy "Users add own post comments" on public.post_comments for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists "Users delete own post comments" on public.post_comments;
create policy "Users delete own post comments" on public.post_comments for delete to authenticated using (author_id = (select auth.uid()));

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_reactions enable row level security;
grant select, insert, delete on public.post_reactions to authenticated;
drop policy if exists "Authenticated read post reactions" on public.post_reactions;
create policy "Authenticated read post reactions" on public.post_reactions for select to authenticated using (true);
drop policy if exists "Users add own post reactions" on public.post_reactions;
create policy "Users add own post reactions" on public.post_reactions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users remove own post reactions" on public.post_reactions;
create policy "Users remove own post reactions" on public.post_reactions for delete to authenticated using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media','post-media',false,52428800,
 array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
 allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Peer post media owner upload" on storage.objects;
create policy "Peer post media owner upload" on storage.objects for insert to authenticated
 with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Signed-in users view Peer post media" on storage.objects;
create policy "Signed-in users view Peer post media" on storage.objects for select to authenticated
 using (bucket_id = 'post-media');
drop policy if exists "Peer post media owner delete" on storage.objects;
create policy "Peer post media owner delete" on storage.objects for delete to authenticated
 using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Recurring weekly availability uses local wall-clock times plus an IANA timezone.
create table if not exists public.peer_session_types (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 80),
  duration_minutes integer not null check (duration_minutes in (15,30,45,60,90,120)),
  description text not null default '' check (char_length(description) <= 500),
  timezone text not null default 'Asia/Kolkata',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, mentor_id)
);
create index if not exists peer_session_types_mentor_idx on public.peer_session_types(mentor_id, is_active);
alter table public.peer_session_types enable row level security;
grant select, insert, update, delete on public.peer_session_types to authenticated;
drop policy if exists "Mentors manage own session types" on public.peer_session_types;
create policy "Mentors manage own session types" on public.peer_session_types for all to authenticated
 using (mentor_id = (select auth.uid())) with check (mentor_id = (select auth.uid())
   and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('mentor','both'))
   and exists (select 1 from public.tutor_verification_requests v where v.user_id = (select auth.uid()) and v.status = 'verified'));
drop policy if exists "Accepted peers view active session types" on public.peer_session_types;
create policy "Accepted peers view active session types" on public.peer_session_types for select to authenticated
 using (is_active and exists (
   select 1 from public.connections c where c.status = 'accepted'
   and ((c.requester_id = (select auth.uid()) and c.recipient_id = mentor_id)
     or (c.recipient_id = (select auth.uid()) and c.requester_id = mentor_id))
 ));

create table if not exists public.peer_weekly_availability (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO Monday=1
  starts_at time not null,
  ends_at time not null,
  timezone text not null default 'Asia/Kolkata',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  unique (mentor_id, weekday, starts_at, ends_at)
);
create index if not exists peer_weekly_availability_lookup_idx on public.peer_weekly_availability(mentor_id, weekday) where is_active;
alter table public.peer_weekly_availability enable row level security;
grant select, insert, update, delete on public.peer_weekly_availability to authenticated;
drop policy if exists "Mentors manage own weekly availability" on public.peer_weekly_availability;
create policy "Mentors manage own weekly availability" on public.peer_weekly_availability for all to authenticated
 using (mentor_id = (select auth.uid())) with check (mentor_id = (select auth.uid())
   and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('mentor','both'))
   and exists (select 1 from public.tutor_verification_requests v where v.user_id = (select auth.uid()) and v.status = 'verified'));

create table if not exists public.peer_blocked_times (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  label text not null default 'Unavailable' check (char_length(label) <= 100),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);
create index if not exists peer_blocked_times_mentor_idx on public.peer_blocked_times(mentor_id, starts_at, ends_at);
alter table public.peer_blocked_times enable row level security;
grant select, insert, update, delete on public.peer_blocked_times to authenticated;
drop policy if exists "Mentors manage own blocked times" on public.peer_blocked_times;
create policy "Mentors manage own blocked times" on public.peer_blocked_times for all to authenticated
 using (mentor_id = (select auth.uid())) with check (mentor_id = (select auth.uid())
   and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('mentor','both'))
   and exists (select 1 from public.tutor_verification_requests v where v.user_id = (select auth.uid()) and v.status = 'verified'));

create table if not exists public.peer_sessions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete restrict,
  session_type_id uuid not null,
  learner_id uuid not null references public.profiles(id) on delete restrict,
  mentor_id uuid not null references public.profiles(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled','completed','no_show')),
  learner_note text not null default '' check (char_length(learner_note) <= 1000),
  mentor_note text not null default '' check (char_length(mentor_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (learner_id <> mentor_id),
  check (starts_at < ends_at),
  foreign key (session_type_id, mentor_id) references public.peer_session_types(id, mentor_id) on delete restrict
);
create index if not exists peer_sessions_learner_start_idx on public.peer_sessions(learner_id, starts_at desc);
create index if not exists peer_sessions_mentor_start_idx on public.peer_sessions(mentor_id, starts_at desc);
create extension if not exists btree_gist;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'peer_sessions_no_mentor_overlap') then
    alter table public.peer_sessions add constraint peer_sessions_no_mentor_overlap
      exclude using gist (mentor_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
      where (status in ('pending','confirmed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'peer_sessions_no_learner_overlap') then
    alter table public.peer_sessions add constraint peer_sessions_no_learner_overlap
      exclude using gist (learner_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
      where (status in ('pending','confirmed'));
  end if;
end $$;
alter table public.peer_sessions enable row level security;
grant select, insert, update on public.peer_sessions to authenticated;
drop policy if exists "Participants view their peer sessions" on public.peer_sessions;
create policy "Participants view their peer sessions" on public.peer_sessions for select to authenticated
 using (learner_id = (select auth.uid()) or mentor_id = (select auth.uid()));
drop policy if exists "Learners request peer sessions" on public.peer_sessions;
create policy "Learners request peer sessions" on public.peer_sessions for insert to authenticated
 with check (learner_id = (select auth.uid()) and status = 'pending');
drop policy if exists "Participants update own peer sessions" on public.peer_sessions;
create policy "Participants update own peer sessions" on public.peer_sessions for update to authenticated
 using (learner_id = (select auth.uid()) or mentor_id = (select auth.uid()))
 with check (learner_id = (select auth.uid()) or mentor_id = (select auth.uid()));

create or replace function public.enforce_peer_session_rules()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_duration integer; v_timezone text; v_local_start timestamp; v_local_end timestamp; v_weekday integer;
begin
  if tg_op = 'INSERT' then
    if new.learner_id <> (select auth.uid()) or new.status <> 'pending' then raise exception 'Only the signed-in learner can request a pending session'; end if;
    if new.starts_at <= now() then raise exception 'Choose a future session time'; end if;
    if not exists (
      select 1 from public.connections c where c.id = new.connection_id and c.status = 'accepted'
       and ((c.requester_id = new.learner_id and c.recipient_id = new.mentor_id)
         or (c.recipient_id = new.learner_id and c.requester_id = new.mentor_id))
    ) then raise exception 'An accepted connection is required before booking'; end if;
    select duration_minutes, timezone into v_duration, v_timezone from public.peer_session_types
      where id = new.session_type_id and mentor_id = new.mentor_id and is_active;
    if not found then raise exception 'This session type is unavailable'; end if;
    if new.timezone <> v_timezone or new.ends_at <> new.starts_at + make_interval(mins => v_duration) then
      raise exception 'Session duration or timezone does not match the selected session type';
    end if;
    v_local_start := new.starts_at at time zone v_timezone;
    v_local_end := new.ends_at at time zone v_timezone;
    v_weekday := extract(isodow from v_local_start)::integer;
    if not exists (select 1 from public.peer_weekly_availability a where a.mentor_id = new.mentor_id and a.is_active
       and a.weekday = v_weekday and a.timezone = v_timezone
       and v_local_start::time >= a.starts_at and v_local_end::time <= a.ends_at) then
      raise exception 'That time is outside the mentor weekly availability';
    end if;
    if exists (select 1 from public.peer_blocked_times b where b.mentor_id = new.mentor_id
       and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
      raise exception 'The mentor has blocked that date or time';
    end if;
    if not exists (select 1 from public.tutor_verification_requests v where v.user_id = new.mentor_id and v.status = 'verified') then
      raise exception 'The mentor must be verified before sessions can be booked';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.connection_id <> old.connection_id or new.session_type_id <> old.session_type_id
    or new.learner_id <> old.learner_id or new.mentor_id <> old.mentor_id or new.starts_at <> old.starts_at
    or new.ends_at <> old.ends_at or new.timezone <> old.timezone then raise exception 'Session details cannot be changed after booking'; end if;
  if (select auth.uid()) = old.learner_id then
    if new.status <> 'cancelled' or old.status not in ('pending','confirmed') or new.mentor_note <> old.mentor_note then
      raise exception 'Learners may only cancel a pending or confirmed session'; end if;
  elsif (select auth.uid()) = old.mentor_id then
    if not ((old.status = 'pending' and new.status in ('confirmed','declined','cancelled'))
      or (old.status = 'confirmed' and new.status in ('completed','no_show','cancelled')))
      or new.learner_note <> old.learner_note then raise exception 'That session status change is not allowed'; end if;
  else raise exception 'Only a session participant can update it'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists enforce_peer_session_rules on public.peer_sessions;
create trigger enforce_peer_session_rules before insert or update on public.peer_sessions
 for each row execute function public.enforce_peer_session_rules();

create or replace function public.get_peer_session_slots(p_mentor_id uuid, p_session_type_id uuid, p_from date, p_days integer default 14)
returns table(starts_at timestamptz, ends_at timestamptz, timezone text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_duration integer; v_timezone text; v_date date; v_availability record; v_local timestamp; v_start timestamptz; v_end timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to see session times'; end if;
  if p_days < 1 or p_days > 31 then raise exception 'Choose between 1 and 31 days'; end if;
  if not exists (select 1 from public.connections c where c.status = 'accepted'
    and ((c.requester_id = (select auth.uid()) and c.recipient_id = p_mentor_id)
      or (c.recipient_id = (select auth.uid()) and c.requester_id = p_mentor_id))) then
    raise exception 'An accepted connection is required before viewing booking times';
  end if;
  select duration_minutes, timezone into v_duration, v_timezone from public.peer_session_types
    where id = p_session_type_id and mentor_id = p_mentor_id and is_active;
  if not found then raise exception 'This session type is unavailable'; end if;
  for v_date in select generate_series(p_from, p_from + (p_days - 1), interval '1 day')::date loop
    for v_availability in select * from public.peer_weekly_availability a
      where a.mentor_id = p_mentor_id and a.is_active and a.weekday = extract(isodow from v_date)::integer and a.timezone = v_timezone loop
      for v_local in select generate_series(v_date + v_availability.starts_at,
          v_date + v_availability.ends_at - make_interval(mins => v_duration), interval '15 minutes') loop
        v_start := v_local at time zone v_timezone;
        v_end := v_start + make_interval(mins => v_duration);
        if v_start > now()
          and not exists (select 1 from public.peer_blocked_times b where b.mentor_id = p_mentor_id and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(v_start,v_end,'[)'))
          and not exists (select 1 from public.peer_sessions s where s.mentor_id = p_mentor_id and s.status in ('pending','confirmed') and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(v_start,v_end,'[)'))
          and not exists (select 1 from public.peer_sessions s where s.learner_id = (select auth.uid()) and s.status in ('pending','confirmed') and tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(v_start,v_end,'[)')) then
          starts_at := v_start; ends_at := v_end; timezone := v_timezone; return next;
        end if;
      end loop;
    end loop;
  end loop;
end $$;
revoke all on function public.get_peer_session_slots(uuid,uuid,date,integer) from public, anon;
grant execute on function public.get_peer_session_slots(uuid,uuid,date,integer) to authenticated;

commit;
