-- Guardian identity checks for Meridian.
-- Run this after supabase_meridian_safety_moderation.sql.
-- A guardian email may match no Meridian account, or an explicitly allowlisted
-- Meridian staff/admin/reviewer account. A normal learner/mentor account cannot
-- be used as the guardian contact. Admin/reviewer status is checked by user ID,
-- so it works regardless of that account's learner/mentor profile role.

begin;

-- Staff who are not already Meridian admins/reviewers can be allowlisted here.
-- This table is intentionally unavailable through the website/Data API.
create table if not exists public.meridian_staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.meridian_staff_accounts enable row level security;
revoke all on table public.meridian_staff_accounts from public, anon, authenticated;

-- Example for a trusted staff member (run separately, replacing the email):
-- insert into public.meridian_staff_accounts (user_id)
-- select u.id from auth.users u
-- where lower(trim(u.email)) = lower('STAFF_MEMBER_EMAIL')
--   and not exists (
--     select 1 from public.meridian_staff_accounts s where s.user_id = u.id
--   );

-- Internal predicate: true when the email is not tied to an account, or every
-- matching account is explicitly Meridian staff/admin/reviewer. This function
-- returns no account data and is callable only by its owner/triggers.
create or replace function public.meridian_guardian_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from auth.users as account
    where lower(trim(account.email)) = lower(trim(p_email))
      and not exists (
        select 1 from public.meridian_staff_accounts as staff
        where staff.user_id = account.id
      )
      and not exists (
        select 1 from public.verification_admins as reviewer
        where reviewer.user_id = account.id
      )
  );
$$;
revoke all on function public.meridian_guardian_email_allowed(text) from public, anon, authenticated;

-- Reopen any previously approved consent that used a normal Meridian account
-- as the guardian contact, so reviewers can resolve it under this rule.
update public.meridian_account_safety as safety
set guardian_consent_verified_at = null,
    updated_at = now()
where safety.guardian_consent_verified_at is not null
  and safety.guardian_contact_type = 'email'
  and safety.guardian_contact is not null
  and not public.meridian_guardian_email_allowed(safety.guardian_contact);

-- Keep the original DOB/self-edit protections, revoke consent when guardian
-- details change, and reject reviewer approval for a normal learner/mentor
-- account email. An authorized staff/admin/reviewer account is allowed.
create or replace function public.meridian_guard_safety_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  guardian_details_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    guardian_details_changed :=
      (new.guardian_name, new.guardian_contact, new.guardian_contact_type)
      is distinct from
      (old.guardian_name, old.guardian_contact, old.guardian_contact_type);

    if auth.uid() = old.user_id
       and new.date_of_birth is distinct from old.date_of_birth then
      raise exception 'Date of birth can only be corrected by a Meridian safety reviewer.' using errcode = '42501';
    end if;

    if auth.uid() = old.user_id then
      if new.mentor_cleared_for_minors is distinct from old.mentor_cleared_for_minors then
        raise exception 'Only Meridian safety reviewers can change consent verification or minor clearance.' using errcode = '42501';
      end if;
      if new.guardian_consent_verified_at is distinct from old.guardian_consent_verified_at
         and not (guardian_details_changed and new.guardian_consent_verified_at is null) then
        raise exception 'Only Meridian safety reviewers can change consent verification or minor clearance.' using errcode = '42501';
      end if;
    end if;

    -- Editing the guardian contact invalidates the old approval and returns
    -- the learner to the reviewer queue.
    if guardian_details_changed then
      new.guardian_consent_verified_at := null;
    end if;
  end if;

  if new.date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future.' using errcode = '23514';
  end if;

  if new.guardian_consent_verified_at is not null
     and new.guardian_contact_type = 'email'
     and new.guardian_contact is not null
     and not public.meridian_guardian_email_allowed(new.guardian_contact) then
    raise exception 'This guardian email is linked to a learner or mentor account. Use a guardian email not linked to a regular Meridian account, or have authorized Meridian staff review the case.' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.meridian_guard_safety_fields() from public, anon, authenticated;

-- Recheck at booking time so an older consent approval cannot bypass this rule.
create or replace function public.meridian_check_booking_guardian_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  learner_birth date;
  guardian_email text;
  guardian_type text;
begin
  select safety.date_of_birth, safety.guardian_contact, safety.guardian_contact_type
    into learner_birth, guardian_email, guardian_type
  from public.meridian_account_safety as safety
  where safety.user_id = new.learner_id;

  if learner_birth > current_date - interval '18 years'
     and guardian_type = 'email'
     and guardian_email is not null
     and not public.meridian_guardian_email_allowed(guardian_email) then
    raise exception 'Bookings are locked because this guardian email belongs to a regular Meridian learner or mentor account. Ask Meridian staff for help.' using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function public.meridian_check_booking_guardian_account() from public, anon, authenticated;
drop trigger if exists meridian_check_booking_guardian_account on public.peer_sessions;
create trigger meridian_check_booking_guardian_account
  before insert on public.peer_sessions
  for each row execute function public.meridian_check_booking_guardian_account();

commit;
