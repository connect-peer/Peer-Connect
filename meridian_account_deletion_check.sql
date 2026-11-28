-- Lets the account-deletion Edge Function check calls without granting clients
-- direct access to peer_sessions or meridian_session_financials.
begin;

create or replace function public.meridian_account_deletion_check(p_user_id uuid)
returns table (
  session_id uuid,
  status text,
  payment_status text,
  payout_status text
)
language sql
security definer
set search_path = ''
as $$
  select
    ps.id,
    ps.status::text,
    ps.payment_status::text,
    finance.payout_status::text
  from public.peer_sessions as ps
  left join public.meridian_session_financials as finance
    on finance.session_id = ps.id
  where ps.learner_id = p_user_id or ps.mentor_id = p_user_id;
$$;

revoke all on function public.meridian_account_deletion_check(uuid)
  from public, anon, authenticated;
grant execute on function public.meridian_account_deletion_check(uuid)
  to service_role;

commit;
