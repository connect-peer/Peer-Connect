-- Repair saved-profile loading for signed-in users.
-- This grants each authenticated user access only to their own profiles row.
-- Run in Supabase SQL Editor as the project owner.

grant usage on schema public to authenticated;
grant select, insert, update on table public.profiles to authenticated;

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'peer_connect_profiles_read_own'
  ) then
    create policy peer_connect_profiles_read_own
      on public.profiles for select to authenticated
      using (id::text = (select auth.uid())::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'peer_connect_profiles_insert_own'
  ) then
    create policy peer_connect_profiles_insert_own
      on public.profiles for insert to authenticated
      with check (id::text = (select auth.uid())::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'peer_connect_profiles_update_own'
  ) then
    create policy peer_connect_profiles_update_own
      on public.profiles for update to authenticated
      using (id::text = (select auth.uid())::text)
      with check (id::text = (select auth.uid())::text);
  end if;
end
$$;
