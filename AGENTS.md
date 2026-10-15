# AGENTS.md

Guidance for Codex working in this repository. Reviewed against `main` at
`0f65d86` on 15 October 2026. Repository behavior does not establish production
migration or deployment status.

## Project and commands

FootyFriends is an Expo SDK 54 / React Native 0.81.5 app with a web SPA,
TypeScript strict mode, expo-router, Supabase, TanStack Query, and Zustand.
It supports invite-based groups, FCFS match signups, automatic waitlist
promotion, balanced teams, chat, match results, and English/Romanian copy.
Use Node 22 (see `package.json` and CI).

```bash
npm ci                    # Install locked dependencies
npm start                 # Expo development server
npm run ios               # iOS development
npm run android           # Android development
npm run web               # Web development
npm run type-check        # TypeScript
npm run lint              # ESLint
npm run test:db           # Isolated PostgreSQL/PGlite permission and workflow tests
npm run test:functions    # Edge handler tests with isolated adapters
npm run test:e2e          # Playwright browser tests (mocked Supabase)
npm run test:e2e:ui        # Interactive browser tests
npm run build:web         # Export web SPA and verify public config in bundle
```

`.github/workflows/web.yml` runs type-check, lint, database tests, web build,
and browser tests. Run `test:functions` separately when changing handlers;
it is not currently included in that workflow. Mocked browser tests do not
replace real-session RLS or deployed-backend validation.

## Routes and shared UI

- `app/(auth)/`: password login/signup, magic links, forgot-password,
  check-inbox, reset-password, callback. Google OAuth is exposed; Apple
  sign-in is temporarily hidden, though `lib/oauth.ts` supports it.
- `app/(tabs)/`: matches feed across groups, groups, profile. No Admin tab.
- `app/group/[id].tsx`: group membership, requests, invites, roles, ratings.
- `app/join/[code].tsx`: invite landing; `app/onboarding.tsx`: name/self-rating.
- `app/match/new.tsx`: creation; `app/match/[id]/`: details, chat, results.
- `app/teams/[id].tsx`: teams, swaps, undo, regeneration.
- `app/_layout.tsx`: polyfills first, fonts/language, auth listeners, query
  provider, notifications, alert/toast/offline hosts.

Use `constants/theme.ts` tokens and `components/ui/` components, including
`Field` / `PasswordField` from `components/ui/Field.tsx`. Fonts are Barlow
Condensed (display) and Manrope (body). Keep the Reanimated Babel plugin last.
All user-facing copy uses `useT()` / `t()` from `lib/i18n.ts`; add keys to both
`lib/locales/en.ts` and `ro.ts` (Romanian plurals: `_one`, `_few`, `_other`).
Use `lib/alert.ts` for dialogs and `lib/toast.ts` for transient feedback.

## State, sessions, and data access

- Supabase client: `lib/supabase.ts`; Supabase owns token persistence via
  AsyncStorage. Session state is exposed through `lib/auth-store.ts`.
- Use `isVerifiedSession()` from `lib/auth-utils.ts` for verified access.
  Preserve password-recovery routing and onboarding checks.
- Use TanStack Query for server state. Shared hooks and helpers live in
  `lib/api.ts` (`useFeed`, `useProfile`, `rpc`, `callFunction`) and `lib/groups.ts`.
  Invalidate the affected current query keys; match keys are in `MATCH_KEYS`.
- Keep `lib/types.ts` consistent with the baseline plus ordered migrations.
- Use explicit profile column selections (`PROFILE_COLUMNS`); sensitive
  columns such as push tokens and ratings are not generally client-readable.

## Backend invariants

- App signup/cancellation calls go through hyphenated `join-match` /
  `cancel-signup` Edge Functions. These now call `match_action` with the
  caller's JWT; legacy `*_atomic` RPCs are not the current implementation.
- `public.match_action` delegates to `private.match_action`, which locks the
  match row and performs signup, cancellation, and generation atomically.
  Capacity is `spots - confirmed_count`; never implement client-side writes
  that bypass this transaction or the group authorization checks.
- Cancellation promotes the first waitlisted player while a match is
  scheduled. Leaving/removing a group member also cleans up their signups,
  squads, and snapshots. Locked matches do not promote into drawn teams.
- Group ownership/admin status comes from approved `group_membership` roles,
  not the legacy global `profile.is_admin` flag. Ratings are per-group, 0–5.
  Other players' ratings are available only through authorized group RPCs;
  team averages use `team_summary`.
- Groups are invite-only by default; only listed groups appear in search.
  Approved, verified group members can access that group's match chat,
  including before signup and after kickoff; participation is not required.
- Team generation uses a serpentine rating draft in `private.generate_teams`.
  Organizers can generate early through `lock-and-generate`; automatic T-60
  generation runs on match synchronization/feed reads, not a guaranteed cron.
  Swaps use `swap_players`; results use `record_result`. Weekly repeats roll
  forward through SQL synchronization.
- Account deletion uses `delete-account`, Storage API cleanup, then Auth user
  deletion. A database trigger makes group cleanup atomic with Auth deletion.
  Do not call the revoked standalone `delete_account_data` RPC.

## Schema and migrations

`supabase/schema.sql`, `chat.sql`, and other root SQL files are legacy
baselines/patches, not a complete representation of the current schema.
Current behavior requires the ordered SQL in `supabase/migrations/`:

1. `20260924114413_group_access.sql`
2. `20260925161407_allow_group_match_chat.sql`
3. `20260930141927_redesign.sql`
4. `20261004140627_fix_review_workflows.sql`

Do not reapply legacy RLS/permission patches over these migrations: they can
restore superseded access rules. The isolated setup in `tests/database.mjs`
shows the tested baseline prerequisites and migration order. Existing-project
rollouts also require the mapping review in `docs/MIGRATION_REVIEW.md`.
`supabase/drop_legacy_unused_rpcs.sql` is optional manual legacy cleanup, not
an ordered migration or evidence that cleanup ran in production.

## Notifications and links

- `lib/notifications.ts` registers Expo device tokens in `profile.push_token`;
  clear the token before signout.
- Edge Functions use `_shared/common.ts`; notification delivery respects
  `notify_*` preferences and locale. Deploy affected handlers with the helper.
- Notifications cover waitlist promotion, teams, new matches, and chat.
  Automatic draws enqueue teams notifications in an outbox; feed/detail
  loads wake `notify-teams`. Delivery is at least once, with retry leases.
- URL scheme is `footy://`. `getAuthCallbackUrl()` builds `/callback` on web
  from the current origin and the native callback URL via Expo Linking.
  Do not add `/auth` to callback paths: `(auth)` is a route group only.
- Invite links use `/join/CODE`; native sharing uses `EXPO_PUBLIC_WEB_URL`.

## Configuration and release

See `.env.example` for public Supabase URL/anon key, app scheme, timezone,
and web URL. Never put `SUPABASE_SERVICE_ROLE_KEY` in public/client config.
Use `npm run build:web` to check exported public configuration. Metro's cache
key includes public build configuration; see `metro.config.js`.

Deploy Edge Functions via `supabase functions deploy <hyphenated-name>`.
Coordinate migrations and handlers as described in `docs/REVIEW_FIXES.md`.
Mobile builds use EAS (the app config still has a placeholder EAS project ID).
Web hosting is configured for Vercel; see `vercel.json` and
`docs/DEPLOYMENT.md`. Dated release/audit notes describe historical checks,
not current live configuration. Verify actual deployed migrations/functions,
Auth redirects, email delivery, and real user permissions before release.
