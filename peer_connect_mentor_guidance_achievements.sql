-- Mentor guidance areas use tutor_profiles.subjects for backwards compatibility.
-- This migration adds private supporting evidence and a moderated public showcase.

drop trigger if exists invalidate_tutor_verification_on_tutor_profile_change on public.tutor_profiles;

create table if not exists public.mentor_achievements (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (char_length(category) between 2 and 60),
  title text not null check (char_length(title) between 2 and 120),
  issuer text check (issuer is null or char_length(issuer) <= 120),
  achievement_year integer check (achievement_year is null or achievement_year between 1900 and 2100),
  public_summary text not null check (char_length(public_summary) between 10 and 500),
  evidence_path text not null unique,
  public_evidence_path text unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  constraint mentor_achievements_evidence_path_check
    check (evidence_path is null or evidence_path like user_id::text || '/' || id::text || '/evidence/%'),
  check (public_evidence_path is null or public_evidence_path like user_id::text || '/' || id::text || '/public/%')
);

-- Once a reviewer checks the original, delete it and retain only the reviewed
-- summary plus any separately approved redacted copy.
alter table public.mentor_achievements alter column evidence_path drop not null;
alter table public.mentor_achievements drop constraint if exists mentor_achievements_evidence_path_check;
alter table public.mentor_achievements add constraint mentor_achievements_evidence_path_check
  check (evidence_path is null or evidence_path like user_id::text || '/' || id::text || '/evidence/%');

create index if not exists mentor_achievements_user_status_idx
  on public.mentor_achievements(user_id, status, created_at desc);
alter table public.mentor_achievements enable row level security;
revoke all on public.mentor_achievements from anon, authenticated;
grant select, insert, update, delete on public.mentor_achievements to authenticated;

drop policy if exists "Owners read own mentor achievements" on public.mentor_achievements;
create policy "Owners read own mentor achievements" on public.mentor_achievements
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Reviewers read mentor achievements" on public.mentor_achievements;
create policy "Reviewers read mentor achievements" on public.mentor_achievements
  for select to authenticated using (public.is_peer_connect_verification_admin());
drop policy if exists "Mentors add pending achievements" on public.mentor_achievements;
create policy "Mentors add pending achievements" on public.mentor_achievements
  for insert to authenticated with check (
    user_id = (select auth.uid()) and status = 'pending' and reviewed_at is null and evidence_path is not null
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('mentor','both'))
  );
drop policy if exists "Owners edit unreviewed achievements" on public.mentor_achievements;
create policy "Owners edit unreviewed achievements" on public.mentor_achievements
  for update to authenticated using (
    user_id = (select auth.uid()) and status in ('pending','rejected')
  ) with check (
    user_id = (select auth.uid()) and status = 'pending' and reviewed_at is null and evidence_path is not null
  );
drop policy if exists "Reviewers decide mentor achievements" on public.mentor_achievements;
create policy "Reviewers decide mentor achievements" on public.mentor_achievements
  for update to authenticated using (public.is_peer_connect_verification_admin())
  with check (public.is_peer_connect_verification_admin());
drop policy if exists "Owners delete own mentor achievements" on public.mentor_achievements;
create policy "Owners delete own mentor achievements" on public.mentor_achievements
  for delete to authenticated using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mentor-achievements','mentor-achievements',false,5242880,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_view_peer_achievement_file(p_path text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.mentor_achievements a
    join public.profiles p on p.id = a.user_id
    where a.public_evidence_path = p_path and a.status = 'approved'
      and p.role in ('mentor','both') and p.grade between 9 and 12
      and exists (select 1 from public.tutor_verification_requests v
                  where v.user_id = a.user_id and v.status = 'verified')
  );
$$;
revoke all on function public.can_view_peer_achievement_file(text) from public, anon;
grant execute on function public.can_view_peer_achievement_file(text) to authenticated;

drop policy if exists "Mentors upload own achievement evidence" on storage.objects;
create policy "Mentors upload own achievement evidence" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'mentor-achievements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.mentor_achievements a
      where a.user_id = (select auth.uid()) and a.status = 'pending'
        and (a.evidence_path = name or a.public_evidence_path = name)
    )
  );
drop policy if exists "Owners reviewers and approved viewers read achievement files" on storage.objects;
create policy "Owners reviewers and approved viewers read achievement files" on storage.objects
  for select to authenticated using (
    bucket_id = 'mentor-achievements' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_peer_connect_verification_admin()
      or public.can_view_peer_achievement_file(name)
    )
  );
drop policy if exists "Owners and reviewers delete achievement files" on storage.objects;
create policy "Owners and reviewers delete achievement files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'mentor-achievements' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_peer_connect_verification_admin()
    )
  );

create or replace function public.get_peer_public_mentor_achievements(p_user_id uuid)
returns table (
  id uuid, category text, title text, issuer text, achievement_year integer,
  public_summary text, public_evidence_path text
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select a.id, a.category, a.title, a.issuer, a.achievement_year,
         a.public_summary, a.public_evidence_path
  from public.mentor_achievements a
  where a.user_id = p_user_id and a.status = 'approved'
    and exists (select 1 from public.tutor_verification_requests v
                where v.user_id = a.user_id and v.status = 'verified')
    and exists (select 1 from public.profiles p
                where p.id = a.user_id and p.role in ('mentor','both') and p.grade between 9 and 12)
  order by a.achievement_year desc nulls last, a.created_at desc;
$$;
revoke all on function public.get_peer_public_mentor_achievements(uuid) from public, anon;
grant execute on function public.get_peer_public_mentor_achievements(uuid) to authenticated;
