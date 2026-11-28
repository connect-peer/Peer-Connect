-- Meridian safety, guardian gating, block/report controls, and booking safeguards.
-- Additive migration. It reuses the existing profiles, reports, peer_sessions,
-- peer_session_messages, and peer_blocked_times tables.

create table if not exists public.meridian_account_safety (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date not null,
  guardian_name text,
  guardian_contact text,
  guardian_contact_type text check (guardian_contact_type is null or guardian_contact_type in ('email','phone')),
  guardian_consent_verified_at timestamptz,
  mentor_cleared_for_minors boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meridian_guardian_contact_pair check (
    (guardian_name is null and guardian_contact is null and guardian_contact_type is null)
    or (guardian_name is not null and guardian_contact is not null and guardian_contact_type is not null)
  )
);
alter table public.meridian_account_safety enable row level security;
revoke all on public.meridian_account_safety from anon;
grant select, insert, update on public.meridian_account_safety to authenticated;
drop policy if exists "Meridian users read own safety details" on public.meridian_account_safety;
create policy "Meridian users read own safety details" on public.meridian_account_safety
  for select to authenticated using ((select auth.uid()) = user_id or public.is_peer_connect_verification_admin());
drop policy if exists "Meridian users create own safety details" on public.meridian_account_safety;
create policy "Meridian users create own safety details" on public.meridian_account_safety
  for insert to authenticated with check ((select auth.uid()) = user_id and guardian_consent_verified_at is null and mentor_cleared_for_minors = false);
drop policy if exists "Meridian users update own safety details" on public.meridian_account_safety;
create policy "Meridian users update own safety details" on public.meridian_account_safety
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Meridian reviewers manage safety clearance" on public.meridian_account_safety;
create policy "Meridian reviewers manage safety clearance" on public.meridian_account_safety
  for update to authenticated using (public.is_peer_connect_verification_admin())
  with check (public.is_peer_connect_verification_admin());

create or replace function public.meridian_guard_safety_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and auth.uid() = old.user_id and new.date_of_birth is distinct from old.date_of_birth then
    raise exception 'Date of birth can only be corrected by a Meridian safety reviewer.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and auth.uid() = old.user_id then
    if new.guardian_consent_verified_at is distinct from old.guardian_consent_verified_at
       or new.mentor_cleared_for_minors is distinct from old.mentor_cleared_for_minors then
      raise exception 'Only Meridian safety reviewers can change consent verification or minor clearance.' using errcode = '42501';
    end if;
  end if;
  if new.date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists meridian_guard_safety_fields on public.meridian_account_safety;
create trigger meridian_guard_safety_fields before insert or update on public.meridian_account_safety
  for each row execute function public.meridian_guard_safety_fields();


create table if not exists public.meridian_user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint meridian_no_self_block check (blocker_id <> blocked_id)
);
alter table public.meridian_user_blocks enable row level security;
revoke all on public.meridian_user_blocks from anon;
grant select, insert, delete on public.meridian_user_blocks to authenticated;
drop policy if exists "Users view their own blocks" on public.meridian_user_blocks;
create policy "Users view their own blocks" on public.meridian_user_blocks
  for select to authenticated using ((select auth.uid()) = blocker_id or (select auth.uid()) = blocked_id);
drop policy if exists "Users create their own blocks" on public.meridian_user_blocks;
create policy "Users create their own blocks" on public.meridian_user_blocks
  for insert to authenticated with check ((select auth.uid()) = blocker_id and blocker_id <> blocked_id);
drop policy if exists "Users remove their own blocks" on public.meridian_user_blocks;
create policy "Users remove their own blocks" on public.meridian_user_blocks
  for delete to authenticated using ((select auth.uid()) = blocker_id);

alter table public.reports add column if not exists category text;
alter table public.reports add column if not exists severity text not null default 'normal';
alter table public.reports add column if not exists is_auto_flagged boolean not null default false;
alter table public.reports add column if not exists reviewer_note text;
alter table public.reports add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.reports add column if not exists reviewed_at timestamptz;
alter table public.reports add column if not exists action_taken text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.reports'::regclass and conname = 'reports_meridian_severity_check') then
    alter table public.reports add constraint reports_meridian_severity_check check (severity in ('normal','urgent')) not valid;
  end if;
end $$;
alter table public.reports validate constraint reports_meridian_severity_check;
alter table public.reports alter column status set default 'new';
drop policy if exists "Meridian reviewers read reports" on public.reports;
create policy "Meridian reviewers read reports" on public.reports
  for select to authenticated using (public.is_peer_connect_verification_admin());
drop policy if exists "Meridian reviewers update reports" on public.reports;
create policy "Meridian reviewers update reports" on public.reports
  for update to authenticated using (public.is_peer_connect_verification_admin())
  with check (public.is_peer_connect_verification_admin());

create table if not exists public.meridian_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  moderator_id uuid not null references public.profiles(id),
  action text not null check (action in ('warn','suspend','ban','refund','resolve')),
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.meridian_moderation_actions enable row level security;
revoke all on public.meridian_moderation_actions from anon;
grant select, insert on public.meridian_moderation_actions to authenticated;
drop policy if exists "Only reviewers view moderation actions" on public.meridian_moderation_actions;
create policy "Only reviewers view moderation actions" on public.meridian_moderation_actions
  for select to authenticated using (public.is_peer_connect_verification_admin());
drop policy if exists "Reviewers create moderation actions" on public.meridian_moderation_actions;
create policy "Reviewers create moderation actions" on public.meridian_moderation_actions
  for insert to authenticated with check (public.is_peer_connect_verification_admin() and moderator_id = (select auth.uid()));

create table if not exists public.meridian_user_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_status text not null default 'good_standing' check (account_status in ('good_standing','warned','suspended','banned')),
  suspended_until timestamptz,
  reason text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.meridian_user_restrictions enable row level security;
revoke all on public.meridian_user_restrictions from anon;
grant select on public.meridian_user_restrictions to authenticated;
drop policy if exists "Users see their restriction status" on public.meridian_user_restrictions;
create policy "Users see their restriction status" on public.meridian_user_restrictions
  for select to authenticated using ((select auth.uid()) = user_id or public.is_peer_connect_verification_admin());

create or replace function public.meridian_review_report(p_report_id uuid, p_action text, p_note text default '', p_suspend_until timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if not public.is_peer_connect_verification_admin() then raise exception 'Reviewer access required.' using errcode = '42501'; end if;
  if p_action not in ('warn','suspend','ban','refund','resolve') then raise exception 'Choose a supported review action.' using errcode = '22023'; end if;
  select reported_user_id into target from public.reports where id = p_report_id for update;
  if not found then raise exception 'Report not found.' using errcode = 'P0002'; end if;
  update public.reports set status = 'reviewed', action_taken = p_action, reviewer_note = left(coalesce(p_note,''),1000), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_report_id;
  insert into public.meridian_moderation_actions(report_id,target_user_id,moderator_id,action,note)
   values (p_report_id,target,auth.uid(),p_action,left(coalesce(p_note,''),1000));
  if target is not null and p_action in ('warn','suspend','ban','resolve') then
    insert into public.meridian_user_restrictions(user_id,account_status,suspended_until,reason,updated_by,updated_at)
    values (target, case p_action when 'warn' then 'warned' when 'suspend' then 'suspended' when 'ban' then 'banned' else 'good_standing' end,
      case when p_action = 'suspend' then coalesce(p_suspend_until,now()+interval '24 hours') else null end,
      nullif(left(coalesce(p_note,''),1000),''), auth.uid(), now())
    on conflict (user_id) do update set account_status=excluded.account_status,suspended_until=excluded.suspended_until,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
  end if;
end;
$$;
revoke all on function public.meridian_review_report(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.meridian_review_report(uuid,text,text,timestamptz) to authenticated;

create or replace function public.meridian_require_active_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid; account_state text; until_at timestamptz; birth_date date; guardian_ok boolean;
begin
  actor := coalesce(nullif(to_jsonb(new)->>'author_id','')::uuid, nullif(to_jsonb(new)->>'sender_id','')::uuid, nullif(to_jsonb(new)->>'learner_id','')::uuid);
  if actor is null then return new; end if;
  select account_status,suspended_until into account_state,until_at from public.meridian_user_restrictions where user_id=actor;
  if account_state='banned' or (account_state='suspended' and (until_at is null or until_at>now())) then
    raise exception 'This Meridian account cannot post or book right now.' using errcode='42501';
  end if;
  select date_of_birth, guardian_consent_verified_at is not null
    into birth_date, guardian_ok from public.meridian_account_safety where user_id=actor;
  if birth_date is null then
    raise exception 'Finish your private age and guardian setup before using Meridian.' using errcode='42501';
  end if;
  if birth_date > current_date - interval '14 years' then
    raise exception 'Meridian is currently available to learners aged 14 and older.' using errcode='42501';
  end if;
  if birth_date > current_date - interval '18 years' and not coalesce(guardian_ok,false) then
    raise exception 'Verified parent or guardian consent is required before using Meridian.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.meridian_require_active_account() from public, anon, authenticated;
drop trigger if exists meridian_active_post on public.posts;
create trigger meridian_active_post before insert on public.posts for each row execute function public.meridian_require_active_account();
drop trigger if exists meridian_active_comment on public.post_comments;
create trigger meridian_active_comment before insert on public.post_comments for each row execute function public.meridian_require_active_account();
drop trigger if exists meridian_active_doubt on public.doubts;
create trigger meridian_active_doubt before insert on public.doubts for each row execute function public.meridian_require_active_account();
drop trigger if exists meridian_active_answer on public.answers;
create trigger meridian_active_answer before insert on public.answers for each row execute function public.meridian_require_active_account();
drop trigger if exists meridian_active_chat on public.peer_session_messages;
create trigger meridian_active_chat before insert on public.peer_session_messages for each row execute function public.meridian_require_active_account();

create table if not exists public.meridian_session_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.peer_sessions(id) on delete cascade,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  guidance_result text not null check (guidance_result in ('helpful','somewhat','not_helpful')),
  next_step text not null check (char_length(btrim(next_step)) between 5 and 500),
  created_at timestamptz not null default now()
);
alter table public.meridian_session_feedback enable row level security;
revoke all on public.meridian_session_feedback from anon, authenticated;
grant select, insert on public.meridian_session_feedback to authenticated;
drop policy if exists "Learners view their own feedback" on public.meridian_session_feedback;
create policy "Learners view their own feedback" on public.meridian_session_feedback
  for select to authenticated using (learner_id = (select auth.uid()) or public.is_peer_connect_verification_admin());
drop policy if exists "Feedback is submitted through the guarded RPC" on public.meridian_session_feedback;
create policy "Feedback is submitted through the guarded RPC" on public.meridian_session_feedback
  for insert to authenticated with check (false);

create or replace function public.meridian_submit_session_feedback(p_session_id uuid, p_stars smallint, p_result text, p_next_step text)
returns void language plpgsql security definer set search_path = '' as $$
declare session_row public.peer_sessions%rowtype; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to share session feedback.' using errcode = '42501'; end if;
  select * into session_row from public.peer_sessions where id = p_session_id for update;
  if not found or session_row.learner_id <> actor or session_row.status <> 'completed' or session_row.ends_at > now() then
    raise exception 'Feedback is available to the learner after a completed Bearings call.' using errcode = '42501';
  end if;
  if p_stars not between 1 and 5 or p_result not in ('helpful','somewhat','not_helpful') or char_length(btrim(coalesce(p_next_step,''))) not between 5 and 500 then
    raise exception 'Choose a rating, guidance result, and next step.' using errcode = '23514';
  end if;
  if p_result = 'not_helpful' then
    insert into public.reports(reporter_id,reported_user_id,reason,details,status,category,severity)
    values(actor,session_row.mentor_id,'session_guidance','Learner marked completed guidance as not helpful; private review requested.','new','session quality','normal');
  end if;
  insert into public.meridian_session_feedback(session_id,learner_id,mentor_id,stars,guidance_result,next_step)
  values(p_session_id,actor,session_row.mentor_id,p_stars,p_result,btrim(p_next_step));
end;
$$;
revoke all on function public.meridian_submit_session_feedback(uuid,smallint,text,text) from public, anon;
grant execute on function public.meridian_submit_session_feedback(uuid,smallint,text,text) to authenticated;

create or replace function public.meridian_mentor_rating(p_mentor_id uuid)
returns table (rating numeric, review_count bigint) language sql stable security definer set search_path = '' as $$
  select case when count(*) >= 3 then round(avg(stars)::numeric,1) else null end, count(*)
  from public.meridian_session_feedback where mentor_id = p_mentor_id
$$;
revoke all on function public.meridian_mentor_rating(uuid) from public, anon;
grant execute on function public.meridian_mentor_rating(uuid) to authenticated;

-- Contact details are detected both in the browser for an immediate warning
-- and here so a modified client cannot publish or send them.
create or replace function public.meridian_contains_contact_info(p_text text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare normalized text := lower(coalesce(p_text, ''));
begin
  normalized := regexp_replace(normalized, '\s+at\s+', '@', 'g');
  normalized := regexp_replace(normalized, '\s+dot\s+', '.', 'g');
  normalized := regexp_replace(normalized, '\m(zero|oh)\M', '0', 'g');
  normalized := regexp_replace(normalized, '\m(one)\M', '1', 'g');
  normalized := regexp_replace(normalized, '\m(two|to|too)\M', '2', 'g');
  normalized := regexp_replace(normalized, '\m(three)\M', '3', 'g');
  normalized := regexp_replace(normalized, '\m(four|for)\M', '4', 'g');
  normalized := regexp_replace(normalized, '\m(five)\M', '5', 'g');
  normalized := regexp_replace(normalized, '\m(six)\M', '6', 'g');
  normalized := regexp_replace(normalized, '\m(seven)\M', '7', 'g');
  normalized := regexp_replace(normalized, '\m(eight)\M', '8', 'g');
  normalized := regexp_replace(normalized, '\m(nine)\M', '9', 'g');
  if normalized ~* '[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*\.\s*[a-z]{2,}' then return true; end if;
  if normalized ~* '(https?://|www\.|instagram|telegram|snapchat|discord|whatsapp|facebook|t\.me|@[a-z0-9_]{2,})' then return true; end if;
  if length(regexp_replace(normalized, '[^0-9]', '', 'g')) between 10 and 13 then return true; end if;
  if regexp_replace(normalized, '[^0-9]', '', 'g') ~ '[0-9]{10,13}' then return true; end if;
  return false;
end;
$$;
revoke all on function public.meridian_contains_contact_info(text) from public, anon;
grant execute on function public.meridian_contains_contact_info(text) to authenticated;

create or replace function public.meridian_filter_contact_content()
returns trigger language plpgsql security definer set search_path = '' as $$
declare content text; owner_id uuid; content_key text;
begin
  content := coalesce(to_jsonb(new)->>'content', to_jsonb(new)->>'body', '');
  owner_id := coalesce(nullif(to_jsonb(new)->>'author_id','')::uuid, nullif(to_jsonb(new)->>'sender_id','')::uuid);
  if owner_id is not null and public.meridian_contains_contact_info(content) then
    insert into public.reports (reporter_id, reported_user_id, reason, details, status, category, severity, is_auto_flagged)
    values (owner_id, owner_id, 'contact_info', 'Safety filter blocked a message that appeared to contain contact details. Original text was not retained.', 'new', 'contact details', 'normal', true);
    content_key := case when to_jsonb(new) ? 'content' then 'content' else 'body' end;
    new := jsonb_populate_record(new, jsonb_set(to_jsonb(new), array[content_key], to_jsonb('This was hidden because it may contain private contact details. Keep Meridian conversations focused on learning.'::text)));
  end if;
  return new;
end;
$$;
drop trigger if exists meridian_contact_filter_messages on public.peer_session_messages;
create trigger meridian_contact_filter_messages before insert on public.peer_session_messages
  for each row execute function public.meridian_filter_contact_content();
drop trigger if exists meridian_contact_filter_posts on public.posts;
create trigger meridian_contact_filter_posts before insert on public.posts
  for each row execute function public.meridian_filter_contact_content();
drop trigger if exists meridian_contact_filter_post_comments on public.post_comments;
create trigger meridian_contact_filter_post_comments before insert on public.post_comments
  for each row execute function public.meridian_filter_contact_content();
drop trigger if exists meridian_contact_filter_doubts on public.doubts;
create trigger meridian_contact_filter_doubts before insert on public.doubts
  for each row execute function public.meridian_filter_contact_content();
drop trigger if exists meridian_contact_filter_answers on public.answers;
create trigger meridian_contact_filter_answers before insert on public.answers
  for each row execute function public.meridian_filter_contact_content();

alter table public.peer_sessions add column if not exists response_deadline timestamptz;
alter table public.peer_sessions add column if not exists decline_reason text;
alter table public.peer_sessions add column if not exists payment_status text not null default 'unpaid';
alter table public.peer_sessions add column if not exists price_inr numeric(8,2) not null default 0;
alter table public.peer_sessions add column if not exists razorpay_order_id text;
alter table public.peer_sessions add column if not exists razorpay_payment_id text;
alter table public.peer_sessions add column if not exists video_room_id text;
alter table public.peer_sessions add column if not exists video_room_created_at timestamptz;
alter table public.peer_sessions add column if not exists cancel_reason text;
alter table public.peer_sessions add column if not exists cancelled_by uuid references public.profiles(id);
update public.peer_sessions set response_deadline = created_at + interval '12 hours' where response_deadline is null and status = 'pending';
alter table public.peer_sessions drop constraint if exists peer_sessions_payment_status_check;
alter table public.peer_sessions add constraint peer_sessions_payment_status_check
  check (payment_status in ('unpaid','checkout_pending','held','captured','refund_pending','refunded','credit_pending','voided')) not valid;
alter table public.peer_sessions validate constraint peer_sessions_payment_status_check;

-- Private payout routing and auditable 25/75 settlement split. Linked-account
-- IDs are populated only after the merchant has completed provider onboarding.
create table if not exists public.meridian_mentor_payout_accounts (
  mentor_id uuid primary key references public.profiles(id) on delete cascade,
  route_account_id text not null unique,
  created_at timestamptz not null default now()
);
revoke all on public.meridian_mentor_payout_accounts from public,anon,authenticated;
grant select,insert,update,delete on public.meridian_mentor_payout_accounts to service_role;
create table if not exists public.meridian_platform_config (
  singleton boolean primary key default true check (singleton),
  commission_percent numeric(5,2) not null default 25 check (commission_percent between 0 and 50),
  minimum_session_price_inr numeric(8,2) not null default 99 check (minimum_session_price_inr >= 0),
  maximum_session_price_inr numeric(8,2) not null default 299 check (maximum_session_price_inr >= minimum_session_price_inr),
  updated_at timestamptz not null default now()
);
insert into public.meridian_platform_config(singleton) values(true) on conflict(singleton) do nothing;
alter table public.meridian_platform_config enable row level security;
revoke all on public.meridian_platform_config from public,anon,authenticated;
grant select,insert,update,delete on public.meridian_platform_config to service_role;
create table if not exists public.meridian_session_financials (
  session_id uuid primary key references public.peer_sessions(id) on delete cascade,
  gross_inr numeric(8,2) not null,
  platform_fee_inr numeric(8,2) not null,
  mentor_amount_inr numeric(8,2) not null,
  payout_status text not null default 'awaiting_capture' check (payout_status in ('awaiting_capture','captured','waiting_for_completion','payout_pending','paid','refund_pending','refunded','payout_setup_required')),
  razorpay_transfer_id text unique,
  updated_at timestamptz not null default now(),
  constraint meridian_financial_split_check check (gross_inr=platform_fee_inr+mentor_amount_inr)
);
alter table public.meridian_session_financials enable row level security;
revoke all on public.meridian_session_financials from public,anon,authenticated;
grant select,insert,update on public.meridian_session_financials to service_role;
create table if not exists public.meridian_payment_webhook_events (
  event_id text primary key,
  event_name text not null,
  received_at timestamptz not null default now()
);
revoke all on public.meridian_payment_webhook_events from public,anon,authenticated;
grant select,insert on public.meridian_payment_webhook_events to service_role;
create or replace function public.meridian_snapshot_session_financials()
returns trigger language plpgsql security definer set search_path = '' as $$
declare gross numeric(8,2); fee numeric(8,2); commission numeric(5,2);
begin
  gross := round(new.price_inr::numeric,2);
  select commission_percent into commission from public.meridian_platform_config where singleton=true;
  fee := round(gross*coalesce(commission,25)/100,2);
  insert into public.meridian_session_financials(session_id,gross_inr,platform_fee_inr,mentor_amount_inr)
  values(new.id,gross,fee,gross-fee) on conflict(session_id) do nothing;
  return new;
end;
$$;
drop trigger if exists meridian_snapshot_session_financials on public.peer_sessions;
create trigger meridian_snapshot_session_financials after insert on public.peer_sessions
  for each row execute function public.meridian_snapshot_session_financials();
insert into public.meridian_session_financials(session_id,gross_inr,platform_fee_inr,mentor_amount_inr)
select s.id,round(s.price_inr::numeric,2),round(s.price_inr::numeric*c.commission_percent/100,2),round(s.price_inr::numeric,2)-round(s.price_inr::numeric*c.commission_percent/100,2)
from public.peer_sessions s cross join public.meridian_platform_config c
where s.price_inr>0 on conflict(session_id) do nothing;

create or replace function public.meridian_financial_ledger(p_mentor_id uuid default null)
returns table(session_id uuid,mentor_id uuid,mentor_name text,starts_at timestamptz,session_status text,gross_inr numeric,platform_fee_inr numeric,mentor_amount_inr numeric,payout_status text)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); reviewer boolean := public.is_peer_connect_verification_admin();
begin
  if actor is null then raise exception 'Sign in to view the Meridian settlement ledger.' using errcode='42501'; end if;
  if not reviewer and p_mentor_id is not null and p_mentor_id<>actor then raise exception 'You can only view your own mentor settlement rows.' using errcode='42501'; end if;
  return query
    select f.session_id,s.mentor_id,p.display_name,s.starts_at,s.status,f.gross_inr,f.platform_fee_inr,f.mentor_amount_inr,f.payout_status
    from public.meridian_session_financials f join public.peer_sessions s on s.id=f.session_id
    join public.profiles p on p.id=s.mentor_id
    where (reviewer and (p_mentor_id is null or s.mentor_id=p_mentor_id)) or (not reviewer and s.mentor_id=actor)
    order by s.starts_at desc limit 500;
end;
$$;
revoke all on function public.meridian_financial_ledger(uuid) from public,anon;
grant execute on function public.meridian_financial_ledger(uuid) to authenticated;

-- Keep old records for audit, and decline duplicate active requests before
-- creating the database-level one-person/one-time constraints.
with ranked as (
  select id, row_number() over (
    partition by mentor_id, starts_at order by (status = 'confirmed') desc, created_at, id
  ) as position
  from public.peer_sessions where status in ('pending','confirmed')
)
update public.peer_sessions s set status = 'declined', mentor_note = 'Declined during Meridian slot conflict cleanup.'
from ranked r where r.id = s.id and r.position > 1;
create unique index if not exists meridian_one_active_booking_per_mentor_slot
  on public.peer_sessions (mentor_id, starts_at) where status in ('pending','confirmed');
create unique index if not exists meridian_one_active_booking_per_learner_slot
  on public.peer_sessions (learner_id, starts_at) where status in ('pending','confirmed');

create or replace function public.meridian_validate_session_write()
returns trigger language plpgsql set search_path = '' as $$
declare actor uuid := auth.uid(); learner_birth date; mentor_birth date; learner_grade smallint; mentor_grade smallint;
  min_price numeric(8,2); max_price numeric(8,2);
begin
  -- The scheduled expiry job runs as service_role/postgres without an end-user JWT.
  if actor is null and current_user in ('service_role','postgres') then
    if tg_op <> 'UPDATE' or
       (new.learner_id,new.mentor_id,new.starts_at,new.ends_at,new.session_type_id,new.learner_note,new.timezone,new.price_inr)
         is distinct from (old.learner_id,old.mentor_id,old.starts_at,old.ends_at,old.session_type_id,old.learner_note,old.timezone,old.price_inr) then
      raise exception 'System booking actions cannot change who booked, the time, or the price.' using errcode='42501';
    end if;
    if new.status not in ('pending','confirmed','declined','cancelled','completed','no_show') or
       not ((old.status=new.status) or (old.status='pending' and new.status in ('confirmed','declined','cancelled')) or
            (old.status='confirmed' and new.status in ('cancelled','completed','no_show'))) then
      raise exception 'Invalid system booking transition.' using errcode='42501';
    end if;
    if new.cancelled_by is distinct from old.cancelled_by and not
       (new.status='cancelled' and new.cancelled_by in (new.learner_id,new.mentor_id)) then
      raise exception 'Cancellation must be attributed to a booking participant.' using errcode='42501';
    end if;
    if new.payment_status is distinct from old.payment_status and not (
       (old.payment_status in ('checkout_pending','unpaid') and new.payment_status in ('held','captured','voided')) or
       (old.payment_status='held' and new.payment_status in ('captured','voided','refund_pending')) or
       (old.payment_status='captured' and new.payment_status in ('refund_pending','credit_pending')) or
       (old.payment_status='refund_pending' and new.payment_status in ('refunded','credit_pending')) or
       (old.payment_status='voided' and new.payment_status='refund_pending')
    ) then raise exception 'Invalid payment state transition.' using errcode='42501'; end if;
    if new.razorpay_order_id is distinct from old.razorpay_order_id and (old.razorpay_order_id is not null or new.razorpay_order_id is null or new.status<>'pending') then
      raise exception 'Payment order can only be attached once to a pending booking.' using errcode='42501';
    end if;
    if new.razorpay_payment_id is distinct from old.razorpay_payment_id and (old.razorpay_payment_id is not null or new.razorpay_payment_id is null) then
      raise exception 'Payment ID can only be attached once.' using errcode='42501';
    end if;
    if new.video_room_id is distinct from old.video_room_id and (old.video_room_id is not null or new.video_room_id is null or old.status<>'confirmed' or old.payment_status<>'captured') then
      raise exception 'A video room can only be attached once to a paid, confirmed session.' using errcode='42501';
    end if;
    if new.response_deadline is distinct from old.response_deadline then raise exception 'Response deadline cannot be changed.' using errcode='42501'; end if;
    if new.status='confirmed' and new.payment_status not in ('captured') then raise exception 'Capture payment before confirming the session.' using errcode='42501'; end if;
    if new.status='declined' and new.payment_status not in ('voided','unpaid','checkout_pending','held','refund_pending','refunded') then raise exception 'Release or void the payment before declining.' using errcode='42501'; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if actor is null or new.learner_id <> actor or new.status <> 'pending' then
      raise exception 'Only a signed-in learner can request a Bearings call.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles p where p.id = actor and p.role in ('learner','both')) then
      raise exception 'Choose Learner or Both before booking.' using errcode = '42501';
    end if;
    select grade into learner_grade from public.profiles where id = actor;
    select grade into mentor_grade from public.profiles where id = new.mentor_id;
    if learner_grade is null or mentor_grade not between learner_grade + 1 and learner_grade + 3 then
      raise exception 'Choose a Senior one to three classes ahead of you.' using errcode = '42501';
    end if;
    select date_of_birth into learner_birth from public.meridian_account_safety where user_id = actor;
    if learner_birth is null or learner_birth > current_date - interval '14 years' then
      raise exception 'Meridian calls are available from age 14.' using errcode = '42501';
    end if;
    if learner_birth > current_date - interval '18 years' and not exists (
      select 1 from public.meridian_account_safety where user_id = actor and guardian_consent_verified_at is not null
    ) then raise exception 'Verified guardian consent is required before booking.' using errcode = '42501'; end if;
    if not public.is_peer_mentor_bookable(new.mentor_id) then
      raise exception 'This Journey map is not currently available for bookings.' using errcode = '42501';
    end if;
    select date_of_birth into mentor_birth from public.meridian_account_safety where user_id = new.mentor_id;
    if mentor_birth is null or mentor_birth > current_date - interval '14 years' then
      raise exception 'This Senior is not cleared for bookings.' using errcode = '42501';
    end if;
    if learner_birth > current_date - interval '18 years' and not exists (
      select 1 from public.meridian_account_safety where user_id = new.mentor_id and mentor_cleared_for_minors
    ) then raise exception 'This Senior is not yet cleared to meet younger learners.' using errcode = '42501'; end if;
    if exists (select 1 from public.meridian_user_blocks b where
      (b.blocker_id = actor and b.blocked_id = new.mentor_id) or (b.blocker_id = new.mentor_id and b.blocked_id = actor)
    ) then raise exception 'This booking is not available.' using errcode = '42501'; end if;
    if not exists (select 1 from public.peer_session_types st where st.id=new.session_type_id and st.mentor_id=new.mentor_id
      and st.is_platform_session=true and st.is_active=true and st.duration_minutes=30) then
      raise exception 'Choose the company-set 30-minute Bearings call.' using errcode='23514';
    end if;
    if new.timezone <> 'Asia/Kolkata' or new.ends_at - new.starts_at <> interval '30 minutes' or new.starts_at <= now()
       or extract(hour from new.starts_at at time zone 'Asia/Kolkata') < 8
       or extract(hour from new.starts_at at time zone 'Asia/Kolkata') >= 20
       or mod(extract(minute from new.starts_at at time zone 'Asia/Kolkata')::integer, 30) <> 0 then
      raise exception 'Choose an open 30-minute time between 8:00 AM and 8:00 PM India time.' using errcode = '23514';
    end if;
    if exists (select 1 from public.peer_blocked_times b where b.mentor_id = new.mentor_id
      and b.starts_at < new.ends_at and b.ends_at > new.starts_at) then
      raise exception 'That time is blocked by the Senior.' using errcode = '23P01';
    end if;
    if char_length(btrim(coalesce(new.learner_note,''))) not between 20 and 300 then
      raise exception 'Add a learning question between 20 and 300 characters.' using errcode = '23514';
    end if;
    if public.meridian_contains_contact_info(new.learner_note) then
      raise exception 'Remove phone numbers, emails, links, and social handles from the question.' using errcode = '23514';
    end if;
    new.response_deadline := now() + interval '12 hours';
    new.payment_status := 'checkout_pending';
    select tp.session_price_inr into new.price_inr from public.tutor_profiles tp where tp.user_id=new.mentor_id;
    select minimum_session_price_inr, maximum_session_price_inr
      into min_price, max_price
      from public.meridian_platform_config where singleton=true;
    if new.price_inr is null or new.price_inr not between coalesce(min_price,99) and coalesce(max_price,299) then
      raise exception 'This mentor has not set up a valid session price.' using errcode='23514';
    end if;
  else
    if actor is null or (new.learner_id, new.mentor_id, new.starts_at, new.ends_at, new.session_type_id, new.learner_note)
       is distinct from (old.learner_id, old.mentor_id, old.starts_at, old.ends_at, old.session_type_id, old.learner_note) then
      raise exception 'Booking details cannot be changed after a request is sent.' using errcode = '42501';
    end if;
    if new.payment_status is distinct from old.payment_status or new.price_inr is distinct from old.price_inr
       or new.razorpay_order_id is distinct from old.razorpay_order_id
       or new.razorpay_payment_id is distinct from old.razorpay_payment_id
       or new.video_room_id is distinct from old.video_room_id
       or new.video_room_created_at is distinct from old.video_room_created_at
       or new.response_deadline is distinct from old.response_deadline then
      raise exception 'Payment and response deadline fields are managed by Meridian.' using errcode = '42501';
    end if;
    if actor = old.learner_id then
      if new.decline_reason is distinct from old.decline_reason then raise exception 'Only the Senior can set a decline reason.' using errcode = '42501'; end if;
      if new.status not in (old.status,'cancelled') then raise exception 'Learners can only cancel their own booking.' using errcode = '42501'; end if;
      if new.status = 'cancelled' and old.status in ('pending','confirmed') then
        new.payment_status := case when old.razorpay_payment_id is null then 'voided' else 'refund_pending' end;
        new.cancelled_by := actor;
      elsif new.cancelled_by is distinct from old.cancelled_by then
        raise exception 'Only a cancellation can set its participant.' using errcode='42501';
      end if;
    elsif actor = old.mentor_id then
      if not ((old.status = 'pending' and new.status in ('confirmed','declined')) or
              (old.status = 'confirmed' and new.status in ('cancelled','completed','no_show')) or new.status = old.status) then
        raise exception 'That booking update is not allowed.' using errcode = '42501';
      end if;
      if old.status = 'pending' and now() > old.response_deadline then
        raise exception 'The 12-hour response window has passed.' using errcode = '42501';
      end if;
      if old.status = 'pending' and new.status = 'confirmed' and old.payment_status <> 'captured' then
        raise exception 'The learner payment must be captured before confirming.' using errcode = '42501';
      end if;
      if new.status = 'declined' and nullif(btrim(new.decline_reason),'') is null then
        raise exception 'Choose a reason before declining the request.' using errcode = '23514';
      end if;
      if new.status = 'cancelled' then new.payment_status := 'refund_pending'; new.cancelled_by := actor;
      elsif new.cancelled_by is distinct from old.cancelled_by then
        raise exception 'Only a cancellation can set its participant.' using errcode='42501';
      end if;
    else
      raise exception 'Only people in this booking can update it.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists meridian_validate_session_write on public.peer_sessions;
create trigger meridian_validate_session_write before insert or update on public.peer_sessions
  for each row execute function public.meridian_validate_session_write();

drop policy if exists "Active session participants send chat messages" on public.peer_session_messages;
create policy "Active session participants send chat messages" on public.peer_session_messages
  as restrictive for insert to authenticated with check (
    sender_id = (select auth.uid()) and exists (
      select 1 from public.peer_sessions s where s.id = peer_session_messages.session_id
        and s.status = 'confirmed' and s.starts_at <= now() and s.ends_at > now()
        and (s.learner_id = (select auth.uid()) or s.mentor_id = (select auth.uid()))
        and not exists (select 1 from public.meridian_user_blocks b where
          (b.blocker_id = s.learner_id and b.blocked_id = s.mentor_id)
          or (b.blocker_id = s.mentor_id and b.blocked_id = s.learner_id))
    )
  );
drop policy if exists "Meridian active session chat send" on public.peer_session_messages;
create policy "Meridian active session chat send" on public.peer_session_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and exists (
      select 1 from public.peer_sessions s where s.id = peer_session_messages.session_id
        and s.status = 'confirmed' and s.starts_at <= now() and s.ends_at > now()
        and (s.learner_id = (select auth.uid()) or s.mentor_id = (select auth.uid()))
        and not exists (select 1 from public.meridian_user_blocks b where
          (b.blocker_id = s.learner_id and b.blocked_id = s.mentor_id)
          or (b.blocker_id = s.mentor_id and b.blocked_id = s.learner_id))
    )
  );

drop policy if exists "Meridian learners request direct bookings" on public.peer_sessions;
create policy "Meridian learners request direct bookings" on public.peer_sessions
  for insert to authenticated with check (learner_id = (select auth.uid()) and connection_id is null);
drop policy if exists "Meridian direct booking guard" on public.peer_sessions;
create policy "Meridian direct booking guard" on public.peer_sessions
  as restrictive for insert to authenticated with check (learner_id = (select auth.uid()) and connection_id is null);

create or replace function public.meridian_decline_expired_requests()
returns integer language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.peer_sessions set status = 'declined', decline_reason = 'no_response',
    mentor_note = 'Automatically declined after the response deadline.',
    payment_status = case when payment_status in ('unpaid','checkout_pending') and razorpay_payment_id is null then 'voided' else 'refund_pending' end
  where status = 'pending' and (response_deadline <= now() or (payment_status='checkout_pending' and created_at <= now() - interval '15 minutes'));
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.meridian_decline_expired_requests() from public, anon, authenticated;
grant execute on function public.meridian_decline_expired_requests() to service_role;

create or replace function public.meridian_abandon_unpaid_booking(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to release this booking.' using errcode='42501'; end if;
  update public.peer_sessions set status='cancelled', decline_reason='payment_abandoned',
    mentor_note='Learner closed payment before completing checkout.', payment_status='voided'
  where id=p_session_id and learner_id=auth.uid() and status='pending'
    and payment_status in ('unpaid','checkout_pending') and razorpay_payment_id is null;
  if not found then raise exception 'This booking can no longer be released this way.' using errcode='42501'; end if;
end;
$$;
revoke all on function public.meridian_abandon_unpaid_booking(uuid) from public,anon;
grant execute on function public.meridian_abandon_unpaid_booking(uuid) to authenticated;

-- When Supabase's pg_cron extension is enabled, expire unanswered requests once
-- per minute. If it is not enabled, the migration still succeeds and the
-- function remains available for a scheduled Edge Function to call.
do $$
declare prior_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select jobid from cron.job where jobname = $1' into prior_job using 'meridian-expire-bookings';
    if prior_job is not null then execute 'select cron.unschedule($1)' using prior_job; end if;
    execute $job$select cron.schedule('meridian-expire-bookings', '* * * * *', 'select public.meridian_decline_expired_requests()')$job$;
  end if;
exception when insufficient_privilege or undefined_function then
  raise notice 'pg_cron is unavailable; schedule meridian_decline_expired_requests() with a Supabase scheduled function.';
end $$;

comment on table public.meridian_account_safety is 'Private age and guardian-consent status. Keep access limited; use a verified server workflow to set consent timestamps.';
comment on table public.meridian_user_blocks is 'One-direction block records; either direction prevents Meridian contact and bookings.';
comment on function public.meridian_contains_contact_info(text) is 'Server-side guard for phone, email, URL, and social contact information in community content.';

-- Meridian mentor journey, profile detail, and private recommendation analytics.
alter table public.tutor_profiles add column if not exists guidance_strengths text[] not null default '{}';
alter table public.tutor_profiles add column if not exists guidance_goals text[] not null default '{}';
alter table public.tutor_profiles add column if not exists guidance_exams text[] not null default '{}';
alter table public.tutor_profiles add column if not exists guidance_languages text[] not null default '{}';
alter table public.tutor_profiles add column if not exists board text;
alter table public.tutor_profiles add column if not exists city_tier text;
alter table public.tutor_profiles add column if not exists study_style text;
alter table public.tutor_profiles add column if not exists advises_best text;
alter table public.tutor_profiles add column if not exists advises_not text;
alter table public.tutor_profiles add column if not exists lessons_learned text;
alter table public.tutor_profiles add column if not exists weekly_session_cap smallint not null default 8;
alter table public.tutor_profiles add column if not exists session_price_inr numeric(8,2) not null default 199;
alter table public.learner_guidance_profiles add column if not exists study_style text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.tutor_profiles'::regclass and conname='tutor_profiles_session_price_check') then
    alter table public.tutor_profiles add constraint tutor_profiles_session_price_check check (session_price_inr between 99 and 299) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.tutor_profiles'::regclass and conname='tutor_profiles_weekly_cap_check') then
    alter table public.tutor_profiles add constraint tutor_profiles_weekly_cap_check check (weekly_session_cap between 1 and 30) not valid;
  end if;
end $$;
alter table public.tutor_profiles validate constraint tutor_profiles_session_price_check;
alter table public.tutor_profiles validate constraint tutor_profiles_weekly_cap_check;

create table if not exists public.meridian_mentor_journey (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stage_year smallint not null check (stage_year between 2000 and 2100),
  stage text not null check (char_length(btrim(stage)) between 2 and 80),
  choice text not null check (char_length(btrim(choice)) between 2 and 180),
  why text not null check (char_length(btrim(why)) between 5 and 280),
  completed_at date,
  position smallint not null default 0 check (position between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, position)
);
alter table public.meridian_mentor_journey enable row level security;
revoke all on public.meridian_mentor_journey from anon;
grant select, insert, update, delete on public.meridian_mentor_journey to authenticated;
drop policy if exists "Seniors and verified profile viewers read journey" on public.meridian_mentor_journey;
create policy "Seniors and verified profile viewers read journey" on public.meridian_mentor_journey
  for select to authenticated using (user_id=(select auth.uid()) or public.is_peer_mentor_bookable(user_id));
drop policy if exists "Seniors manage their own journey" on public.meridian_mentor_journey;
create policy "Seniors manage their own journey" on public.meridian_mentor_journey
  for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create or replace function public.meridian_save_journey(p_stages jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in to edit your Journey map.' using errcode='42501'; end if;
  if jsonb_typeof(p_stages) is distinct from 'array' then
    raise exception 'Journey stages must be a list.' using errcode='22023';
  end if;
  if jsonb_array_length(p_stages)>12 then
    raise exception 'Add up to 12 journey stages.' using errcode='22023';
  end if;
  if not exists(select 1 from public.tutor_profiles tp where tp.user_id=actor) then
    raise exception 'Create a mentor profile before adding a Journey map.' using errcode='42501';
  end if;
  if exists(select 1 from jsonb_array_elements(p_stages) x where
    char_length(btrim(coalesce(x->>'stage',''))) not between 2 and 80 or
    char_length(btrim(coalesce(x->>'choice',''))) not between 2 and 180 or
    char_length(btrim(coalesce(x->>'why',''))) not between 5 and 280 or
    coalesce((x->>'stage_year')::integer,0) not between 2000 and 2100 or
    public.meridian_contains_contact_info(concat_ws(' ',x->>'stage',x->>'choice',x->>'why'))
  ) then raise exception 'Check each stage, year, choice, and reason. Do not include contact details.' using errcode='23514'; end if;
  delete from public.meridian_mentor_journey where user_id=actor;
  insert into public.meridian_mentor_journey(user_id,stage_year,stage,choice,why,completed_at,position)
  select actor,(entry.value->>'stage_year')::smallint,btrim(entry.value->>'stage'),btrim(entry.value->>'choice'),btrim(entry.value->>'why'),nullif(entry.value->>'completed_at','')::date,(entry.ordinality-1)::smallint
  from jsonb_array_elements(p_stages) with ordinality as entry(value,ordinality);
end $$;
revoke all on function public.meridian_save_journey(jsonb) from public,anon;
grant execute on function public.meridian_save_journey(jsonb) to authenticated;

create table if not exists public.meridian_mentor_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam text not null check (char_length(btrim(exam)) between 2 and 100),
  score_low numeric(7,2) not null,
  score_high numeric(7,2) not null,
  score_unit text not null check (score_unit in ('percent','percentile','marks','rank_range','other')),
  result_year smallint not null check (result_year between 2000 and 2100),
  evidence_path text,
  safe_summary text not null check (char_length(btrim(safe_summary)) between 5 and 240),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint meridian_score_range check (score_low >= 0 and score_high >= score_low)
);
alter table public.mentor_achievements alter column evidence_path drop not null;
alter table public.meridian_mentor_results enable row level security;
revoke all on public.meridian_mentor_results from anon, authenticated;
grant select, insert, update, delete on public.meridian_mentor_results to authenticated;
drop policy if exists "Seniors and reviewers read private result evidence" on public.meridian_mentor_results;
create policy "Seniors and reviewers read private result evidence" on public.meridian_mentor_results
  for select to authenticated using (user_id=(select auth.uid()) or public.is_peer_connect_verification_admin());
drop policy if exists "Seniors add private result evidence" on public.meridian_mentor_results;
create policy "Seniors add private result evidence" on public.meridian_mentor_results
  for insert to authenticated with check (user_id=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists "Seniors edit unreviewed result evidence" on public.meridian_mentor_results;
create policy "Seniors edit unreviewed result evidence" on public.meridian_mentor_results
  for update to authenticated using (user_id=(select auth.uid()) and status in ('pending','rejected'))
  with check (user_id=(select auth.uid()) and status in ('pending','rejected') and reviewed_by is null and reviewed_at is null);
drop policy if exists "Reviewers decide result evidence" on public.meridian_mentor_results;
create policy "Reviewers decide result evidence" on public.meridian_mentor_results
  for update to authenticated using (public.is_peer_connect_verification_admin())
  with check (public.is_peer_connect_verification_admin());
drop policy if exists "Seniors delete unreviewed result evidence" on public.meridian_mentor_results;
create policy "Seniors delete unreviewed result evidence" on public.meridian_mentor_results
  for delete to authenticated using (user_id=(select auth.uid()) and status in ('pending','rejected'));

create or replace function public.meridian_public_journey(p_user_id uuid)
returns table(stage_year smallint,stage text,choice text,why text,completed_at date)
language sql stable security definer set search_path = '' as $$
  select j.stage_year,j.stage,j.choice,j.why,j.completed_at
  from public.meridian_mentor_journey j
  where j.user_id=p_user_id and public.is_peer_mentor_bookable(p_user_id)
  order by j.position,j.stage_year,j.created_at
$$;
revoke all on function public.meridian_public_journey(uuid) from public,anon;
grant execute on function public.meridian_public_journey(uuid) to authenticated;

create or replace function public.meridian_public_results(p_user_id uuid)
returns table(exam text,score_low numeric,score_high numeric,score_unit text,result_year smallint,safe_summary text)
language sql stable security definer set search_path = '' as $$
  select r.exam,r.score_low,r.score_high,r.score_unit,r.result_year,r.safe_summary
  from public.meridian_mentor_results r
  where r.user_id=p_user_id and r.status='approved' and public.is_peer_mentor_bookable(p_user_id)
  order by r.result_year desc,r.created_at desc
$$;
revoke all on function public.meridian_public_results(uuid) from public,anon;
grant execute on function public.meridian_public_results(uuid) to authenticated;

create or replace function public.meridian_public_profile_details(p_user_id uuid)
returns table(guidance_strengths text[],guidance_goals text[],guidance_exams text[],guidance_languages text[],board text,city_tier text,study_style text,advises_best text,advises_not text,lessons_learned text)
language sql stable security definer set search_path = '' as $$
  select tp.guidance_strengths,tp.guidance_goals,tp.guidance_exams,tp.guidance_languages,tp.board,tp.city_tier,tp.study_style,
    tp.advises_best,tp.advises_not,tp.lessons_learned
  from public.tutor_profiles tp
  where tp.user_id=p_user_id and public.is_peer_mentor_bookable(p_user_id)
$$;
revoke all on function public.meridian_public_profile_details(uuid) from public,anon;
grant execute on function public.meridian_public_profile_details(uuid) to authenticated;

create table if not exists public.meridian_match_events (
  id bigint generated always as identity primary key,
  learner_id uuid not null references public.profiles(id) on delete cascade,
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.peer_sessions(id) on delete set null,
  event text not null check (event in ('shown','clicked','booked','rated','rebooked')),
  created_at timestamptz not null default now()
);
alter table public.meridian_match_events enable row level security;
revoke all on public.meridian_match_events from anon,authenticated;
grant select on public.meridian_match_events to authenticated;
drop policy if exists "Learners read their recommendation events" on public.meridian_match_events;
create policy "Learners read their recommendation events" on public.meridian_match_events
  for select to authenticated using (learner_id=(select auth.uid()));

create or replace function public.meridian_log_match_event(p_mentor_id uuid,p_event text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_event not in ('clicked') then raise exception 'Invalid recommendation event.' using errcode='42501'; end if;
  if not public.is_peer_mentor_bookable(p_mentor_id) then raise exception 'This Journey map is no longer available.' using errcode='42501'; end if;
  insert into public.meridian_match_events(learner_id,mentor_id,event) values(auth.uid(),p_mentor_id,p_event);
end $$;
revoke all on function public.meridian_log_match_event(uuid,text) from public,anon;
grant execute on function public.meridian_log_match_event(uuid,text) to authenticated;

create or replace function public.meridian_match_candidates(p_weights jsonb default '{}'::jsonb)
returns table(mentor_id uuid,score integer,why_matched text,rating numeric,review_count bigint)
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); learner_grade smallint; learner_birth date; learner_city text; learner_state text; learner_tier text;
  goal public.learner_guidance_profiles%rowtype; w_stage integer;w_goal integer;w_subject integer;w_background integer;w_availability integer;w_reputation integer;
begin
  if actor is null then raise exception 'Sign in to get Meridian matches.' using errcode='42501'; end if;
  select grade,city,state into learner_grade,learner_city,learner_state from public.profiles where id=actor;
  select date_of_birth into learner_birth from public.meridian_account_safety where user_id=actor;
  select * into goal from public.learner_guidance_profiles where user_id=actor;
  if goal.user_id is null then return; end if;
  select city_tier into learner_tier from public.learner_guidance_profiles where user_id=actor;
  -- Matching weights are server controlled; ignore any caller-supplied JSON.
  w_stage:=40; w_goal:=25; w_subject:=15; w_background:=10; w_availability:=5; w_reputation:=5;
  return query
  with candidates as (
    select tp.user_id,pr.grade,tp.subjects,tp.guidance_strengths,tp.guidance_goals,tp.guidance_exams,tp.board,tp.city_tier,tp.study_style,
      born.mentor_birth as birthday,
      recent.completed_at,coalesce(slots.open_slots,0)::integer as open_slots,
      coalesce(rating.rating,0) as rating_value,coalesce(rating.review_count,0) as review_total,
      coalesce(background.city_match,false) as city_match,coalesce(background.state_match,false) as state_match,
      coalesce(background.board_match,false) as board_match,coalesce(background.style_match,false) as style_match
    from public.tutor_profiles tp join public.profiles pr on pr.id=tp.user_id
    left join public.meridian_account_safety sa on sa.user_id=tp.user_id
    cross join lateral (select sa.date_of_birth as mentor_birth) born
    left join lateral (
      select max(j.completed_at) completed_at from public.meridian_mentor_journey j
      where j.user_id=tp.user_id and lower(j.stage) like ('class '||learner_grade||'%')
    ) recent on true
    left join lateral (
      select count(*) open_slots from public.peer_session_types st
      cross join lateral public.get_peer_session_slots(tp.user_id,st.id,(now() at time zone 'Asia/Kolkata')::date,7) slot
      where st.mentor_id=tp.user_id and st.is_active and st.is_platform_session and slot.starts_at>now()
    ) slots on true
    left join lateral public.meridian_mentor_rating(tp.user_id) rating on true
    left join lateral (select
      lower(coalesce(learner_city,''))<>'' and lower(coalesce(learner_city,''))=lower(coalesce(pl.city,'')) as city_match,
      lower(coalesce(learner_state,''))<>'' and lower(coalesce(learner_state,''))=lower(coalesce(pl.state,'')) as state_match,
      lower(coalesce(goal.board,''))=lower(coalesce(tp.board,'')) as board_match,
      lower(coalesce(goal.city_tier,''))=lower(coalesce(tp.city_tier,'')) as tier_match,
      lower(coalesce(tp.study_style,''))=lower(coalesce(goal.study_style,'')) as style_match
      from public.profiles pl where pl.id=tp.user_id) background on true
    where tp.is_available and public.is_peer_mentor_bookable(tp.user_id)
      and pr.grade between learner_grade+1 and learner_grade+3
      and born.mentor_birth is not null and born.mentor_birth<=current_date-interval '14 years'
      and learner_birth is not null and learner_birth<=current_date-interval '14 years'
      and (learner_birth<=current_date-interval '18 years' or exists(
        select 1 from public.meridian_account_safety ms where ms.user_id=tp.user_id and ms.mentor_cleared_for_minors))
      and tp.guidance_languages && goal.preferred_languages
      and recent.completed_at>=current_date-interval '24 months'
      and not exists(select 1 from public.meridian_user_blocks b where (b.blocker_id=actor and b.blocked_id=tp.user_id) or (b.blocker_id=tp.user_id and b.blocked_id=actor))
      and (select count(*) from public.peer_sessions ps where ps.mentor_id=tp.user_id and ps.status in ('pending','confirmed')
           and ps.starts_at>=date_trunc('week',now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
           and ps.starts_at<=(date_trunc('week',now() at time zone 'Asia/Kolkata')+interval '7 days') at time zone 'Asia/Kolkata') < tp.weekly_session_cap
  ), scored as (
    select c.*,
      case when c.completed_at between current_date-interval '18 months' and current_date-interval '6 months' then w_stage
           when c.completed_at>=current_date-interval '24 months' then round(w_stage*0.75)::integer else 0 end
      + case when (goal.goal_decision=any(c.guidance_goals)) or (goal.target_exam is not null and exists(select 1 from unnest(c.guidance_exams||c.subjects) x where lower(x)=lower(goal.target_exam))) then w_goal else 0 end
      + case when c.guidance_strengths && goal.help_subjects then w_subject else 0 end
      + least(w_background, (case when c.board_match then 5 else 0 end)
          +(case when c.tier_match then 2 else 0 end)
          +(case when c.city_match then 2 when c.state_match then 1 else 0 end)
          +(case when c.style_match then 1 else 0 end))
      + case when c.open_slots>0 then w_availability else 0 end
      + case when c.review_total>=3 and c.rating_value>=4 then w_reputation else 0 end as total_score,
      array_remove(array[
        case when c.completed_at between current_date-interval '18 months' and current_date-interval '6 months' then 'Recently completed your current class' end,
        case when (goal.goal_decision=any(c.guidance_goals)) or (goal.target_exam is not null and exists(select 1 from unnest(c.guidance_exams||c.subjects) x where lower(x)=lower(goal.target_exam))) then 'Relevant to your goal or target exam' end,
        case when c.guidance_strengths && goal.help_subjects then 'Strong in selected subjects' end,
        case when c.board_match then 'Same board' end,
        case when c.city_match then 'Same city' when c.state_match then 'Same state' end,
        case when c.open_slots>0 then 'Has an open time this week' end,
        case when c.review_total>=3 and c.rating_value>=4 then 'Rated highly by learners' end
      ],null) as reasons
    from candidates c
  ), top_matches as (
    select s.* from scored s order by s.total_score desc,s.user_id limit 3
  ), event_log as (
    insert into public.meridian_match_events(learner_id,mentor_id,event)
    select actor,t.user_id,'shown' from top_matches t returning mentor_id
  )
  select t.user_id,t.total_score,array_to_string(t.reasons,' · '),case when t.review_total>=3 then t.rating_value else null end,t.review_total
    from top_matches t join event_log e on e.mentor_id=t.user_id order by t.total_score desc,t.user_id;
end $$;
revoke all on function public.meridian_match_candidates(jsonb) from public,anon;
grant execute on function public.meridian_match_candidates(jsonb) to authenticated;

comment on table public.meridian_mentor_journey is 'Public timeline for a verified, available Meridian Senior; users edit their own timeline.';
comment on table public.meridian_mentor_results is 'Private exam result evidence; public profile receives only reviewer-approved score ranges and safe summaries.';
comment on function public.meridian_match_candidates(jsonb) is 'Returns at most three rule-based mentor matches without exposing private learner goals to the browser.';

-- Learner goals: structured, private details for guidance matching.
create table if not exists public.learner_guidance_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  goal_decision text not null check (goal_decision in ('choose_stream','start_class_11','exam_roadmap','choose_branch_college','recover_result','other')),
  board text not null check (board in ('CBSE','ICSE','State board','Other')),
  target_exam text,
  help_subjects text[] not null default '{}',
  preferred_languages text[] not null default '{}',
  city_tier text check (city_tier is null or city_tier in ('tier_1','tier_2','tier_3','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_guidance_profiles_max_help_subjects check (cardinality(help_subjects) <= 3),
  constraint learner_guidance_profiles_min_languages check (cardinality(preferred_languages) >= 1)
);
alter table public.learner_guidance_profiles enable row level security;
revoke all on public.learner_guidance_profiles from anon;
grant select,insert,update,delete on public.learner_guidance_profiles to authenticated;
drop policy if exists "Learners read own guidance profile" on public.learner_guidance_profiles;
create policy "Learners read own guidance profile" on public.learner_guidance_profiles for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "Learners create own guidance profile" on public.learner_guidance_profiles;
create policy "Learners create own guidance profile" on public.learner_guidance_profiles for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "Learners update own guidance profile" on public.learner_guidance_profiles;
create policy "Learners update own guidance profile" on public.learner_guidance_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "Learners delete own guidance profile" on public.learner_guidance_profiles;
create policy "Learners delete own guidance profile" on public.learner_guidance_profiles for delete to authenticated using ((select auth.uid())=user_id);
create or replace function public.set_learner_guidance_profile_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists set_learner_guidance_profile_updated_at on public.learner_guidance_profiles;
create trigger set_learner_guidance_profile_updated_at before update on public.learner_guidance_profiles for each row execute function public.set_learner_guidance_profile_updated_at();
comment on table public.learner_guidance_profiles is 'Private learner goals used for guidance matching. Expose only through a reviewed matching function.';

-- Mentor achievements: private proof, reviewer-gated public summaries and files.
-- The site has an existing private bucket; enforce its privacy and file limits here.
create table if not exists public.mentor_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 80),
  title text not null check (char_length(title) between 1 and 120),
  issuer text check (issuer is null or char_length(issuer) <= 120),
  achievement_year smallint check (achievement_year is null or achievement_year between 1900 and 2100),
  public_summary text not null check (char_length(public_summary) between 10 and 500),
  evidence_path text not null,
  public_evidence_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mentor_achievements_private_path_owner check (evidence_path like user_id::text || '/' || id::text || '/evidence/%'),
  constraint mentor_achievements_public_path_owner check (public_evidence_path is null or public_evidence_path like user_id::text || '/' || id::text || '/public/%')
);
alter table public.mentor_achievements enable row level security;
revoke all on public.mentor_achievements from anon;
grant select,insert,update,delete on public.mentor_achievements to authenticated;
drop policy if exists "Mentors and reviewers read achievement records" on public.mentor_achievements;
create policy "Mentors and reviewers read achievement records" on public.mentor_achievements
  for select to authenticated using ((select auth.uid()) = user_id or public.is_peer_connect_verification_admin());
drop policy if exists "Mentors submit their own pending achievements" on public.mentor_achievements;
create policy "Mentors submit their own pending achievements" on public.mentor_achievements
  for insert to authenticated with check (
    (select auth.uid()) = user_id and status = 'pending' and reviewed_at is null and reviewed_by is null
    and evidence_path is not null and evidence_path like user_id::text || '/' || id::text || '/evidence/%'
    and (public_evidence_path is null or public_evidence_path like user_id::text || '/' || id::text || '/public/%')
  );
drop policy if exists "Reviewers decide submitted achievements" on public.mentor_achievements;
create policy "Reviewers decide submitted achievements" on public.mentor_achievements
  for update to authenticated using (public.is_peer_connect_verification_admin())
  with check (public.is_peer_connect_verification_admin());
drop policy if exists "Owners or reviewers remove achievement records" on public.mentor_achievements;
create policy "Owners or reviewers remove achievement records" on public.mentor_achievements
  for delete to authenticated using ((select auth.uid()) = user_id or public.is_peer_connect_verification_admin());
drop policy if exists "Meridian restrict achievement reads" on public.mentor_achievements;
create policy "Meridian restrict achievement reads" on public.mentor_achievements as restrictive
  for select to authenticated using ((select auth.uid()) = user_id or public.is_peer_connect_verification_admin());
drop policy if exists "Meridian restrict achievement submissions" on public.mentor_achievements;
create policy "Meridian restrict achievement submissions" on public.mentor_achievements as restrictive
  for insert to authenticated with check (
    (select auth.uid()) = user_id and status = 'pending' and reviewed_at is null and reviewed_by is null
    and evidence_path is not null and evidence_path like user_id::text || '/' || id::text || '/evidence/%'
    and (public_evidence_path is null or public_evidence_path like user_id::text || '/' || id::text || '/public/%')
  );
drop policy if exists "Meridian restrict achievement decisions" on public.mentor_achievements;
create policy "Meridian restrict achievement decisions" on public.mentor_achievements as restrictive
  for update to authenticated using (public.is_peer_connect_verification_admin()) with check (public.is_peer_connect_verification_admin());
drop policy if exists "Meridian restrict achievement deletion" on public.mentor_achievements;
create policy "Meridian restrict achievement deletion" on public.mentor_achievements as restrictive
  for delete to authenticated using ((select auth.uid()) = user_id or public.is_peer_connect_verification_admin());

create or replace function public.get_peer_public_mentor_achievements(p_user_id uuid)
returns table (id uuid, category text, title text, issuer text, achievement_year smallint, public_summary text, public_evidence_path text, status text)
language sql stable security definer set search_path = '' as $$
  select a.id,a.category,a.title,a.issuer,a.achievement_year,a.public_summary,a.public_evidence_path,a.status
  from public.mentor_achievements a
  where a.user_id = p_user_id and a.status = 'approved'
    and exists (
      select 1 from public.tutor_profiles tp
      where tp.user_id = p_user_id and tp.is_available
        and (select v.status from public.tutor_verification_requests v where v.user_id = p_user_id order by v.submitted_at desc limit 1) = 'verified'
    )
  order by a.created_at desc;
$$;
revoke all on function public.get_peer_public_mentor_achievements(uuid) from public,anon;
grant execute on function public.get_peer_public_mentor_achievements(uuid) to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('mentor-achievements','mentor-achievements',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set name = excluded.name, public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Mentors and reviewers read achievement files" on storage.objects;
create policy "Mentors and reviewers read achievement files" on storage.objects for select to authenticated using (
  bucket_id = 'mentor-achievements' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_peer_connect_verification_admin()
    or exists (
      select 1 from public.mentor_achievements a
      join public.tutor_profiles tp on tp.user_id = a.user_id and tp.is_available
      where a.public_evidence_path = storage.objects.name and a.status = 'approved'
        and (select v.status from public.tutor_verification_requests v where v.user_id = a.user_id order by v.submitted_at desc limit 1) = 'verified'
    )
  )
);
drop policy if exists "Mentors upload their own achievement files" on storage.objects;
create policy "Mentors upload their own achievement files" on storage.objects for insert to authenticated with check (
  bucket_id = 'mentor-achievements' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "Mentors or reviewers delete achievement files" on storage.objects;
create policy "Mentors or reviewers delete achievement files" on storage.objects for delete to authenticated using (
  bucket_id = 'mentor-achievements' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_peer_connect_verification_admin())
);
drop policy if exists "Meridian restrict achievement file reads" on storage.objects;
create policy "Meridian restrict achievement file reads" on storage.objects as restrictive for select to authenticated using (
  bucket_id <> 'mentor-achievements' or (storage.foldername(name))[1] = (select auth.uid())::text
  or public.is_peer_connect_verification_admin()
  or exists (select 1 from public.mentor_achievements a where a.public_evidence_path = storage.objects.name and a.status='approved'
    and exists (select 1 from public.tutor_profiles tp where tp.user_id=a.user_id and tp.is_available
      and (select v.status from public.tutor_verification_requests v where v.user_id=a.user_id order by v.submitted_at desc limit 1)='verified'))
);
drop policy if exists "Meridian restrict achievement file uploads" on storage.objects;
create policy "Meridian restrict achievement file uploads" on storage.objects as restrictive for insert to authenticated with check (
  bucket_id <> 'mentor-achievements' or (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists "Meridian restrict achievement file updates" on storage.objects;
create policy "Meridian restrict achievement file updates" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'mentor-achievements') with check (bucket_id <> 'mentor-achievements');
drop policy if exists "Meridian restrict achievement file deletion" on storage.objects;
create policy "Meridian restrict achievement file deletion" on storage.objects as restrictive for delete to authenticated using (
  bucket_id <> 'mentor-achievements' or (storage.foldername(name))[1] = (select auth.uid())::text or public.is_peer_connect_verification_admin()
);
drop policy if exists "Meridian deny public achievement file reads" on storage.objects;
create policy "Meridian deny public achievement file reads" on storage.objects as restrictive for select to anon using (bucket_id <> 'mentor-achievements');
comment on table public.mentor_achievements is 'Achievement proof is private; only approved summaries and reviewed redacted copies are visible to learners.';

-- Private booking notifications and in-app reminders.
create table if not exists public.meridian_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.peer_sessions(id) on delete cascade,
  type text not null check (type in ('request_received','booking_confirmed','booking_declined','booking_cancelled','session_reminder')),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create unique index if not exists meridian_notifications_once_per_session
  on public.meridian_notifications(user_id,session_id,type) where session_id is not null;
create index if not exists meridian_notifications_user_recent
  on public.meridian_notifications(user_id,created_at desc);
create index if not exists meridian_notifications_user_unread
  on public.meridian_notifications(user_id) where read_at is null;
create index if not exists meridian_sessions_paid_confirmed_start
  on public.peer_sessions(starts_at) where status='confirmed' and payment_status='captured';
alter table public.meridian_notifications enable row level security;
revoke all on public.meridian_notifications from public,anon,authenticated;
grant select on public.meridian_notifications to authenticated;
grant update(read_at) on public.meridian_notifications to authenticated;
drop policy if exists "Members read their own Meridian notifications" on public.meridian_notifications;
create policy "Members read their own Meridian notifications" on public.meridian_notifications
  for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "Members mark their own notifications read" on public.meridian_notifications;
create policy "Members mark their own notifications read" on public.meridian_notifications
  for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists "Meridian restrict notification reads" on public.meridian_notifications;
create policy "Meridian restrict notification reads" on public.meridian_notifications as restrictive
  for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "Meridian restrict notification updates" on public.meridian_notifications;
create policy "Meridian restrict notification updates" on public.meridian_notifications as restrictive
  for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create or replace function public.meridian_notify_booking_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' and new.status='pending' then
    insert into public.meridian_notifications(user_id,session_id,type,title,message)
    values(new.mentor_id,new.id,'request_received','New Bearings request','A learner has requested a 30-minute guidance call.')
    on conflict(user_id,session_id,type) where session_id is not null do nothing;
  elsif tg_op='UPDATE' and new.status is distinct from old.status then
    if new.status='confirmed' then
      insert into public.meridian_notifications(user_id,session_id,type,title,message)
      values(new.learner_id,new.id,'booking_confirmed','Your call is confirmed','Your Meridian Senior accepted the booking. Open Bearings calls for details.')
      on conflict(user_id,session_id,type) where session_id is not null do nothing;
    elsif new.status='declined' then
      insert into public.meridian_notifications(user_id,session_id,type,title,message)
      values(new.learner_id,new.id,'booking_declined','Booking update','This booking was declined. Open Bearings calls to see the update.')
      on conflict(user_id,session_id,type) where session_id is not null do nothing;
    elsif new.status='cancelled' then
      insert into public.meridian_notifications(user_id,session_id,type,title,message)
      values(case when new.cancelled_by=new.learner_id then new.mentor_id else new.learner_id end,new.id,'booking_cancelled','Booking cancelled','A Bearings call was cancelled. Open Bearings calls for details.')
      on conflict(user_id,session_id,type) where session_id is not null do nothing;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.meridian_notify_booking_change() from public,anon,authenticated;
drop trigger if exists meridian_notify_booking_change on public.peer_sessions;
create trigger meridian_notify_booking_change after insert or update of status on public.peer_sessions
  for each row execute function public.meridian_notify_booking_change();

create or replace function public.meridian_notify_upcoming_calls()
returns integer language plpgsql security definer set search_path = '' as $$
declare inserted_count integer;
begin
  with due as (
    select id,learner_id,mentor_id from public.peer_sessions
    where status='confirmed' and payment_status='captured'
      and starts_at>now()+interval '9 minutes' and starts_at<=now()+interval '14 minutes'
  ), recipients as (
    select id,learner_id as user_id from due union all select id,mentor_id from due
  ), added as (
    insert into public.meridian_notifications(user_id,session_id,type,title,message)
    select user_id,id,'session_reminder','Bearings call in 10 minutes','Your confirmed 30-minute call starts soon. Open Bearings calls to join.' from recipients
    on conflict(user_id,session_id,type) where session_id is not null do nothing returning 1
  ) select count(*) into inserted_count from added;
  return inserted_count;
end $$;
revoke all on function public.meridian_notify_upcoming_calls() from public,anon,authenticated;
grant execute on function public.meridian_notify_upcoming_calls() to service_role;
do $$ declare prior_job bigint; begin
  if to_regclass('cron.job') is not null then
    execute 'select jobid from cron.job where jobname = $1' into prior_job using 'meridian-call-reminders';
    if prior_job is null then
      execute $job$select cron.schedule('meridian-call-reminders', '*/5 * * * *', 'select public.meridian_notify_upcoming_calls()')$job$;
    end if;
  else
    raise notice 'pg_cron is unavailable; schedule meridian_notify_upcoming_calls() every five minutes with Supabase Scheduled Functions.';
  end if;
exception when others then
  raise notice 'Could not schedule call reminders automatically; schedule meridian_notify_upcoming_calls() every five minutes in Supabase.';
end $$;
