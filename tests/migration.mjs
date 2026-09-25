import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Replays the saved live application rows into a disposable PostgreSQL engine.
const backup=JSON.parse(readFileSync('.release-private/public-data-before.json'));
const users=JSON.parse(readFileSync('.release-private/auth-users-metadata-before.json'));
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public,storage to anon,authenticated,service_role;
create table storage.buckets(id text primary key,file_size_limit bigint,allowed_mime_types text[]);
insert into storage.buckets(id) values('avatars');
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create publication supabase_realtime;`);
await db.exec(readFileSync('supabase/schema.sql','utf8').replace('create extension if not exists "uuid-ossp";',''));
await db.exec(`alter table public.profile add column is_admin boolean default false,add column avatar_url text,add column push_token text;`);
await db.exec(readFileSync('supabase/chat.sql','utf8'));
for(const u of users) await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',[u.id,u.email,u.email_confirmed_at,JSON.stringify(u.raw_user_meta_data??{})]);
for(const table of ['profile','club','match','signup','team','team_assignment','rating_snapshot','post_match_vote','audit_log','chat_message']) {
  for(const row of backup[table]) {
    const cols=Object.keys(row);
    await db.query(`insert into public.${table}(${cols.map(k=>'"'+k+'"').join(',')}) values(${cols.map((_,i)=>'$'+(i+1)).join(',')})`,cols.map(k=>typeof row[k]==='object'&&row[k]!==null?JSON.stringify(row[k]):row[k]));
  }
}
await db.exec(`select setval(pg_get_serial_sequence('public.audit_log','id'),(select max(id) from public.audit_log));`);
await db.exec(readFileSync('supabase/migrations/20260924114413_group_access.sql','utf8'));
const scalar=async q=>Object.values((await db.query(q)).rows[0])[0];
for(const table of ['profile','club','match','signup','team','team_assignment','rating_snapshot','post_match_vote','audit_log','chat_message']) {
 const count=await scalar(`select count(*)::integer from public.${table}`);
 const before=backup[table].length;
 assert.ok(count>=before,`${table} lost rows`);
}
assert.equal(await scalar('select count(*)::integer from public.group_membership'),users.length);
assert.equal(await scalar("select count(*)::integer from public.group_membership where role='owner'"),1);
assert.equal(await scalar("select count(*)::integer from public.group_membership where role='admin'"),0);
assert.equal(await scalar("select count(*)::integer from public.group_membership where status='approved'"),users.length);
assert.equal(await scalar("select count(*)::integer from public.group_membership gm join public.profile p on p.user_id=gm.user_id where gm.rating=p.rating_base"),users.length);
console.log(`Migration rehearsal preserved ${backup.match.length} matches, ${backup.signup.length} signups and ${users.length} user memberships`);
await db.close();
