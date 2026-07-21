# FootyFriends Audit — Findings & Fixes (2026-07-02)

This document records a full audit of the app (backend/Supabase, frontend/app,
build & tooling), independently verified against the actual code rather than
taken on faith from `CLAUDE.md`. It lists what was actually broken, what was
a real security gap, what was cleaned up, and what was investigated but found
to be a false alarm or an intentional design choice.

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

## Applying these changes

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
