# FootyFriends Audit — Historical Findings & Current Status

Original audit: 2 July 2026. Repository status reviewed on 15 October 2026
against `main` at `0f65d86` (PRs #7–#10).

Sections A–E preserve the original findings and fixes. Their file paths,
permission assumptions, and rollout steps describe the pre-group app, not the
current implementation. They are not a current security audit or evidence of
production deployment. Section F reviews the optional legacy cleanup script.

## Current status after group access and redesign

- **Admin flows:** there is no longer `app/(tabs)/admin.tsx`. Group management
  is in `app/group/[id].tsx`; match creation uses `app/match/new.tsx` and
  `components/MatchForm.tsx`. Authorization uses approved group owner/admin
  roles, not `profile.is_admin`; ratings are per-group, not global admin edits
  through `update_player_rating_atomic`. The group migration revokes execution
  of that old RPC from public, anon, authenticated, and service_role.
- **Signup/cancellation:** the current Edge Functions call `match_action` with
  the caller's JWT. The SQL implementation locks the match row, handles FCFS
  and promotion, and writes the audit log in the same transaction.
- **Team generation/swaps:** the original non-atomic follow-up is superseded.
  Generation runs inside `private.match_action` / `private.generate_teams`;
  swaps use `swap_players`. The database suite injects a snapshot failure and
  asserts generation rolls back both teams and match status.
- **Visibility/chat:** broad global profile/signup visibility is no longer
  intentional. Group membership and verified email scope access; chat is
  available to approved group members even without a match signup. The old
  confirmed-participant-only policy is superseded by the chat migration.
- **Capacity RPC:** `get_match_capacity` is no longer anon-readable; the group
  migration restricts execution to authenticated callers and filters by group.
- **Notifications:** logout still clears the push token. Current handlers use
  the shared notification helper, preferences, and locale. Automatic team
  notifications use an outbox with retries; see `docs/REVIEW_FIXES.md`.
- **Tooling:** `.github/workflows/web.yml` now exists. It runs type-check, lint,
  database tests, web export, and mocked browser tests. `test:functions` is a
  separate command. The EAS project ID in `app.json` remains a placeholder.
- **Schema:** root SQL baselines alone are not the current schema. Apply the
  ordered group/chat/redesign/review migrations after their prerequisites.
  Do not rerun legacy RLS/grant patches over them. See `AGENTS.md`,
  `tests/database.mjs`, `docs/MIGRATION_REVIEW.md`, and `docs/REVIEW_FIXES.md`.

This review inspected repository code and migrations. Live routine inventory,
cron jobs, security advisors, Auth settings, and deployment state were not
rechecked; dated claims below must not be treated as fresh live verification.

## A. Functional bugs (app was broken)

### 1. "Delete Match" corrupted data on every attempt
`app/(tabs)/matches.tsx` manually deleted `team_assignment` → `team` →
`signup` → `audit_log` → `match` as five separate, non-atomic client REST
calls. There was no RLS DELETE policy on `signup` or `audit_log` anywhere in
`supabase/*.sql`, so the `signup` delete step always failed with a
permission error — after `team`/`team_assignment` rows were already gone,
leaving an orphaned match with no teams.

Digging further: `rating_snapshot.match_id` and `post_match_vote.match_id`
also referenced `match` *without* `ON DELETE CASCADE` (unlike `signup` and
`team`, which already cascade), so even a single `DELETE FROM match` would
have failed with a foreign-key violation for any locked match with rating
history.

**Fix**:
- `supabase/fix_match_delete_cascade.sql` — adds `ON DELETE CASCADE` to
  `rating_snapshot.match_id` and `post_match_vote.match_id`, bringing them in
  line with `signup`/`team`. Also adds an admin/organizer DELETE policy on
  `rating_snapshot` for completeness.
- `app/(tabs)/matches.tsx` — `deleteMatchMutation` is now a single
  `supabase.from("match").delete().eq("id", matchId)`, relying on cascades.
  `audit_log` rows are intentionally left behind as a historical record
  (they have no FK to `match`, by design).

### 2. Admin "update player rating" always showed a false error
`app/(tabs)/admin.tsx`'s `updateRatingMutation` updated `profile.rating_base`
(this succeeded — covered by `admin-policies.sql`), then tried to insert
into `audit_log` directly from the client. `rls-policies.sql` explicitly has
**no INSERT policy** for `audit_log` ("Only system can insert audit logs
... No insert policy for regular users"). The insert always threw, the
mutation's `onError` fired, and the admin saw an "Error" alert even though
the rating update had already succeeded.

**Fix**: `supabase/fix_admin_match_and_audit.sql` adds a
`update_player_rating_atomic(p_user_id, p_new_rating)` RPC
(`SECURITY DEFINER`, enforces `is_admin` itself) that updates the rating and
writes the audit log entry atomically, server-side — matching the existing
pattern used by `join_match_atomic`/`cancel_signup_atomic`.
`app/(tabs)/admin.tsx` now calls this RPC instead of two separate client
calls.

### 3. Admin "create match" could silently fail for some admins
The admin UI grabs the *first* row in the `club` table as the "default
club," but the `match` INSERT RLS policy only allows
`club.organizer_id = auth.uid()`. Any admin who isn't literally that club's
organizer would be blocked by RLS despite `is_admin = true`.

**Fix**: `supabase/fix_admin_match_and_audit.sql` adds an admin-bypass
INSERT policy on `match`, mirroring the existing admin-bypass UPDATE/DELETE
policies already present in `supabase/add_match_delete_policy.sql`.

### 4. Production build was misconfigured
`babel.config.js` referenced `transform-remove-console` for production
builds, and `.eslintrc.js` extended `'prettier'` — neither package was
listed in `package.json`. `npm run lint` and any production-mode bundle
would fail.

**Fix**: added `babel-plugin-transform-remove-console`,
`eslint-config-prettier`, and `prettier` to `devDependencies` in
`package.json`. Run `npm install` to pull them in.

## B. Security gaps (real, server-side)

### 5. `chat_message` RLS didn't check match participation
The RLS policies only checked `auth.role() = 'authenticated'`. The UI
(`app/match/[id]/chat.tsx`) filters by `match_id` client-side, but any
authenticated user could read or post into *any* match's chat by querying
the table directly, bypassing the UI filter entirely.

**Fix**: `supabase/fix_chat_visibility.sql` replaces both policies with
checks against `public.signup` (confirmed participant of that match), plus
allowances for the match's organizer and admins.

Signup/profile visibility (`fix-signup-visibility.sql`) was intentionally
left open — its own comment confirms it's needed so users can see the
confirmed players list for any match, which is reasonable for a closed
friends-group app.

### 6. Push token never cleared on logout
`lib/notifications.ts` already exported `unregisterPushNotifications(userId)`
but nothing called it. `app/(tabs)/profile.tsx`'s `performSignOut` called
`supabase.auth.signOut()` without clearing `profile.push_token`. On a
shared/reused device, this meant a logged-out user's push token stayed live
in the database, so they could keep receiving notifications intended for
whoever uses the device next (and vice versa).

**Fix**: `performSignOut` now calls `unregisterPushNotifications(session.user.id)`
before signing out.

## C. Cleanup (low risk)

- Removed debug `console.log`s in `lib/notifications.ts` (logged the raw
  push token) and `app/match/[id]/index.tsx` (logged full Edge Function
  request/response payloads for the cancel-signup flow).
- `supabase/cleanup.sql`:
  - Drops the unused `signup.hold_expires_at` column (never read or written
    by any Edge Function or app code — a leftover from the reservation/hold
    system superseded by `remove_waitlist_invitations.sql`). Also removed
    from `lib/types.ts`.
  - Adds `idx_signup_queue_pos` — used for `ORDER BY queue_pos` in
    `join_match_atomic` / `cancel_signup_atomic` / waitlist normalization,
    but was missing an index.
  - Collapses redundant, overlapping RLS `SELECT` policies on `profile` and
    `signup` down to one per table (Postgres OR's permissive policies
    together, so a broader `using (true)` policy already fully subsumed the
    narrower ones — no behavior change, just clarity).

## D. Investigated, not changed (false alarms / intentional)

- **"Nullable primary key columns"** in `team_assignment` / `rating_snapshot`
  / `post_match_vote` — not a real issue. PostgreSQL implicitly enforces
  `NOT NULL` on every column that's part of a primary key, regardless of
  whether it's declared explicitly.
- **"Redundant polyfill import"** in `app/_layout.tsx`
  (`@/lib/polyfills` + `react-native-url-polyfill/auto`) — these are two
  distinct, both-required polyfills (`import.meta` for web vs. the URL API
  for React Native), not a duplicate.
- **Broad signup/profile read visibility** — confirmed intentional (see
  above), left as-is.
- **`lock-and-generate` / `swap-players` not wrapped in a single DB
  transaction** — real fragility (a crash mid-operation could leave a match
  locked with partial team data) but recoverable by re-running, and fixing
  it properly means converting both into `SECURITY DEFINER` RPCs similar to
  `join_match_atomic`. Flagged as a follow-up, not implemented in this pass.
- **No `.github/workflows/` CI, placeholder EAS project ID** — infra/deploy
  setup gaps, not code bugs. Flagged for awareness only.

## Historical rollout (original audit only)

These steps are retained as history, not instructions for the current release.
Use the ordered migrations and rollout notes linked above for current changes.

1. `npm install` (pulls in the new devDependencies).
2. Apply the four new SQL files to your Supabase project, in this order:
   - `supabase/fix_match_delete_cascade.sql`
   - `supabase/fix_admin_match_and_audit.sql`
   - `supabase/fix_chat_visibility.sql`
   - `supabase/cleanup.sql`
3. `npm run lint && npm run type-check`.
4. Smoke-test: join/cancel/waitlist promotion still works; admin rating
   update no longer shows a false error; admin create-match works for any
   admin; admin delete-match succeeds cleanly with no orphaned rows; a user
   not signed up for a match cannot read/post its chat; logging out clears
   `profile.push_token`.

## E. Follow-up functional fixes (post-audit pass)

A second audit found remaining UX/functional gaps after the SQL fixes above.
These were fixed in app + edge-function code (and baselines were synced):

1. **Soft-lock hid Lock & Generate / fake View Teams** — `getMatchStatus`
   no longer treats T-60 as DB-locked. Soft-lock only closes new joins via
   `isSignupWindowOpen()`. Lock/View Teams/Cancel use `match.status`.
2. **Chat button ignored participation RLS** — Match Chat is gated to
   confirmed players / organizer / admin; chat route shows a clear deny
   state for others.
3. **Admin create-match cache miss** — invalidates `matches-with-signups`
   (and open-match-count) instead of unused `matches`.
4. **Admins could not lock teams** — `lock-and-generate` now allows
   `is_admin` (matching `swap-players`); match detail shows Lock for
   organizers and admins. Partial-failure recovery: re-run allowed when
   match is locked but has no teams yet.
5. **Waitlist copy said "You are in!"** — waitlisted users now see
   "On the waitlist".
6. **Profile lazy-created only on Profile tab** — `ensureProfile()` runs
   on verified session in root layout / tabs so chat FKs and push tokens
   work immediately.
7. **Greenfield schema drift** — `schema.sql`, `rls-policies.sql`, and
   `chat.sql` now include the cascade FKs, chat participation policies,
   admin create-match policy, rating RPC, and cleanup (no
   `hold_expires_at`, queue_pos index). Existing projects still apply the
   four `fix_*.sql` / `cleanup.sql` migration files.

## F. Legacy RPC cleanup — repository review, 15 October 2026

`supabase/drop_legacy_unused_rpcs.sql` is an optional manual cleanup script for
legacy databases. It is not in `supabase/migrations/`, so normal ordered
migration application does not execute it. Its presence does not prove it has
run against production.

The original local note reported security advisors flagging legacy routines.
The current repository has no app/lib/Edge Function/ordered-migration callers
of the four drop targets: `join_match(uuid)`, `cancel_signup(uuid)`,
`get_match_signups(uuid)`, and `backfill_waitlist_demotions()`. The last routine
still has a historical definition in `supabase/backfill_waitlist_demotions.sql`.
Current signup/cancellation/generation uses `match_action`, not `*_atomic`.

The script now wraps cleanup in a transaction, avoids `CASCADE`, and guards the
`auto_confirm_email()` grant revocation when that helper is absent. The group
migration already removes `on_auth_user_created_confirm` from `auth.users`
and conditionally revokes the helper's API grants. The old claim that this
trigger remains active is superseded; do not restore it.

Before execution, inspect the target project's routines, dependencies, jobs,
and external/deployed callers. Repository usage searches cannot rule out
live-only callers. `docs/RELEASE_STATUS.md` records underscore-named endpoints
returning 410 on 24 September; it does not establish today's inventory, and
this review does not recommend deleting endpoints without rechecking it.

The old advisor exceptions are also stale: `get_match_capacity` is restricted
to authenticated group access, and `update_player_rating_atomic` is revoked
by the group migration. Re-run advisors against the actual target project to
establish remaining findings. Leaked-password protection is an Auth setting,
not something verified by this repository review.

Local validation on 15 October used Node 22 and the pinned PGlite 0.3.14 in a
temporary directory (the checkout lacked that dependency). The cleanup passed
with absent routines, existing legacy routines, repeated execution, and revoked
API grants. A dependent view prevented a drop without `CASCADE`, and rollback
restored an earlier drop in the same transaction. All 130 existing database
workflow checks also passed with cleanup inserted after the ordered migrations.
These checks do not establish production deployment or absence of live callers.
