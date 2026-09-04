-- Create chat_message table
create table if not exists public.chat_message (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match(id) on delete cascade,
  user_id uuid not null references public.profile(user_id) on delete cascade,
  content text not null check (length(content) > 0),
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.chat_message enable row level security;

-- Restrict chat to confirmed participants of that match, plus organizers/admins
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

-- Enable Realtime
alter publication supabase_realtime add table public.chat_message;

-- Indexes
create index if not exists idx_chat_message_match_id on public.chat_message(match_id);
create index if not exists idx_chat_message_created_at on public.chat_message(created_at);
