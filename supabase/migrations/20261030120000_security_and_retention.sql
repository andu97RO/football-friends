-- Security and GDPR review (30 Oct 2026): chat pushes, venue and avatar links, avatar size,
-- legacy helpers and audit log retention.

-- Chat pushes carry the stored message, never text from the request. Each message
-- is pushed once, only for its author, shortly after posting, and an author's
-- pushes in one match are at least 15 seconds apart (messages themselves are not limited).
alter table public.chat_message add column notified_at timestamptz;
revoke insert on public.chat_message from authenticated;
grant insert (match_id, user_id, content) on public.chat_message to authenticated;

create function public.claim_chat_push(message uuid, sender uuid) returns table(match_id uuid, content text)
language sql security definer set search_path = '' as $$
  update public.chat_message c set notified_at = now()
  where c.id = message and c.user_id = sender and c.notified_at is null and c.created_at > now() - interval '2 minutes'
    and not exists (
      select 1 from public.chat_message p
      where p.match_id = c.match_id and p.user_id = sender and p.notified_at > now() - interval '15 seconds')
  returning c.match_id, c.content;
$$;
revoke all on function public.claim_chat_push(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_chat_push(uuid, uuid) to service_role;

-- Venue links open in the browser or maps app only; no javascript: or other app schemes.
alter table public.match add constraint match_venue_url_web
  check (venue_url = '' or venue_url ~* '^https?://[^[:space:]]+$');

-- Avatars must be the player's own upload in this project's avatars bucket, so
-- viewing a profile never loads an image from a third-party server.
alter table public.profile add constraint profile_avatar_own_upload
  check (avatar_url is null or avatar_url like 'https://exqtxouswbcunrgxftzr.supabase.co/storage/v1/object/public/avatars/' || user_id::text || '/%');

update storage.buckets set file_size_limit = 5242880 where id = 'avatars';

-- Unused helper that confirmed emails without verification; nothing calls it.
drop function if exists public.auto_confirm_email();

-- GDPR storage limitation: the privacy policy promises admin action logs are kept 12 months.
create or replace function private.prune_audit_log() returns integer
language sql security definer set search_path = '' as $$
  with gone as (delete from public.audit_log where created_at < now() - interval '12 months' returning 1)
  select count(*)::integer from gone;
$$;
revoke all on function private.prune_audit_log() from public, anon, authenticated;

-- Run daily at 03:00 UTC. Skipped where pg_cron is not available (local PGlite tests).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $cron$select cron.schedule('prune-audit-log', '0 3 * * *', 'select private.prune_audit_log()')$cron$;
  end if;
end $$;
