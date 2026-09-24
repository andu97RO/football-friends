# Web release status — 24 September 2026

The web candidate is deployed at `https://football-friends-seven.vercel.app`, with Vercel authentication protection enabled for **all** deployments. Its current immutable deployment is `https://football-friends-4vvoo641p-bogdan-andreis-projects.vercel.app`. Both the root page and deep links return the Expo SPA through an authenticated Vercel CLI request; anonymous requests redirect to Vercel sign-in. **Public registration is not open.**

Initial candidate source commit: `bc8a09696da97bcece0c9c4ec689074bc05182c1`. Review: [draft PR #7](https://github.com/andu97RO/football-friends/pull/7). The [GitHub web release checks](https://github.com/andu97RO/football-friends/actions/runs/36004065601) passed on that commit.

The initial deployment's login client accidentally embedded a placeholder Supabase address and key, causing browser `Failed to fetch` on sign-in. The current deployment uses the real public configuration. A web export check now rejects mismatched login bundles, and Metro's cache key includes the public build configuration. A local real-backend browser check returned the expected `Invalid login credentials` for a disposable nonexistent account; the deployed login asset was inspected and contains the real project URL with no placeholder.

The Supabase project is `exqtxouswbcunrgxftzr`. The ordered migration is `supabase/migrations/20260924114413_group_access.sql` (applied as `group_access`). It preserved the original group's 22 matches and 55 signups and created 26 group memberships. The original organizer is owner; all other legacy users are approved members. No legacy account had `is_admin = true`. All prior ratings were copied to that group. See [MIGRATION_REVIEW.md](MIGRATION_REVIEW.md).

Current Edge Function versions: `join-match` v3, `cancel-signup` v7, `lock-and-generate` v7, `swap-players` v2. Obsolete underscore-named and invitation endpoints now return 410; their previous versions are held in the ignored `.release-private/` directory. There were no scheduled cron jobs to retire.

Validation completed: TypeScript passes; lint has zero errors and 103 warnings; PGlite database suite passes 45 checks; real-config Node 22 Expo/Vercel build passes; 45 mocked browser tests pass across desktop Chrome, mobile Chrome, and mobile Safari. Browser tests use mocked Supabase and must not be treated as real-user validation. Live anonymous REST requests can read only the public group directory and are denied match, profile, and membership records. Supabase reports email confirmation enabled. Vercel project Node version is 22.x, and no service-role key is present in its frontend environment.

Before opening the URL:

1. Obtain a sending domain, configure and test custom SMTP using [EMAIL_SETUP.md](EMAIL_SETUP.md). It is currently **off**.
2. Set the Supabase Auth Site URL to `https://football-friends-seven.vercel.app`; allow its `/callback` redirect and only project-specific preview redirects. Verify these settings in the dashboard. The connected database tools cannot read Auth URL/SMTP configuration, and the CLI management API token was rejected for that endpoint.
3. Complete real-user signup, confirmation, password recovery, two-group permissions, match/chat, avatar, and desktop/mobile walkthroughs. Use disposable records; use an isolated database for destructive or failure-injection checks.
4. Obtain a full recoverable database backup before further data changes. Supabase reports no physical backups and PITR disabled; CLI `db dump` could not run with the current database privileges. The ignored `.release-private/` snapshot contains application rows and Auth metadata only, **not** password hashes or a full restorable backup.
5. Review Supabase security/performance advisors. Current notices include GraphQL table visibility under existing grants (RLS still applies), leaked-password protection disabled, and several unindexed foreign keys. See the Supabase dashboard for live notices before launch.
6. Remove Vercel protection only after the above pass. Keep the previous frontend and function versions and the full backup available. Preserve the new access restrictions during any rollback.
