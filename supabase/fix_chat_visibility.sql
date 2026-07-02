-- chat.sql's original policies only checked auth.role() = 'authenticated',
-- so any logged-in user could read/post into any match's chat by querying
-- chat_message directly (the app UI's match_id filter is client-side only).
-- Restrict to users who are actually confirmed for that match, plus
-- organizers/admins so they can moderate.

drop policy if exists "Users can view messages for matches" on public.chat_message;
drop policy if exists "Users can insert messages" on public.chat_message;

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
