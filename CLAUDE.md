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
- `app/(auth)/` - Authentication flows (login, callback, sign-up, reset-password)
- `app/(tabs)/` - Main tab navigation (matches, profile, admin)
- `app/match/[id]/` - Match detail screens (index, chat)
- `app/teams/[id].tsx` - Teams view (post-lock)
- `app/_layout.tsx` - Root layout with QueryClientProvider and auth listeners
- `app/index.tsx` - Entry point with auth check

### State Management Pattern
**Global State (Zustand)**:
- `lib/auth-store.ts` - Authentication session state (DO NOT store auth tokens here, Supabase handles persistence via AsyncStorage)

**Server State (@tanstack/react-query)**:
- Use for all Supabase queries (matches, signups, teams, etc.)
- Enables automatic caching, refetching, and optimistic updates
- Example pattern in `app/(tabs)/matches.tsx`

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
- `supabase/functions/lock-and-generate`
- Serpentine draft algorithm + local swaps to minimize rating variance
- Creates `team`, `team_assignment`, and `rating_snapshot` records
- Match status transitions: `scheduled` → `locked` → `completed`

### Database Schema (supabase/schema.sql)
Key tables:
- `profile` - User profiles with `display_name`, `rating_base` (1-5), `avatar_url`, `push_token`, `is_admin`
- `club` - Clubs with `organizer_id`
- `match` - Matches with `status`, `kick_off`, `signup_open_at`, `spots`, `teams_count`
- `signup` - Signups with `state` (confirmed/waitlist/cancelled), `queue_pos`, `hold_expires_at`
- `team` / `team_assignment` - Generated teams
- `rating_snapshot` - Historical ratings per match
- `audit_log` - Admin action trail

**RLS (Row Level Security)**: All tables have RLS policies (supabase/rls-policies.sql)

### Push Notifications
- Setup: `lib/notifications.ts` - registers device token to `profile.push_token`
- Expo Push Notifications (no OneSignal despite .env.example reference)
- Notification handler setup in `app/_layout.tsx`
- Edge Functions send notifications for:
  - Signup confirmations/waitlist
  - Automatic waitlist promotions ("You're In!")
  - Team assignments
  - Match reminders (T-24h, T-1h)

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
