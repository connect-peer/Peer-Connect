-- Peer Connect profile media, role choices, and all-class mentor verification.
-- Adds support without deleting existing profiles, follows, or verification records.

alter table public.profiles
  add column if not exists profile_banner_url text;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

update public.profiles set role = case role
  when 'student' then 'learner'
  when 'tutor' then 'mentor'
  else role
end
where role in ('student', 'tutor');

alter table public.profiles
  add constraint profiles_role_check
  check (role is null or role in ('learner', 'mentor', 'both'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile owners upload their own media" on storage.objects;
create policy "Profile owners upload their own media"
on storage.objects for insert to authenticated
with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Profile owners update their own media" on storage.objects;
create policy "Profile owners update their own media"
on storage.objects for update to authenticated
using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Profile owners delete their own media" on storage.objects;
create policy "Profile owners delete their own media"
on storage.objects for delete to authenticated
using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.can_submit_tutor_verification(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select p_user_id = (select auth.uid())
     and exists (select 1 from public.profiles p where p.id = p_user_id and p.role in ('mentor','both') and p.grade between 9 and 12)
     and not exists (
       select 1 from public.tutor_verification_requests r
       where r.user_id = p_user_id and r.status in ('pending', 'verified')
     );
$$;

create or replace function public.get_verified_tutor_directory(p_state text default null, p_city text default null)
returns table(user_id uuid, display_name text, grade smallint, school text, city text, state text, country text, headline text, subjects text[], verified boolean)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view mentors'; end if;
  return query
  select tp.user_id, p.display_name, p.grade, loc.school, loc.city, loc.state, loc.country,
         tp.headline, tp.subjects, true
  from public.tutor_profiles tp
  join public.profiles p on p.id = tp.user_id
  join public.profile_locations loc on loc.user_id = tp.user_id
  where tp.is_available
    and p.role in ('mentor','both')
    and p.grade between 9 and 12
    and exists (select 1 from public.tutor_verification_requests vr
                where vr.user_id = tp.user_id and vr.status = 'verified')
    and (p_state is null or lower(trim(loc.state)) = lower(trim(p_state)))
    and (p_city is null or lower(trim(loc.city)) = lower(trim(p_city)))
  order by tp.created_at desc;
end;
$$;

create or replace function public.get_tutor_student_requests(p_state text default null, p_city text default null)
returns table(connection_id uuid, requester_id uuid, display_name text, grade smallint, school text, city text, state text, country text, status text, created_at timestamptz)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view requests'; end if;
  if not exists (
    select 1 from public.tutor_verification_requests vr
    join public.profiles p on p.id = vr.user_id
    where vr.user_id = (select auth.uid()) and vr.status = 'verified'
      and p.role in ('mentor','both') and p.grade between 9 and 12
  ) then return; end if;
  return query
  select c.id, c.requester_id, p.display_name, p.grade,
         loc.school, loc.city, loc.state, loc.country, c.status, c.created_at
  from public.connections c
  join public.profiles p on p.id = c.requester_id
  left join public.profile_locations loc on loc.user_id = c.requester_id
  where c.recipient_id = (select auth.uid())
    and (p_state is null or lower(trim(loc.state)) = lower(trim(p_state)))
    and (p_city is null or lower(trim(loc.city)) = lower(trim(p_city)))
  order by c.created_at desc;
end;
$$;
