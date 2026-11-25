-- Private, booked-session chat for Peer Connect.
-- Run after peer_connect_v2_social_scheduling.sql and
-- peer_connect_company_fixed_sessions.sql.
-- Messages and study attachments can be sent only during a confirmed 30-minute
-- session. Participants can read that session's history afterward.

begin;

create table if not exists public.peer_session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.peer_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 2000),
  attachment_path text unique,
  attachment_name text check (attachment_name is null or char_length(attachment_name) between 1 and 180),
  attachment_type text check (attachment_type is null or attachment_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  created_at timestamptz not null default now(),
  check (char_length(trim(content)) > 0 or attachment_path is not null),
  check (num_nonnulls(attachment_path, attachment_name, attachment_type) in (0, 3))
);
create index if not exists peer_session_messages_session_created_idx
  on public.peer_session_messages(session_id, created_at);

alter table public.peer_session_messages enable row level security;
revoke all on public.peer_session_messages from anon, authenticated;
grant select, insert on public.peer_session_messages to authenticated;

drop policy if exists "Session participants read chat history" on public.peer_session_messages;
create policy "Session participants read chat history"
  on public.peer_session_messages for select to authenticated
  using (exists (
    select 1 from public.peer_sessions s
    where s.id = session_id
      and (s.learner_id = (select auth.uid()) or s.mentor_id = (select auth.uid()))
  ));

drop policy if exists "Active session participants send chat messages" on public.peer_session_messages;
create policy "Active session participants send chat messages"
  on public.peer_session_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.peer_sessions s
      where s.id = session_id and s.status = 'confirmed'
        and s.starts_at <= now() and s.ends_at > now()
        and (s.learner_id = (select auth.uid()) or s.mentor_id = (select auth.uid()))
    )
  );

create or replace function public.enforce_peer_session_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_learner uuid;
  v_mentor uuid;
  v_status text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if new.sender_id <> (select auth.uid()) then
    raise exception 'You can only send a message as yourself';
  end if;

  select s.learner_id, s.mentor_id, s.status, s.starts_at, s.ends_at
    into v_learner, v_mentor, v_status, v_starts_at, v_ends_at
  from public.peer_sessions s
  where s.id = new.session_id;
  if not found or (select auth.uid()) not in (v_learner, v_mentor) then
    raise exception 'Only this session’s participants can chat';
  end if;
  if v_status <> 'confirmed' or now() < v_starts_at or now() >= v_ends_at then
    raise exception 'Chat is available only during the confirmed session';
  end if;
  if new.attachment_path is not null then
    if new.attachment_path not like new.session_id::text || '/' || new.sender_id::text || '/%'
       or new.attachment_type not in ('image/jpeg','image/png','image/webp','application/pdf')
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'session-chat-files' and o.name = new.attachment_path
       ) then
      raise exception 'Choose a supported study file uploaded to this session';
    end if;
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.enforce_peer_session_chat_message() from public, anon, authenticated;
drop trigger if exists enforce_peer_session_chat_message on public.peer_session_messages;
create trigger enforce_peer_session_chat_message
  before insert on public.peer_session_messages
  for each row execute function public.enforce_peer_session_chat_message();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-chat-files', 'session-chat-files', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Participants upload during their booked chat" on storage.objects;
create policy "Participants upload during their booked chat"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-chat-files'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.peer_sessions s
      where s.id::text = (storage.foldername(name))[1]
        and s.status = 'confirmed' and s.starts_at <= now() and s.ends_at > now()
        and (s.learner_id = (select auth.uid()) or s.mentor_id = (select auth.uid()))
    )
  );

drop policy if exists "Participants read files attached to session messages" on storage.objects;
create policy "Participants read files attached to session messages"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'session-chat-files'
    and exists (
      select 1
      from public.peer_session_messages m
      join public.peer_sessions s on s.id = m.session_id
      where m.attachment_path = name
        and (s.learner_id = (select auth.uid()) or s.mentor_id = (select auth.uid()))
    )
  );

drop policy if exists "Uploaders remove their own session chat files" on storage.objects;
create policy "Uploaders remove their own session chat files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'session-chat-files'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.peer_sessions s
      where s.id::text = (storage.foldername(name))[1]
        and (s.learner_id = (select auth.uid()) or s.mentor_id = (select auth.uid()))
    )
    and not exists (
      select 1 from public.peer_session_messages m where m.attachment_path = name
    )
  );

commit;
