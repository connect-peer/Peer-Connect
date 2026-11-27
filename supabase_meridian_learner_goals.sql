-- Meridian learner goals: structured profile details for guidance matching.
-- Goal data is private to its owner until a server-side matching feature
-- explicitly exposes only the minimum fields needed for a match.

create table if not exists public.learner_guidance_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  goal_decision text not null check (goal_decision in (
    'choose_stream',
    'start_class_11',
    'exam_roadmap',
    'choose_branch_college',
    'recover_result',
    'other'
  )),
  board text not null check (board in ('CBSE', 'ICSE', 'State board', 'Other')),
  target_exam text,
  help_subjects text[] not null default '{}',
  preferred_languages text[] not null default '{}',
  city_tier text check (city_tier is null or city_tier in ('tier_1', 'tier_2', 'tier_3', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_guidance_profiles_max_help_subjects check (cardinality(help_subjects) <= 3),
  constraint learner_guidance_profiles_min_languages check (cardinality(preferred_languages) >= 1)
);

alter table public.learner_guidance_profiles enable row level security;

grant select, insert, update, delete on public.learner_guidance_profiles to authenticated;
revoke all on public.learner_guidance_profiles from anon;

drop policy if exists "Learners read own guidance profile" on public.learner_guidance_profiles;
create policy "Learners read own guidance profile"
  on public.learner_guidance_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Learners create own guidance profile" on public.learner_guidance_profiles;
create policy "Learners create own guidance profile"
  on public.learner_guidance_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Learners update own guidance profile" on public.learner_guidance_profiles;
create policy "Learners update own guidance profile"
  on public.learner_guidance_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Learners delete own guidance profile" on public.learner_guidance_profiles;
create policy "Learners delete own guidance profile"
  on public.learner_guidance_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_learner_guidance_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_learner_guidance_profile_updated_at on public.learner_guidance_profiles;
create trigger set_learner_guidance_profile_updated_at
  before update on public.learner_guidance_profiles
  for each row execute function public.set_learner_guidance_profile_updated_at();

comment on table public.learner_guidance_profiles is
  'Private, structured learner goals used for future mentor matching. Expose only through a reviewed matching function.';
