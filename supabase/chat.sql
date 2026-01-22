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

-- Policies
create policy "Users can view messages for matches"
  on public.chat_message for select
  using (auth.role() = 'authenticated');

create policy "Users can insert messages"
  on public.chat_message for insert
  with check (auth.role() = 'authenticated');

-- Enable Realtime
alter publication supabase_realtime add table public.chat_message;

-- Indexes
create index if not exists idx_chat_message_match_id on public.chat_message(match_id);
create index if not exists idx_chat_message_created_at on public.chat_message(created_at);
