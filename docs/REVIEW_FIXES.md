# PR 8 review fixes

## Backend deployment — 15 October 2026

Applied `20261004140627_fix_review_workflows.sql` to the live Supabase project
through the migration API. The API recorded it as version `20261015083622`,
name `fix_review_workflows`. This is the same SQL as the repository file, not
an additional migration to run. Do not reapply it just because the timestamps
differ; reconcile migration history before using automated database pushes.
An optional history-ID normalization was rejected by automatic approval review;
production migration-history metadata was left unchanged.

Deployed with JWT verification enabled:

- `delete-account` v2
- `notify-teams` v1
- `cancel-signup` v9
- `lock-and-generate` v9
- `create-match` v2
- `notify-chat` v2

Retrieved deployed source and confirmed each entrypoint and shared helper
matches this repository. Live checks confirmed the outbox has RLS enabled,
the cleanup and format-guard triggers exist, the old authenticated cleanup RPC
is revoked, and the storage/outbox helpers are restricted to service access.
An unauthenticated HTTP request to `notify-teams` returned 401.

The isolated database suite passed 130 checks; Edge handler regression checks
also passed. No real account was deleted and no test push was sent to players.
A signed-in end-to-end test of deletion and delivery remains unverified.

Security advisors retain the pre-existing
[authenticated GraphQL-discovery](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed)
and [leaked-password-protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
warnings. The new outbox has an informational
[RLS-without-policies notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy):
this is intentional because only the service role accesses it.

This records the backend release only. Frontend hosting was not deployed in
this operation; PR #11 also contains the web input-outline change.

## Rollout

1. Apply `supabase/migrations/20261004140627_fix_review_workflows.sql` before deploying the updated functions and frontend. It makes group cleanup atomic with auth deletion, restricts the old standalone cleanup RPC, handles locked squads, protects drawn formats, and creates the notification outbox.
2. Deploy `delete-account` and the new `notify-teams` Edge Function. Keep JWT verification enabled; the shared handler also verifies the caller. Existing notification functions should be redeployed with the updated shared helper.
3. Release the frontend. Feed and match-detail loads wake the notification worker after automatic generation. Failed sends remain queued for the next load, and a crashed worker's lease expires after five minutes. Delivery is at least once: a crash after Expo accepts a push but before acknowledgement can cause a duplicate.

Deploy the migration and `delete-account` together in a coordinated release: the old function's standalone cleanup RPC is intentionally revoked. Storage removal happens through the Storage API before auth deletion; any later deletion failure rolls back all group cleanup, but already removed avatar bytes cannot be rolled back.

Leaving or removing a member before kickoff now removes them from locked squads and rating snapshots. Locked matches keep the existing remaining squads; waitlisted players are not promoted into an already drawn match. Organisers can regenerate to rebalance the remaining approved players.

## Local verification

- `npm run type-check`
- `npm run lint`
- `npm run test:db`
- `npm run test:functions`
- Existing Playwright suite plus regression cases for next-match dates, locked format controls, and reopening results.
