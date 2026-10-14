# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FootyFriends is a React Native mobile app for organizing weekly 6-a-side football matches with:
- FCFS (First Come First Served) signup system with waitlist
- Automatic waitlist promotion when spots open up
- Automated team balancing based on player ratings
- Magic link authentication (passwordless)
- Real-time push notifications via Expo
- Supabase backend (Postgres + Edge Functions)

## Development Commands

### Start Development
```bash
npm start                 # Start Expo dev server
npm run ios              # Run on iOS simulator
npm run android          # Run on Android emulator
npm run web              # Run on web (limited functionality)
```

### Code Quality
```bash
npm run lint             # Run ESLint
npm run type-check       # Run TypeScript type checking without emitting files
```

### Testing
```bash
npm run test:e2e         # Run Playwright e2e tests
npm run test:e2e:ui      # Run Playwright with UI
```

### Supabase Edge Functions
```bash
# Deploy individual functions
supabase functions deploy join-match
supabase functions deploy cancel-signup
supabase functions deploy lock-and-generate
```

## Tech Stack

- **Framework**: Expo SDK ~54 with React Native 0.81.5
- **Navigation**: expo-router (file-based routing)
- **Backend**: Supabase (Postgres + Edge Functions + Realtime)
- **State Management**: @tanstack/react-query + Zustand
- **Auth**: Supabase Auth with magic links
- **Push Notifications**: Expo Push Notifications
- **TypeScript**: Strict mode enabled
- **E2E Testing**: Playwright

## Architecture

### File-Based Routing (expo-router)
Routes are defined by the file structure in `app/`:
- `app/(auth)/` - Authentication flows (login with Apple/Google/magic link/password, sign-up, forgot-password, check-inbox, reset-password, callback)
- `app/(tabs)/` - Main tab navigation: matches (feed across all groups), groups, profile. There is no Admin tab: organisers create matches with "+" on Matches and manage people in `app/group/[id].tsx`
- `app/match/new.tsx` - New match (shares `components/MatchForm.tsx` with the Edit match sheet)
- `app/match/[id]/` - Match detail (index), chat, result (organisers record score + attendance)
- `app/teams/[id].tsx` - Teams view and editing (swap, undo, re-generate)
- `app/group/[id].tsx` - Group page / Manage group (invite link, requests, members, ratings)
- `app/join/[code].tsx` - Invite link landing (`/join/CODE`, `footy://join/CODE`)
- `app/onboarding.tsx` - Name + self-rating for magic-link / OAuth sign-ups
- `app/_layout.tsx` - Root layout: fonts, language, QueryClientProvider, auth listeners, Alert/Toast/Offline hosts
- `app/index.tsx` - Entry point with auth check

### Design system and copy
- Tokens in `constants/theme.ts` (dark pitch palette, lime accent reserved for the one primary action, team colours outside the UI palette). Fonts: Barlow Condensed (display) + Manrope (body)
- Shared components in `components/ui/` (Txt, Button, Card, Field/PasswordField, Sheet, ListRow, RatingPicker, Screen, states). Buttons use sentence case; touch targets are ≥44pt
- All copy goes through `useT()` / `t()` from `lib/i18n.ts` with dictionaries in `lib/locales/en.ts` and `ro.ts` (Romanian plurals: `_one`/`_few`/`_other`). Add every new key to both files
- Dialogs use `confirm()` / `showAlert()` from `lib/alert.ts`; transient feedback (with Undo) uses `showToast()` from `lib/toast.ts`

### State Management Pattern
**Global State (Zustand)**:
- `lib/auth-store.ts` - Authentication session state (DO NOT store auth tokens here, Supabase handles persistence via AsyncStorage)

**Server State (@tanstack/react-query)**:
- Use for all Supabase queries (matches, signups, teams, etc.)
- Enables automatic caching, refetching, and optimistic updates
- Example pattern in `app/(tabs)/matches.tsx`; shared hooks in `lib/api.ts` (`useFeed`, `useProfile`, `callFunction`, `rpc`) and `lib/groups.ts`

### Supabase Client Setup
- Main client: `lib/supabase.ts` (anon key, session stored in AsyncStorage)
- Auth utilities: `lib/auth-utils.ts` (session validation helpers)
- Polyfills: `lib/polyfills.ts` - MUST be imported first in `app/_layout.tsx`

### Critical Backend Patterns

**FCFS Signup System**:
- All signup operations MUST go through `supabase/functions/join-match`
- Uses row-level locking to prevent race conditions
- Atomic capacity checks: `spots - confirmed_count`
- Returns user state: `confirmed` (spots 1-18) or `waitlist` (queue_pos)

**Automatic Waitlist Promotion**:
- When confirmed player cancels → next waitlisted user is automatically promoted
- No user action required - promotion happens instantly
- Push notification sent to promoted user: "You're In!"
- Handled by `supabase/functions/cancel-signup`

**Team Generation** (T-60 minutes before kickoff):
- Organisers can run `supabase/functions/lock-and-generate` early; otherwise `private.auto_lock()` draws teams at T-60 the next time anyone loads matches (`sync_matches()` / `match_feed()`)
- Serpentine draft by rating (`private.generate_teams`); `regenerate` reshuffles equal ratings; `swap_players` keeps team sizes
- Creates `team`, `team_assignment`, and `rating_snapshot` records
- Match status transitions: `scheduled` → `locked` → `completed` (set by `record_result`)
- Weekly matches (`repeat_weekly`) roll to next week once they kick off (`private.roll_weekly`)

**Ratings are private**: `group_membership.rating` is not selectable by clients. Admins read ratings via `group_members(g)`; everyone sees team averages via `team_summary(m)`

**Groups are invite-only by default**: join with `group_action('join_code', value => code)`; only `club.listed` groups appear in search

### Database Schema (supabase/schema.sql)
Key tables:
- `profile` - `display_name`, `rating_base` (0-5 self-rating from sign-up), `avatar_url`, `push_token`, `notify_*` preferences, `locale`, `onboarded`
- `club` - Groups with `organizer_id`, `invite_code`, `listed`
- `group_membership` - Role (owner/admin/member), status (pending/approved), group `rating` (0-5)
- `match` - `status`, `kick_off`, `signup_open_at`, `spots`, `teams_count`, `venue_name`, `venue_url`, `fee_amount`, `fee_currency`, `payment_note`, `repeat_weekly`
- `signup` - `state` (confirmed/waitlist/cancelled), `queue_pos`, `paid`, `attended`
- `team` / `team_assignment` - Generated teams (`team.score` after the match)
- `motm_vote` - Man of the Match votes (private; tallies via `match_summary(m)`)
- `rating_snapshot` - Historical ratings per match
- `audit_log` - Admin action trail

**RLS (Row Level Security)**: All tables have RLS policies (supabase/rls-policies.sql)

### Push Notifications
- Setup: `lib/notifications.ts` - registers device token to `profile.push_token`
- Expo Push Notifications, sent server-side by Edge Functions through `supabase/functions/_shared/common.ts` (`notify()` respects each player's `notify_*` switch and `locale`)
- Notification handler and tap routing in `app/_layout.tsx`
- Sent for: waitlist promotion (`cancel-signup`), teams picked (`lock-and-generate`), new match (`create-match`), chat (`notify-chat`)
- Edge Functions share `_shared/common.ts`; deploy each function together with that file

### Deep Linking
- Scheme: `footy://` (configured in app.json)
- Magic link callback: `app/(auth)/callback.tsx`
- Production: Requires Universal Links (iOS) + App Links (Android)
- Test with: `npx uri-scheme open footy://match/123 --ios`

### Platform-Specific Code
- Polyfills required for React Native URL API (imported in `lib/polyfills.ts`)
- Babel plugin for `import.meta` support: `babel-import-meta-plugin.js`
- react-native-reanimated plugin MUST be last in babel.config.js

## Key Workflows

### Authentication Flow
1. User enters email → Supabase sends magic link
2. User clicks link → opens `footy://auth/callback?...`
3. `app/(auth)/callback.tsx` exchanges token with Supabase
4. Session stored in AsyncStorage (automatic via Supabase client)
5. Redirect to `/(tabs)/matches`

### Match Signup Flow
1. User taps "Join Match" button
2. Calls `supabase/functions/join-match` (server-side validation)
3. Function checks capacity atomically
4. Returns `{ confirmed: true }` or `{ waitlist: true, queuePos: N }`
5. Push notification sent
6. UI updates via react-query cache invalidation

### Cancellation → Auto-Promotion Flow
1. User cancels signup → calls `supabase/functions/cancel-signup`
2. If waitlist exists, next waitlisted user is automatically promoted to confirmed
3. Push notification sent to promoted user: "You're In!"
4. UI updates via react-query cache invalidation

## Common Patterns

### Querying Supabase with react-query
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['matches'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('match')
      .select('*')
      .order('kick_off');
    if (error) throw error;
    return data;
  },
});
```

### Calling Edge Functions
```typescript
const { data, error } = await supabase.functions.invoke('join-match', {
  body: { matchId },
});
```

### Auth-Protected Screens
Check session in `app/_layout.tsx` and redirect appropriately. Session is available via `useAuthStore()`.

### TypeScript Types
All database types are defined in `lib/types.ts`. Keep in sync with database schema.

## Environment Variables

Required in `.env`:
```bash
EXPO_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_APP_SCHEME=footy
EXPO_PUBLIC_TIMEZONE=Europe/Bucharest
```

Service role key (for Edge Functions only):
```bash
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # DO NOT expose to client!
```

## Deployment

- **Mobile Apps**: Use EAS Build (see docs/DEPLOYMENT.md)
- **Edge Functions**: Deploy via `supabase functions deploy <function-name>`
- **Database**: Apply SQL files in Supabase SQL Editor
- **Push Notifications**: Expo manages certificates automatically

## Critical Notes

1. **Import Order**: Polyfills (`lib/polyfills.ts`) MUST be imported first in `app/_layout.tsx`
2. **Babel Plugin Order**: `react-native-reanimated/plugin` MUST be last in babel.config.js
3. **Atomic Operations**: All signup/cancel operations MUST be atomic (use Edge Functions)
4. **Capacity Calculation**: Simply `spots - confirmed_count`
5. **Push Tokens**: Register token on login, update in `profile.push_token`
6. **RLS Policies**: Test all queries with actual user sessions, not service role
7. **Session Validation**: Use `isVerifiedSession()` from `lib/auth-utils.ts`, not just truthy check
8. **Edge Function Logs**: Check Supabase Dashboard → Edge Functions → Logs for debugging

## Documentation

See `docs/` for detailed guides:
- `README.md` - Complete setup and feature documentation
- `DEPLOYMENT.md` - Production deployment steps
- `MIGRATION_SUMMARY.md` - Database migration notes
