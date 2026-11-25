-- Fix verification submissions for current Mentor / Both accounts in every class.
-- Older policies may restrict submissions to old role names or selected grades.
-- This keeps submissions limited to the signed-in user's own account.

create or replace function public.can_submit_tutor_verification(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = p_user_id
        and p.role in ('mentor', 'both', 'tutor')
    )
    and not exists (
      select 1
      from public.tutor_verification_requests r
      where r.user_id = p_user_id
        and r.status in ('pending', 'verified')
    );
$$;

revoke all on function public.can_submit_tutor_verification(uuid) from public, anon;
grant execute on function public.can_submit_tutor_verification(uuid) to authenticated;

grant insert on table public.tutor_verification_requests to authenticated;

drop policy if exists "Tutor submits pending verification"
  on public.tutor_verification_requests;

create policy "Tutor submits pending verification"
  on public.tutor_verification_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and reviewed_at is null
    and public.can_submit_tutor_verification(user_id)
  );
