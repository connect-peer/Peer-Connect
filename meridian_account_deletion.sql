-- Meridian permanent account deletion.
-- Run this in Supabase SQL Editor after supabase_meridian_safety_moderation.sql.
-- The Edge Function removes Storage files and deletes the Auth user after this
-- transaction removes the account's application data.

begin;

create or replace function public.meridian_prepare_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := p_user_id;
begin
  if actor is null then
    raise exception 'The account to delete is missing.' using errcode = '42501';
  end if;

  -- Repeat the Edge Function's guard here so unresolved calls/payments cannot
  -- be bypassed if another trusted server later calls this database function.
  if exists (
    select 1
    from public.peer_sessions as ps
    left join public.meridian_session_financials as finance on finance.session_id = ps.id
    where (ps.learner_id = actor or ps.mentor_id = actor)
      and (
        ps.payment_status in ('held','refund_pending','credit_pending')
        or (ps.payment_status = 'captured' and coalesce(finance.payout_status, '') <> 'paid')
        or coalesce(finance.payout_status, '') in ('captured','waiting_for_completion','payout_pending','refund_pending','payout_setup_required')
      )
  ) then
    raise exception 'An actual payment, refund, or mentor payout still needs to be settled.' using errcode = '55000';
  end if;

  -- Clear audit references where the account acted as a reviewer. Keep the
  -- reviewed reports/results, but remove reviewer identity and private notes.
  update public.reports
  set reviewed_by = null, reviewer_note = null
  where reviewed_by = actor;

  update public.meridian_mentor_results
  set reviewed_by = null
  where reviewed_by = actor and user_id <> actor;

  update public.mentor_achievements
  set reviewed_by = null
  where reviewed_by = actor and user_id <> actor;

  update public.meridian_user_restrictions
  set updated_by = null
  where updated_by = actor and user_id <> actor;

  -- Delete safety actions and reports tied to this account or its content.
  delete from public.meridian_moderation_actions
  where moderator_id = actor or target_user_id = actor;

  delete from public.reports
  where reporter_id = actor
     or reported_user_id = actor
     or post_id in (select p.id from public.posts p where p.author_id = actor)
     or doubt_id in (select d.id from public.doubts d where d.author_id = actor);

  -- Remove verification applications, private document metadata, and reviews
  -- written by this account. Storage objects are removed by the Edge Function.
  delete from public.tutor_verification_reviews
  where reviewer_id = actor
     or request_id in (
       select v.id from public.tutor_verification_requests v where v.user_id = actor
     );
  delete from public.tutor_verification_documents
  where request_id in (
    select v.id from public.tutor_verification_requests v where v.user_id = actor
  );
  delete from public.tutor_verification_requests where user_id = actor;

  -- Remove authored feed/doubt content and its dependent comments/reactions.
  delete from public.post_comments
  where author_id = actor
     or post_id in (select p.id from public.posts p where p.author_id = actor);
  delete from public.post_reactions
  where user_id = actor
     or post_id in (select p.id from public.posts p where p.author_id = actor);
  delete from public.answers
  where author_id = actor
     or doubt_id in (select d.id from public.doubts d where d.author_id = actor);
  delete from public.posts where author_id = actor;
  delete from public.doubts where author_id = actor;

  -- Calls, chat, feedback, settlement rows, and call notifications are removed
  -- together. The Edge Function refuses deletion while a call/payment is open.
  delete from public.peer_session_messages
  where sender_id = actor
     or session_id in (
       select s.id from public.peer_sessions s
       where s.learner_id = actor or s.mentor_id = actor
     );
  delete from public.meridian_session_feedback
  where learner_id = actor or mentor_id = actor;
  delete from public.meridian_notifications
  where user_id = actor
     or session_id in (
       select s.id from public.peer_sessions s
       where s.learner_id = actor or s.mentor_id = actor
     );
  delete from public.meridian_match_events
  where learner_id = actor or mentor_id = actor;
  delete from public.meridian_session_financials
  where session_id in (
    select s.id from public.peer_sessions s
    where s.learner_id = actor or s.mentor_id = actor
  );
  delete from public.peer_sessions where learner_id = actor or mentor_id = actor;

  -- Remove account-level settings, safety data, mentor materials, and links.
  delete from public.meridian_account_safety where user_id = actor;
  delete from public.meridian_user_blocks where blocker_id = actor or blocked_id = actor;
  delete from public.meridian_user_restrictions where user_id = actor;
  delete from public.meridian_mentor_journey where user_id = actor;
  delete from public.meridian_mentor_results where user_id = actor;
  delete from public.mentor_achievements where user_id = actor;
  delete from public.peer_blocked_times where mentor_id = actor;
  delete from public.peer_session_types where mentor_id = actor;
  delete from public.meridian_mentor_payout_accounts where mentor_id = actor;
  delete from public.learner_guidance_profiles where user_id = actor;
  delete from public.tutor_profiles where user_id = actor;
  delete from public.profile_locations where user_id = actor;
  delete from public.follows where follower_id = actor or following_id = actor;
  delete from public.verification_admins where user_id = actor;

  -- Staff allowlist is introduced by the optional guardian email policy SQL.
  if to_regclass('public.meridian_staff_accounts') is not null then
    execute 'delete from public.meridian_staff_accounts where user_id = $1' using actor;
  end if;
end;
$$;

revoke all on function public.meridian_prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.meridian_prepare_account_deletion(uuid) to service_role;

comment on function public.meridian_prepare_account_deletion(uuid) is
  'Atomically removes the signed-in user’s Meridian data before the trusted account deletion Edge Function deletes their Supabase Auth user.';

commit;
