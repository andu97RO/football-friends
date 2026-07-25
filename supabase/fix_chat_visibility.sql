-- chat.sql's original policies only checked auth.role() = 'authenticated',
-- so any logged-in user could read/post into any match's chat by querying
-- chat_message directly (the app UI's match_id filter is client-side only).
-- Restrict to users who are actually confirmed for that match, plus
-- organizers/admins so they can moderate.
--
-- IMPORTANT: Postgres combines permissive policies with OR. If any old
-- permissive policy survived (e.g. because its name differs from what this
-- repo's chat.sql says — there is no ordered migration system here, so the
-- live names cannot be assumed), it would keep granting blanket access and
-- this "fix" would silently do nothing. So we drop EVERY existing policy on
-- chat_message by name from the catalog before creating the correct ones.

do $$
declare
  r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'chat_message'
  loop
    execute format('drop policy %I on public.chat_message', r.policyname);
    raise notice 'chat_message: dropped pre-existing policy %', r.policyname;
  end loop;
end;
$$;

alter table public.chat_message enable row level security;

create policy "Match participants can view messages"
  on public.chat_message for select
  using (
    exists (
      select 1 from public.signup s
      where s.match_id = chat_message.match_id
      and s.user_id = auth.uid()
      and s.state = 'confirmed'
    )
    or exists (
      select 1 from public.match m
      join public.club c on c.id = m.club_id
      where m.id = chat_message.match_id
      and c.organizer_id = auth.uid()
    )
    or exists (
      select 1 from public.profile p
      where p.user_id = auth.uid()
      and p.is_admin = true
    )
  );

create policy "Match participants can insert messages"
  on public.chat_message for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.signup s
        where s.match_id = chat_message.match_id
        and s.user_id = auth.uid()
        and s.state = 'confirmed'
      )
      or exists (
        select 1 from public.match m
        join public.club c on c.id = m.club_id
        where m.id = chat_message.match_id
        and c.organizer_id = auth.uid()
      )
      or exists (
        select 1 from public.profile p
        where p.user_id = auth.uid()
        and p.is_admin = true
      )
    )
  );
