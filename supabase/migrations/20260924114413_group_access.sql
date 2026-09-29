-- Apply only after the live inventory, backup and original-group mapping review.
-- Existing memberships are backfilled in the same transaction, before opening registration.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter table public.club add column if not exists description text not null default '';
alter table public.audit_log add column if not exists club_id uuid references public.club(id);
create table public.group_membership (
  club_id uuid not null references public.club(id),
  user_id uuid not null references public.profile(user_id),
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rating smallint not null default 3 check (rating between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (club_id,user_id),
  check (role = 'member' or status = 'approved')
);
create unique index group_one_owner on public.group_membership(club_id) where role='owner';
create index group_membership_user on public.group_membership(user_id,club_id);
create index if not exists match_club on public.match(club_id);
create index if not exists audit_group on public.audit_log(club_id);
do $$ declare t text; begin
 foreach t in array array['profile','club','match','signup','team','team_assignment','rating_snapshot','post_match_vote','audit_log','chat_message','group_membership'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
-- The inspected live project had this trigger; it bypasses email verification.
drop trigger if exists on_auth_user_created_confirm on auth.users;
do $$ begin
 if to_regprocedure('public.auto_confirm_email()') is not null then
   execute 'revoke all on function public.auto_confirm_email() from public,anon,authenticated';
 end if;
end $$;

create function private.group_role(g uuid) returns text language sql stable security definer set search_path='' as $$
  select gm.role from public.group_membership gm join auth.users u on u.id=gm.user_id and u.email_confirmed_at is not null where gm.club_id=g and gm.user_id=(select auth.uid()) and gm.status='approved';
$$;
create function private.match_member(m uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.group_role(club_id) is not null,false) from public.match where id=m;
$$;
create function private.match_admin(m uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.group_role(club_id) in ('owner','admin'),false) from public.match where id=m;
$$;
create function private.chat_access(m uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.match_member(m) and (private.match_admin(m) or exists (
    select 1 from public.signup where match_id=m and user_id=(select auth.uid()) and state='confirmed'));
$$;
create function private.profile_visible(u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select u=(select auth.uid()) or exists (
   select 1 from public.group_membership target where target.user_id=u and
   ((target.status='approved' and private.group_role(target.club_id) is not null) or private.group_role(target.club_id) in ('owner','admin')));
$$;

-- Backfill reviewed original group only. Refuse to infer mappings for multiple groups.
-- Live preflight 2026-09-24: Monday Friends, 24 profiles, 26 auth users, 22 matches.
do $$ declare original public.club%rowtype; begin
 if (select count(*) from public.club)>1 then raise exception 'Review legacy multi-group membership mapping before migrating'; end if;
 select * into original from public.club limit 1;
 if found then
   insert into public.profile(user_id,display_name)
   select id,coalesce(nullif(split_part(email,'@',1),''),'Player') from auth.users
   on conflict(user_id) do nothing;
   insert into public.group_membership(club_id,user_id,role,status,rating)
   select original.id,p.user_id,
     case when p.user_id=original.organizer_id then 'owner' when p.is_admin then 'admin' else 'member' end,
     'approved',p.rating_base from public.profile p;
 end if;
end $$;

-- Replace permissive legacy policies, never combine them with new group policies.
do $$ declare p record; begin
 for p in select * from pg_policies where schemaname='public' and tablename in
 ('club','profile','match','signup','team','team_assignment','rating_snapshot','post_match_vote','audit_log','chat_message','group_membership') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
revoke all on public.club,public.profile,public.match,public.signup,public.team,public.team_assignment,public.rating_snapshot,public.post_match_vote,public.audit_log,public.chat_message,public.group_membership from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
grant select(id,name,description) on public.club to anon,authenticated;
grant select(user_id,display_name,avatar_url,created_at) on public.profile to authenticated;
grant update(display_name,avatar_url,push_token) on public.profile to authenticated;
grant select on public.match,public.signup,public.team,public.team_assignment,public.rating_snapshot,public.post_match_vote,public.audit_log,public.chat_message,public.group_membership to authenticated;
grant insert,update,delete on public.match to authenticated;
grant insert on public.chat_message to authenticated;
create policy directory on public.club for select to anon,authenticated using (true);
create policy profile_read on public.profile for select to authenticated using (private.profile_visible(user_id));
create policy profile_edit on public.profile for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy membership_read on public.group_membership for select to authenticated using (
 user_id=(select auth.uid()) or (status='approved' and private.group_role(club_id) is not null) or private.group_role(club_id) in ('owner','admin'));
create policy match_read on public.match for select to authenticated using (private.group_role(club_id) is not null);
create policy match_create on public.match for insert to authenticated with check (private.group_role(club_id) in ('owner','admin'));
create policy match_edit on public.match for update to authenticated using (private.group_role(club_id) in ('owner','admin')) with check (private.group_role(club_id) in ('owner','admin'));
create policy match_delete on public.match for delete to authenticated using (private.group_role(club_id) in ('owner','admin'));
create policy signup_read on public.signup for select to authenticated using (private.match_member(match_id));
create policy team_read on public.team for select to authenticated using (private.match_member(match_id));
create policy assignment_read on public.team_assignment for select to authenticated using (exists(select 1 from public.team t where t.id=team_id and private.match_member(t.match_id)));
create policy snapshot_read on public.rating_snapshot for select to authenticated using (private.match_member(match_id));
create policy vote_read on public.post_match_vote for select to authenticated using (private.match_member(match_id));
create policy audit_read on public.audit_log for select to authenticated using (private.group_role(club_id) in ('owner','admin') or private.match_admin(match_id));
create policy chat_read on public.chat_message for select to authenticated using (private.chat_access(match_id));
create policy chat_write on public.chat_message for insert to authenticated with check (user_id=(select auth.uid()) and private.chat_access(match_id) and length(content)<=4000);

create function private.group_action(action text, g uuid default null, target uuid default null, value text default null, description text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); caller_role text; target_member public.group_membership%rowtype;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Verified account required' using errcode='42501'; end if;
 perform private.initialize_profile();
 if action='create' then
   if length(trim(value)) not between 1 and 80 or length(description)>500 then raise exception 'Invalid group name or description'; end if;
   insert into public.club(name,description,organizer_id) values(trim(value),description,actor) returning id into g;
   insert into public.group_membership(club_id,user_id,role,status,rating) select g,actor,'owner','approved',rating_base from public.profile where user_id=actor;
 else
   -- Serialize administrative decisions within this group; clients cannot change the owner.
   perform 1 from public.club where id=g for update;
   if not found then raise exception 'Group not found'; end if;
   caller_role := private.group_role(g);
   if action='request' then
     insert into public.group_membership(club_id,user_id,rating) select g,actor,rating_base from public.profile where user_id=actor
       on conflict(club_id,user_id) do update set status='pending' where group_membership.status='rejected';
   else
     if caller_role is null or caller_role not in ('owner','admin') then raise exception 'Group admin required' using errcode='42501'; end if;
     select * into target_member from public.group_membership where club_id=g and user_id=target for update;
     if not found then raise exception 'Membership not found'; end if;
     if action='review' then
       if target_member.status<>'pending' or value not in ('approved','rejected') then raise exception 'Invalid request decision'; end if;
       update public.group_membership set status=value where club_id=g and user_id=target;
     elsif action='role' then
       if caller_role<>'owner' or target_member.role='owner' or target_member.status<>'approved' or value not in ('admin','member') then raise exception 'Owner required; only approved members can change role' using errcode='42501'; end if;
       update public.group_membership set role=value where club_id=g and user_id=target;
     elsif action='rating' then
       if target_member.status<>'approved' or value not in ('0','1','2','3','4','5') then raise exception 'Invalid rating'; end if;
       update public.group_membership set rating=value::smallint where club_id=g and user_id=target;
     else raise exception 'Unknown action'; end if;
   end if;
 end if;
 insert into public.audit_log(club_id,user_id,action,meta) values(g,actor,'group_'||action,jsonb_build_object('target',target,'value',value));
 return g;
end $$;
create function public.group_action(action text,g uuid default null,target uuid default null,value text default null,description text default '') returns uuid
language sql security invoker set search_path='' as $$ select private.group_action(action,g,target,value,description); $$;

-- Audit direct admin match changes and prevent moving a match between groups.
create function private.audit_match() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.club_id<>old.club_id then raise exception 'Cannot move a match between groups'; end if;
 if TG_OP<>'DELETE' then
   if new.signup_open_at>=new.kick_off or new.teams_count>new.spots or new.teams_count>26 then raise exception 'Invalid match schedule or team count'; end if;
   if TG_OP='UPDATE' and new.spots<(select count(*) from public.signup where match_id=new.id and state='confirmed') then raise exception 'Capacity is below confirmed signups'; end if;
 end if;
 insert into public.audit_log(club_id,match_id,user_id,action) values(coalesce(new.club_id,old.club_id),coalesce(new.id,old.id),auth.uid(),'match_'||lower(TG_OP));
 return coalesce(new,old);
end $$;
create trigger group_match_audit before insert or update or delete on public.match for each row execute function private.audit_match();

-- Capacity respects RLS, including anonymous and cross-group calls.
create or replace function public.get_match_capacity(match_ids uuid[]) returns table(match_id uuid,confirmed_count integer,reserved_count integer)
language sql security invoker set search_path='' as $$
 select m.id,count(s.id)::integer,0 from public.match m left join public.signup s on s.match_id=m.id and s.state='confirmed'
 where m.id=any(match_ids) group by m.id;
$$;
create function public.can_access_chat(m uuid) returns boolean language sql security invoker set search_path='' as $$ select private.chat_access(m); $$;

-- Every match transition shares the same row lock, including team generation.
create function private.match_action(action text,m uuid,player uuid default null,source_team uuid default null,destination_team uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); game public.match%rowtype; old_signup public.signup%rowtype; n integer; pos integer; new_state text;
 promoted uuid; team_ids uuid[]:='{}'; tid uuid; p record; idx integer:=0; bucket integer;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into game from public.match where id=m for update;
 if not found or not coalesce(private.match_member(m),false) then raise exception 'Group membership required' using errcode='42501'; end if;
 if action in ('generate','move') and not coalesce(private.match_admin(m),false) then raise exception 'Group admin required' using errcode='42501'; end if;
 if action in ('join','cancel') then
   if game.status<>'scheduled' or now()>=game.kick_off then raise exception 'Match is closed'; end if;
   select * into old_signup from public.signup where match_id=m and user_id=actor;
   if action='join' then
     if now()<game.signup_open_at then raise exception 'Signup not open yet'; end if;
     if old_signup.id is not null and old_signup.state<>'cancelled' then raise exception 'Already signed up'; end if;
     select count(*) into n from public.signup where match_id=m and state='confirmed';
     new_state:=case when n<game.spots then 'confirmed' else 'waitlist' end;
     if new_state='waitlist' then select coalesce(max(queue_pos),0)+1 into pos from public.signup where match_id=m and state='waitlist'; end if;
     insert into public.signup(match_id,user_id,state,queue_pos) values(m,actor,new_state,pos)
     on conflict(match_id,user_id) do update set state=excluded.state,queue_pos=excluded.queue_pos,created_at=now();
   else
     if old_signup.id is null or old_signup.state='cancelled' then raise exception 'No active signup'; end if;
     update public.signup set state='cancelled',queue_pos=null where id=old_signup.id;
     if old_signup.state='confirmed' then
       select s.user_id into promoted from public.signup s join public.group_membership gm on gm.user_id=s.user_id and gm.club_id=game.club_id and gm.status='approved'
       where s.match_id=m and s.state='waitlist' order by s.queue_pos,s.created_at,s.id limit 1;
       update public.signup set state='confirmed',queue_pos=null where match_id=m and user_id=promoted;
     end if;
     with q as (select id,row_number() over(order by queue_pos,created_at,id)::integer as pos from public.signup where match_id=m and state='waitlist')
     update public.signup s set queue_pos=q.pos from q where s.id=q.id;
   end if;
 elsif action='generate' then
   if game.status<>'scheduled' then raise exception 'Match already locked or closed'; end if;
   select count(*) into n from public.signup where match_id=m and state='confirmed';
   if n=0 then raise exception 'No confirmed signups'; end if;
   delete from public.team where match_id=m;
   delete from public.rating_snapshot where match_id=m;
   for i in 1..game.teams_count loop
     insert into public.team(match_id,name) values(m,'Team '||chr(64+i)) returning id into tid;
     team_ids:=array_append(team_ids,tid);
   end loop;
   for p in select s.user_id,gm.rating from public.signup s join public.group_membership gm on gm.club_id=game.club_id and gm.user_id=s.user_id and gm.status='approved'
     where s.match_id=m and s.state='confirmed' order by gm.rating desc,s.created_at,s.id loop
     bucket:=case when (idx/game.teams_count)%2=0 then idx%game.teams_count+1 else game.teams_count-idx%game.teams_count end;
     insert into public.team_assignment(team_id,user_id) values(team_ids[bucket],p.user_id);
     insert into public.rating_snapshot(match_id,user_id,rating_display) values(m,p.user_id,p.rating);
     idx:=idx+1;
   end loop;
   if idx<>n then raise exception 'Every participant must be an approved group member'; end if;
   update public.match set status='locked' where id=m;
 elsif action='move' then
   if game.status<>'locked' or source_team=destination_team or source_team is null or destination_team is null then raise exception 'Invalid team move'; end if;
   if (select count(*) from public.team where match_id=m and id in (source_team,destination_team))<>2 or
      not exists(select 1 from public.signup where match_id=m and user_id=player and state='confirmed') or
      not exists(select 1 from public.group_membership where club_id=game.club_id and user_id=player and status='approved') then raise exception 'Teams and player must belong to this match'; end if;
   update public.team_assignment set team_id=destination_team where team_id=source_team and user_id=player;
   if not found then raise exception 'Player is not in source team'; end if;
 else raise exception 'Unknown action'; end if;
 insert into public.audit_log(club_id,match_id,user_id,action,meta) values(game.club_id,m,actor,'match_'||action,jsonb_build_object('player',player,'promoted',promoted));
 return jsonb_build_object('success',true,'state',new_state,'position',pos,'promoted',promoted);
end $$;
create function public.match_action(action text,m uuid,player uuid default null,source_team uuid default null,destination_team uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.match_action(action,m,player,source_team,destination_team); $$;

-- Retire legacy RPC authority (including callers carrying a service key).
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('join_match_atomic','cancel_signup_atomic','update_player_rating_atomic','accept_invitation_atomic','decline_invitation_atomic','process_expired_invitations_atomic','_fill_open_spots_with_invitations','_expire_pending_invitations_for_match','normalize_waitlist_queue','_lock_match') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.group_role(uuid),private.match_member(uuid),private.match_admin(uuid),private.chat_access(uuid),private.profile_visible(uuid),private.group_action(text,uuid,uuid,text,text),private.match_action(text,uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.group_action(text,uuid,uuid,text,text),public.match_action(text,uuid,uuid,uuid,uuid),public.can_access_chat(uuid),public.get_match_capacity(uuid[]) from public,anon;
grant execute on function public.group_action(text,uuid,uuid,text,text),public.match_action(text,uuid,uuid,uuid,uuid),public.can_access_chat(uuid),public.get_match_capacity(uuid[]) to authenticated;

-- Own-path image uploads; display images are public, push tokens never are.
update storage.buckets set file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='avatars';
do $$ declare p record; begin
 for p in select * from pg_policies where schemaname='storage' and tablename='objects' and (coalesce(qual,'')||coalesce(with_check,'')) like '%avatars%' loop
 execute format('drop policy %I on storage.objects',p.policyname);
 end loop;
end $$;
create policy avatar_read on storage.objects for select to anon,authenticated using(bucket_id='avatars');
create policy avatar_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy avatar_update on storage.objects for update to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy avatar_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Initial self-assessment is captured once at signup; later metadata edits cannot alter it.
alter table public.profile drop constraint if exists profile_rating_base_check;
alter table public.profile add constraint profile_rating_base_check check(rating_base between 0 and 5);
alter table public.rating_snapshot drop constraint if exists rating_snapshot_rating_display_check;
alter table public.rating_snapshot add constraint rating_snapshot_rating_display_check check(rating_display between 0 and 5);
create function private.initialize_profile() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.profile(user_id,display_name,rating_base)
 select id,coalesce(nullif(split_part(email,'@',1),''),'Player'),
 case when raw_user_meta_data->>'initial_rating' ~ '^[0-5]$' then (raw_user_meta_data->>'initial_rating')::smallint else 3 end
 from auth.users where id=auth.uid() on conflict(user_id) do nothing;
end $$;
create function public.initialize_profile() returns void language sql security invoker set search_path='' as $$ select private.initialize_profile(); $$;
create function private.signup_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profile(user_id,display_name,rating_base)
 values(new.id,coalesce(nullif(split_part(new.email,'@',1),''),'Player'),
 case when new.raw_user_meta_data->>'initial_rating' ~ '^[0-5]$' then (new.raw_user_meta_data->>'initial_rating')::smallint else 3 end)
 on conflict(user_id) do nothing;
 return new;
end $$;
create trigger group_signup_profile after insert on auth.users for each row execute function private.signup_profile();
revoke all on function private.initialize_profile(),private.signup_profile(),public.initialize_profile() from public,anon;
grant execute on function private.initialize_profile(),public.initialize_profile() to authenticated;
