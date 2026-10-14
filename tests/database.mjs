import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

// Real PostgreSQL engine in isolation; no production records or auth emails.
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public,storage to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated;
 create table storage.buckets(id text primary key,file_size_limit bigint,allowed_mime_types text[]);
 insert into storage.buckets(id) values('avatars');
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create publication supabase_realtime;
`);
await db.exec(readFileSync('supabase/schema.sql','utf8').replace('create extension if not exists "uuid-ossp";', ''));
await db.exec(`alter table public.profile add column is_admin boolean default false,add column avatar_url text,add column push_token text;`);
await db.exec(readFileSync('supabase/chat.sql','utf8'));
for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
  if (!file.includes('backfill')) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
}
let checks = 0;
const scalar = async (sql, params=[]) => Object.values((await db.query(sql,params)).rows[0])[0];
const ids = Array.from({length:5},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
for (let i=0;i<ids.length;i++) await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)`,[ids[i],`player${i}@example.test`,i===4?null:new Date().toISOString(),JSON.stringify({initial_rating:i})]);
const as = async (id) => { await db.exec(`reset role; set role ${id ? 'authenticated':'anon'};`); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']); };
const admin = async () => db.exec('reset role');
const deny = async (sql,params=[]) => { await assert.rejects(db.query(sql,params)); checks++; };
const eq = (a,b) => { assert.deepEqual(a,b);checks++; };
const group = async (action,g=null,target=null,value=null) => scalar('select public.group_action($1,$2,$3,$4)',[action,g,target,value]);
const match = async (action,m,player=null,source=null,dest=null) => scalar('select public.match_action($1,$2,$3,$4,$5)',[action,m,player,source,dest]);
await as(ids[0]); const g1=await group('create',null,null,'First group');
eq(await scalar('select listed from club where id=$1',[g1]),false);
await as(ids[1]); await deny("select group_action('request',$1)",[g1]);
await as(ids[0]); await group('listed',g1,null,'true');
eq(await scalar('select rating from my_groups() where club_id=$1',[g1]),0);
await deny('update profile set rating_base=5 where user_id=$1',[ids[0]]);
await deny('update profile set is_admin=true where user_id=$1',[ids[0]]);
await deny('select push_token from profile');
await deny('update group_membership set role=\'owner\'');
await db.query('update profile set display_name=$1 where user_id=$2',['Owner',ids[0]]);
await as(ids[1]); const g2=await group('create',null,null,'Second group');
await group('request',g1);
eq(await scalar('select status from group_membership where club_id=$1 and user_id=$2',[g1,ids[1]]),'pending');
await deny('select group_action(\'review\',$1,$2,\'approved\')',[g1,ids[1]]);
await as(ids[0]); await group('review',g1,ids[1],'approved'); await group('rating',g1,ids[1],'5');
await as(ids[1]);
eq(await scalar('select rating from my_groups() where club_id=$1',[g2]),1);
await deny('select group_action(\'rating\',$1,$2,\'4\')',[g1,ids[1]]);
await as(ids[0]); await group('role',g1,ids[1],'admin');
await as(ids[1]); await group('rating',g1,ids[0],'0');
await deny('select group_action(\'role\',$1,$2,\'member\')',[g1,ids[0]]);
await as(ids[0]); await group('role',g1,ids[1],'member');
for (const u of [ids[2],ids[3]]) {await as(u);await group('request',g1);}
await as(ids[0]); await group('review',g1,ids[2],'rejected');
await as(ids[2]); await group('request',g1);
await as(ids[0]); await group('review',g1,ids[2],'approved');
const createMatch = async g => scalar("insert into match(club_id,kick_off,signup_open_at,spots,teams_count) values($1,now()+interval '1 day',now()-interval '1 day',2,2) returning id",[g]);
const m1=await createMatch(g1); const empty=await createMatch(g1);
const waiting=await scalar("insert into match(club_id,kick_off,signup_open_at,spots,teams_count) values($1,now()+interval '2 days',now()+interval '1 day',2,2) returning id",[g1]);
await as(ids[1]); const m2=await createMatch(g2);
await as(ids[3]);
eq(await scalar('select count(*)::int from match'),0);
await deny('select match_action(\'join\',$1)',[m1]);
await as(ids[4]); eq(await scalar('select count(*)::int from match'),0); eq(await scalar('select count(*)::int from club'),1); await deny('select group_action(\'create\',null,null,\'Unverified\')');
await as(null); await deny('select * from match'); await deny('truncate table public.profile');
await deny('select name from club');
await deny('select organizer_id from club');
await as(ids[0]); eq(await scalar('select count(*)::int from match'),3); await deny('select match_action(\'generate\',$1)',[m2]);
await deny('select match_action(\'generate\',$1)',[empty]);
eq(await scalar('select status from match where id=$1',[empty]),'scheduled');
eq(await scalar('select count(*)::int from team where match_id=$1',[empty]),0);
await as(ids[1]);eq(await scalar('select can_access_chat($1)',[waiting]),true);
await db.query("insert into chat_message(match_id,user_id,content) values($1,$2,'Before signups')",[waiting,ids[1]]);checks++;
await as(ids[3]);eq(await scalar('select can_access_chat($1)',[waiting]),false);
await deny("insert into chat_message(match_id,user_id,content) values($1,$2,'Pending')",[waiting,ids[3]]);
await as(ids[0]);eq(await scalar('select can_access_chat($1)',[waiting]),true);
eq((await match('join',m1)).state,'confirmed');
await as(ids[1]); eq(await scalar('select can_access_chat($1)',[m1]),true);
eq((await match('join',m1)).state,'confirmed');
eq(await scalar('select can_access_chat($1)',[m1]),true);
await as(ids[2]); eq((await match('join',m1)).state,'waitlist');
eq(await scalar('select can_access_chat($1)',[m1]),true);
await db.query("insert into chat_message(match_id,user_id,content) values($1,$2,'From waitlist')",[m1,ids[2]]);checks++;
await as(ids[1]); eq((await match('cancel',m1)).promoted,ids[2]);
eq(await scalar('select can_access_chat($1)',[m1]),true);
eq((await match('join',m1)).state,'waitlist');
eq(await scalar('select can_access_chat($1)',[m2]),true);
await as(ids[0]);eq(await scalar('select can_access_chat($1)',[m2]),false);
await deny("insert into chat_message(match_id,user_id,content) values($1,$2,'Other group')",[m2,ids[0]]);
await as(ids[0]);
// Failure after team inserts must roll back the entire generation.
await admin();
await db.exec(`create function public.fail_snapshot() returns trigger language plpgsql as $$begin raise exception 'injected'; end$$; create trigger failure before insert on rating_snapshot for each row execute function fail_snapshot();`);
await as(ids[0]);await deny('select match_action(\'generate\',$1)',[m1]);
eq(await scalar('select status from match where id=$1',[m1]),'scheduled');
eq(await scalar('select count(*)::int from team where match_id=$1',[m1]),0);
await admin();await db.exec('drop trigger failure on rating_snapshot');
await as(ids[0]);await match('generate',m1);
eq(await scalar('select status from match where id=$1',[m1]),'locked');
eq(await scalar('select min(rating_display)::int from rating_snapshot where match_id=$1',[m1]),0);
await admin();await db.query("update match set kick_off=now()-interval '1 hour' where id=$1",[m1]);
await as(ids[1]);eq(await scalar('select can_access_chat($1)',[m1]),true);
await db.query("insert into chat_message(match_id,user_id,content) values($1,$2,'After kickoff')",[m1,ids[1]]);checks++;
await as(ids[3]);eq(await scalar('select can_access_chat($1)',[m1]),false);
await as(ids[0]);
const teams=(await db.query('select id from team where match_id=$1 order by name',[m1])).rows;
const from=await scalar('select team_id from team_assignment where user_id=$1',[ids[0]]);
const to=teams.find(t=>t.id!==from).id;
await match('move',m1,ids[0],from,to);
await as(ids[1]);await match('join',m2);await match('generate',m2);
const foreign=await scalar('select id from team where match_id=$1 limit 1',[m2]);
await as(ids[0]);await deny('select match_action(\'move\',$1,$2,$3,$4)',[m1,ids[0],to,foreign]);
await deny('select match_action(\'move\',$1,$2,$3,$4)',[m1,ids[1],from,to]);
await deny("insert into storage.objects(bucket_id,name) values('avatars',$1)",[ids[1]+'/avatar.png']);
await db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)",[ids[0]+'/avatar.png']);checks++;
// Metadata can be edited, but the captured self-assessment remains immutable.
await admin();await db.query(`update auth.users set raw_user_meta_data='{"initial_rating":5}' where id=$1`,[ids[0]]);
await as(ids[0]);await db.query('select initialize_profile()');
await admin();eq(await scalar('select rating_base from profile where user_id=$1',[ids[0]]),0);
// Redesign: private ratings, invites, swaps, results, votes, stats, weekly repeat, onboarding, account deletion.
await as(ids[2]);
await deny('select rating from group_membership');
eq(await scalar('select count(*)::int from group_members($1)',[g1]),3);
eq(await scalar('select count(*)::int from group_members($1) where rating is not null',[g1]),1);
eq(await scalar('select count(*)::int from team_summary($1)',[m1]),2);
await deny('select group_invite($1)',[g1]);
await as(ids[0]);
eq(await scalar('select count(*)::int from group_members($1) where rating is not null',[g1]),4);
eq(await scalar('select pending_requests from my_groups() where club_id=$1',[g1]),1);
const code=await scalar('select group_invite($1)',[g1]);
await as(ids[3]);
eq(await scalar('select my_status from group_by_code($1)',[code.toLowerCase()]),'pending');
await group('join_code',null,null,code);
eq(await scalar('select status from my_groups() where club_id=$1',[g1]),'approved');
await as(ids[1]); await deny("select group_action('remove',$1,$2)",[g1,ids[3]]);
await as(ids[0]); await group('remove',g1,ids[3]);
eq(await scalar('select count(*)::int from group_members($1) where user_id=$2',[g1,ids[3]]),0);
// Swaps keep both teams the same size.
{
  const teamOf = async u => scalar('select ta.team_id from team_assignment ta join team t on t.id=ta.team_id where t.match_id=$1 and ta.user_id=$2',[m1,u]);
  let t0=await teamOf(ids[0]); const t2=await teamOf(ids[2]);
  if (t0===t2) { const other=teams.find(t=>t.id!==t0).id; await match('move',m1,ids[0],t0,other); t0=other; }
  await as(ids[2]); await deny('select swap_players($1,$2,$3)',[m1,ids[0],ids[2]]);
  await as(ids[0]); await db.query('select swap_players($1,$2,$3)',[m1,ids[0],ids[2]]);
  eq(await teamOf(ids[0]),t2); eq(await teamOf(ids[2]),t0);
  await deny('select swap_players($1,$2,$3)',[m1,ids[0],ids[0]]);
  await db.query('select set_paid($1,$2,true)',[m1,ids[2]]);
  eq(await scalar('select paid from signup where match_id=$1 and user_id=$2',[m1,ids[2]]),true);
  await as(ids[2]); await deny('select set_paid($1,$2,false)',[m1,ids[2]]);
  // Results: my team (t2) wins 3-1; ids[2] first marked absent, then corrected.
  const scores=JSON.stringify({[t2]:3,[t0]:1});
  await deny('select record_result($1,$2,$3)',[m1,scores,[]]);
  await as(ids[0]); await db.query('select record_result($1,$2,$3)',[m1,scores,[ids[2]]]);
  eq(await scalar('select status from match where id=$1',[m1]),'completed');
  eq(await scalar('select attended from signup where match_id=$1 and user_id=$2',[m1,ids[2]]),false);
  await deny('select vote_motm($1,$2)',[m1,ids[2]]);
  await db.query('select record_result($1,$2,$3)',[m1,scores,[]]);
  await deny('select vote_motm($1,$2)',[m1,ids[0]]);
  await db.query('select vote_motm($1,$2)',[m1,ids[2]]);
  await as(ids[2]); await db.query('select vote_motm($1,$2)',[m1,ids[0]]);
  eq(await scalar('select count(*)::int from motm_vote'),1);
  eq((await scalar('select match_summary($1)',[m1])).motm.length,2);
  await as(ids[0]);
  eq(await scalar('select player_stats($1)',[g1]),{games:1,wins:1,showed_up:100,form:['W'],motm:1});
}
// A weekly match rolls to next week once it has kicked off.
{
  const weekly=await scalar("insert into match(club_id,kick_off,signup_open_at,repeat_weekly) values($1,now()-interval '2 hours',now()-interval '1 day',true) returning id",[g1]);
  const before=await scalar('select count(*)::int from match');
  await db.query('select * from match_feed()');
  eq(await scalar('select count(*)::int from match'),before+1);
  eq(await scalar('select next_match_id is not null and not repeat_weekly from match where id=$1',[weekly]),true);
  eq(await scalar('select count(*)::int from match where repeat_weekly and kick_off>now()'),1);
  await db.query('select * from match_feed()');
  eq(await scalar('select count(*)::int from match'),before+1);
}
// Re-generating before kick-off redraws the teams.
{
  const m3=await createMatch(g1);
  await match('join',m3); await as(ids[2]); await match('join',m3);
  await deny("select match_action('regenerate',$1)",[m3]);
  await as(ids[0]); await match('generate',m3); await match('regenerate',m3);
  eq(await scalar('select count(*)::int from team_assignment ta join team t on t.id=ta.team_id where t.match_id=$1',[m3]),2);
  eq(await scalar('select status from match where id=$1',[m3]),'locked');
}
// Teams are drawn automatically at T-60 when anyone loads the matches.
{
  const soon=await scalar("insert into match(club_id,kick_off,signup_open_at,spots,teams_count) values($1,now()+interval '2 hours',now()-interval '1 day',4,2) returning id",[g1]);
  await match('join',soon);
  await admin(); await db.query("update match set kick_off=now()+interval '30 minutes' where id=$1",[soon]);
  await as(ids[2]); await db.query('select sync_matches()');
  eq(await scalar('select status from match where id=$1',[soon]),'locked');
  eq(await scalar('select count(*)::int from team where match_id=$1',[soon]),2);
  await as(ids[0]);
}
// Magic-link and OAuth players pick a name once; sign-up form players are already onboarded.
{
  const fresh='00000000-0000-4000-8000-000000000099', named='00000000-0000-4000-8000-000000000098';
  await admin();
  await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'fresh@example.test',now(),'{}'),($2,'named@example.test',now(),'{"display_name":"Named","initial_rating":2}')`,[fresh,named]);
  eq(await scalar('select onboarded from profile where user_id=$1',[fresh]),false);
  eq(await scalar('select display_name||onboarded from profile where user_id=$1',[named]),'Namedtrue');
  await as(fresh); await db.query('select complete_onboarding($1,$2)',['Nick',4]);
  await db.query('select complete_onboarding($1,$2)',['Other',1]);
  await admin(); eq(await scalar('select display_name||rating_base from profile where user_id=$1',[fresh]),'Nick4');
}
// Deleting an account hands groups on, removes empty groups and frees the auth row.
{
  await as(ids[1]); await db.query('select delete_account_data()');
  await admin();
  eq(await scalar('select count(*)::int from club where id=$1',[g2]),0);
  eq(await scalar('select count(*)::int from group_membership where user_id=$1',[ids[1]]),0);
  await db.query('delete from auth.users where id=$1',[ids[1]]); checks++;
  await as(ids[2]); await db.query('select delete_account_data()');
  await admin(); await db.query('delete from auth.users where id=$1',[ids[2]]); checks++;
  await as(ids[0]); await db.query('select delete_account_data()');
  await admin(); eq(await scalar('select count(*)::int from club where id=$1',[g1]),0);
}
await as(ids[0]);await db.query('delete from match where id=$1',[m1]);
eq(await scalar('select count(*)::int from team where match_id=$1',[m1]),0);
console.log(`Database isolation, roles, ratings, chat, waitlist, storage and atomic rollback: ${checks} checks passed`);
await db.close();
