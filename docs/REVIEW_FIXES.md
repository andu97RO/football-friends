# PR 8 review fixes

These fixes are prepared locally; production has not been changed.

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
