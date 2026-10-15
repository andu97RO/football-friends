import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual Edge Function handlers with isolated Auth/Storage/Expo adapters.
function load(path, context) {
  const source = readFileSync(path, 'utf8').replace(/^import .*;\n/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { exports: {}, console: { error() {} }, ...context });
}
function handler(path, service, extra = {}) {
  let run;
  load(path, { serve: (callback) => { run = callback; }, serviceClient: () => service, ...extra });
  return run;
}
const deletionPath = 'supabase/functions/delete-account/index.ts';
let objects = [{ bucket_id: 'avatars', name: 'u/old.png' }, { bucket_id: 'avatars', name: 'u/new.jpg' }, { bucket_id: 'other', name: 'owned' }];
const calls = [];
const service = {
  rpc: async (name, args) => { assert.equal(name, 'account_storage_objects'); assert.equal(args.u, 'u'); return { data: objects }; },
  storage: { from: (bucket) => ({ remove: async (paths) => { calls.push(['remove', bucket, ...paths]); objects = objects.filter((o) => o.bucket_id !== bucket || !paths.includes(o.name)); return {}; } }) },
  auth: { admin: { deleteUser: async (id) => { calls.push(['delete', id]); assert.equal(objects.length, 0); return {}; } } },
};
assert.equal((await handler(deletionPath, service)({ user: { id: 'u' } })).deleted, true);
assert.deepEqual(calls.map(c => c[0]), ['remove', 'remove', 'delete']);
let deleted = false;
const storageFailure = { ...service, rpc: async () => ({ data: [{ bucket_id: 'avatars', name: 'u/a' }] }), storage: { from: () => ({ remove: async () => ({ error: new Error('Storage unavailable') }) }) }, auth: { admin: { deleteUser: async () => { deleted = true; return {}; } } } };
await assert.rejects(handler(deletionPath, storageFailure)({ user: { id: 'u' } }), /Storage unavailable/);
assert.equal(deleted, false);
const stuck = { ...storageFailure, storage: { from: () => ({ remove: async () => ({}) }) } };
await assert.rejects(handler(deletionPath, stuck)({ user: { id: 'u' } }), /did not remove/);
assert.equal(deleted, false);

// Real shared notify implementation: recipient preferences, locale and failed Expo sends.
let notify;
const rows = [
  { user_id: 'en', push_token: 'en-token', locale: 'en', notify_teams: true },
  { user_id: 'ro', push_token: 'ro-token', locale: 'ro', notify_teams: true },
  { user_id: 'off', push_token: 'off-token', locale: 'ro', notify_teams: false },
];
let failPush = false;
const sent = [];
const profileClient = { from: () => ({ select: () => ({ in: () => ({ not: async () => ({ data: rows }) }) }) }) };
const exports = {};
load('supabase/functions/_shared/common.ts', { exports, createClient: () => profileClient, Deno: { env: { get: (name) => name === 'APP_TIMEZONE' ? 'Europe/Bucharest' : 'test' } }, fetch: async (url, options) => { sent.push(JSON.parse(options.body)); return { ok: !failPush, status: failPush ? 503 : 200, json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) }; } });
notify = exports.notify;
assert.equal(await notify(['en','ro','off'], 'notify_teams', (locale) => ({ title: locale, body: 'teams' }), {}, true), 2);
assert.deepEqual(sent[0].map(m => [m.to, m.title]), [['en-token','en'],['ro-token','ro']]);
failPush = true;
await assert.rejects(notify(['en'], 'notify_teams', () => ({ title: 'teams', body: '' }), {}, true), /503/);

// A failed delivery is released for retry and never acknowledged as sent.
const event = { match_id: 'm', user_ids: ['en','ro'], kick_off: '2026-10-08T17:00:00Z', claim_id: 'claim' };
const workerCalls = [];
function query(action) {
  return { eq: (key, value) => { workerCalls.push([action, key, value]); return key === 'claim_id' ? Promise.resolve({}) : query(action); } };
}
const workerService = { rpc: async () => ({ data: [event] }), from: () => ({ delete: () => query('ack'), update: () => query('retry') }) };
const worker = handler('supabase/functions/notify-teams/index.ts', workerService, { notify, when: exports.when });
assert.equal((await worker()).delivered, 0);
assert.equal(workerCalls.some(c => c[0] === 'ack'), false);
assert.equal(workerCalls.some(c => c[0] === 'retry'), true);
failPush = false; workerCalls.length = 0;
assert.equal((await worker()).delivered, 1);
assert.equal(workerCalls.some(c => c[0] === 'ack'), true);
assert.equal(workerCalls.some(c => c[0] === 'retry'), false);
console.log('Edge regression checks passed: avatar cleanup, failure ordering, notification preferences, locales and retry/ack');
