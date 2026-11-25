-- Peer Connect tutor verification and private location data
-- Apply once in Supabase SQL Editor before deploying the updated app.
-- The green Verified badge is granted only by a reviewer listed in
-- public.verification_admins. Never put a service-role key in the browser.

begin;

-- Keep student and tutor locations out of the broadly readable profiles table.
create table if not exists public.profile_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  city text not null check (char_length(city) between 1 and 100),
  state text not null check (char_length(state) between 1 and 100),
  country text not null check (char_length(country) between 1 and 100),
  school text not null check (char_length(school) between 1 and 180),
  updated_at timestamptz not null default now()
);

-- Preserve any existing city/school values while moving them to the private table.
insert into public.profile_locations (user_id, city, state, country, school)
select id, coalesce(nullif(trim(city), ''), 'Not set'), 'Not set', 'Not set',
       coalesce(nullif(trim(school), ''), 'Not set')
from public.profiles
where city is not null or school is not null
on conflict (user_id) do nothing;

alter table public.profile_locations enable row level security;
revoke all on public.profile_locations from anon, authenticated;
grant select, insert, update, delete on public.profile_locations to authenticated;
drop policy if exists "Users manage own location" on public.profile_locations;
create policy "Users manage own location" on public.profile_locations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.verification_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.verification_admins enable row level security;
revoke all on public.verification_admins from anon, authenticated;
grant select on public.verification_admins to authenticated;
drop policy if exists "Admins can see own allowlist entry" on public.verification_admins;
create policy "Admins can see own allowlist entry" on public.verification_admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_peer_connect_verification_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.verification_admins a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_peer_connect_verification_admin() from public, anon;
grant execute on function public.is_peer_connect_verification_admin() to authenticated;
drop policy if exists "Admins review private locations" on public.profile_locations;
create policy "Admins review private locations" on public.profile_locations
  for select to authenticated using (public.is_peer_connect_verification_admin());

create table if not exists public.tutor_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists tutor_verification_requests_user_status_idx
  on public.tutor_verification_requests(user_id, status, submitted_at desc);
alter table public.tutor_verification_requests enable row level security;
revoke all on public.tutor_verification_requests from anon, authenticated;
grant select, insert, update, delete on public.tutor_verification_requests to authenticated;
create or replace function public.can_submit_tutor_verification(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p_user_id = (select auth.uid())
     and exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'tutor' and p.grade in (11, 12))
     and not exists (
       select 1 from public.tutor_verification_requests r
       where r.user_id = p_user_id and r.status in ('pending', 'verified')
     );
$$;
revoke all on function public.can_submit_tutor_verification(uuid) from public, anon;
grant execute on function public.can_submit_tutor_verification(uuid) to authenticated;
drop policy if exists "Owners and admins read verification status" on public.tutor_verification_requests;
create policy "Owners and admins read verification status" on public.tutor_verification_requests
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.is_peer_connect_verification_admin()
    or status = 'verified'
  );
drop policy if exists "Tutor submits pending verification" on public.tutor_verification_requests;
create policy "Tutor submits pending verification" on public.tutor_verification_requests
  for insert to authenticated with check (
    user_id = (select auth.uid()) and status = 'pending' and reviewed_at is null
    and public.can_submit_tutor_verification(user_id)
  );
drop policy if exists "Admins review tutor verification" on public.tutor_verification_requests;
create policy "Admins review tutor verification" on public.tutor_verification_requests
  for update to authenticated
  using (public.is_peer_connect_verification_admin())
  with check (public.is_peer_connect_verification_admin());
drop policy if exists "Owners cancel pending verification" on public.tutor_verification_requests;
create policy "Owners cancel pending verification" on public.tutor_verification_requests
  for delete to authenticated using (user_id = (select auth.uid()) and status = 'pending');

create or replace function public.invalidate_tutor_verification_on_school_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if old.school is distinct from new.school then
    update public.tutor_verification_requests
       set status = 'rejected', reviewed_at = now()
     where user_id = new.user_id and status = 'verified';
  end if;
  return new;
end;
$$;
drop trigger if exists invalidate_tutor_verification_on_school_change on public.profile_locations;
create trigger invalidate_tutor_verification_on_school_change
  after update of school on public.profile_locations
  for each row execute function public.invalidate_tutor_verification_on_school_change();

create or replace function public.invalidate_tutor_verification_on_name_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if old.display_name is distinct from new.display_name or old.grade is distinct from new.grade then
    update public.tutor_verification_requests
       set status = 'rejected', reviewed_at = now()
     where user_id = new.id and status = 'verified';
  end if;
  return new;
end;
$$;
drop trigger if exists invalidate_tutor_verification_on_name_change on public.profiles;
create trigger invalidate_tutor_verification_on_name_change
  after update of display_name, grade on public.profiles
  for each row execute function public.invalidate_tutor_verification_on_name_change();

drop trigger if exists invalidate_tutor_verification_on_tutor_profile_change on public.tutor_profiles;

create table if not exists public.tutor_verification_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tutor_verification_requests(id) on delete cascade,
  document_type text not null check (document_type in ('school_id', 'fee_receipt')),
  storage_path text not null unique,
  uploaded_at timestamptz not null default now(),
  unique (request_id, document_type)
);
alter table public.tutor_verification_documents enable row level security;
revoke all on public.tutor_verification_documents from anon, authenticated;
grant select, insert, delete on public.tutor_verification_documents to authenticated;
drop policy if exists "Owners and admins read verification documents" on public.tutor_verification_documents;
create policy "Owners and admins read verification documents" on public.tutor_verification_documents
  for select to authenticated using (
    public.is_peer_connect_verification_admin()
    or exists (select 1 from public.tutor_verification_requests r
               where r.id = request_id and r.user_id = (select auth.uid()))
  );
drop policy if exists "Owners add documents to pending requests" on public.tutor_verification_documents;
create policy "Owners add documents to pending requests" on public.tutor_verification_documents
  for insert to authenticated with check (
    exists (select 1 from public.tutor_verification_requests r
            where r.id = request_id and r.user_id = (select auth.uid()) and r.status = 'pending')
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );
drop policy if exists "Admins remove reviewed document metadata" on public.tutor_verification_documents;
create policy "Admins remove reviewed document metadata" on public.tutor_verification_documents
  for delete to authenticated using (public.is_peer_connect_verification_admin());

create table if not exists public.tutor_verification_reviews (
  request_id uuid primary key references public.tutor_verification_requests(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);
alter table public.tutor_verification_reviews enable row level security;
revoke all on public.tutor_verification_reviews from anon, authenticated;
grant select, insert, update on public.tutor_verification_reviews to authenticated;
drop policy if exists "Admins manage private review notes" on public.tutor_verification_reviews;
create policy "Admins manage private review notes" on public.tutor_verification_reviews
  for all to authenticated
  using (public.is_peer_connect_verification_admin())
  with check (public.is_peer_connect_verification_admin() and reviewer_id = (select auth.uid()));

-- Make the uploaded evidence private. Documents are limited to 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutor-verification', 'tutor-verification', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners and admins read private verification files" on storage.objects;
create policy "Owners and admins read private verification files" on storage.objects
  for select to authenticated using (
    bucket_id = 'tutor-verification'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_peer_connect_verification_admin()
    )
  );
drop policy if exists "Users upload private verification files to own folder" on storage.objects;
create policy "Users upload private verification files to own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'tutor-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.tutor_verification_requests r
      where r.id::text = (storage.foldername(name))[2]
        and r.user_id = (select auth.uid()) and r.status = 'pending'
    )
  );
drop policy if exists "Owners and admins delete private verification files" on storage.objects;
create policy "Owners and admins delete private verification files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'tutor-verification'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_peer_connect_verification_admin()
    )
  );

-- Expose only ordinary public profile columns through PostgREST.
-- Location data lives in profile_locations and is returned only by restricted functions below.
revoke select on public.profiles from anon, authenticated;
revoke select on public.profiles from public;
grant select (id, username, display_name, bio, avatar_url, grade, created_at, updated_at, role)
  on public.profiles to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (username, display_name, bio, avatar_url, profile_banner_url, grade, role)
  on public.profiles to authenticated;

create or replace function public.get_verified_tutor_directory(p_state text default null, p_city text default null)
returns table (
  user_id uuid, display_name text, grade smallint, school text,
  city text, state text, country text, headline text, subjects text[], verified boolean
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view tutors'; end if;
  return query
  select tp.user_id, p.display_name, p.grade, loc.school, loc.city, loc.state, loc.country,
         tp.headline, tp.subjects, true
  from public.tutor_profiles tp
  join public.profiles p on p.id = tp.user_id
  join public.profile_locations loc on loc.user_id = tp.user_id
  where tp.is_available
    and p.role = 'tutor'
    and p.grade in (11, 12)
    and exists (select 1 from public.tutor_verification_requests vr
                where vr.user_id = tp.user_id and vr.status = 'verified')
    and (p_state is null or lower(trim(loc.state)) = lower(trim(p_state)))
    and (p_city is null or lower(trim(loc.city)) = lower(trim(p_city)))
  order by tp.created_at desc;
end;
$$;
revoke all on function public.get_verified_tutor_directory(text, text) from public, anon;
grant execute on function public.get_verified_tutor_directory(text, text) to authenticated;

create or replace function public.get_tutor_student_requests(p_state text default null, p_city text default null)
returns table (
  connection_id uuid, requester_id uuid, display_name text, grade smallint,
  school text, city text, state text, country text, status text, created_at timestamptz
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view requests'; end if;
  if not exists (select 1 from public.tutor_verification_requests vr
                 join public.profiles p on p.id = vr.user_id
                 where vr.user_id = (select auth.uid()) and vr.status = 'verified'
                   and p.role = 'tutor' and p.grade in (11, 12)) then
    return;
  end if;
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
revoke all on function public.get_tutor_student_requests(text, text) from public, anon;
grant execute on function public.get_tutor_student_requests(text, text) to authenticated;

commit;

-- After applying, add the trusted reviewer account from SQL Editor. Replace the email:
-- insert into public.verification_admins (user_id)
-- select id from auth.users where lower(email) = lower('YOUR_ADMIN_EMAIL')
-- on conflict do nothing;
