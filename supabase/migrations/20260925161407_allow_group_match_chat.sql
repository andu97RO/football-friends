-- Match chat is a conversation for the approved group, including before
-- sign-ups open and after kickoff. Membership and email verification remain
-- enforced by private.match_member.
create or replace function private.chat_access(m uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.match_member(m), false);
$$;
