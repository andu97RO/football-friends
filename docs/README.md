# ⚽ FootyFriends - Native Mobile App

A React Native mobile application for organizing weekly 6-a-side football matches with FCFS (First Come First Served) signups, automated team balancing, and mobile push notifications.

## 📋 Overview

FootyFriends helps organize private weekly football matches with:

- **18 player spots** with FCFS signup system
- **Waitlist management** with automatic promotion
- **Team generation** - 3 balanced teams of 6 players each
- **Team lock at T-60 minutes** before kickoff
- **Player ratings** (1-5 scale) for fair team balancing
- **Mobile push notifications** via OneSignal
- **Magic link authentication** (no passwords)
- **Real-time countdown timers**

## 🏗️ Tech Stack

- **Framework**: Expo React Native (TypeScript)
- **Navigation**: expo-router (file-based routing)
- **Backend**: Supabase (Postgres + Edge Functions)
- **Authentication**: Supabase Auth with email magic links
- **State Management**: @tanstack/react-query + Zustand
- **Push Notifications**: Expo Push Notifications
- **Build & Deploy**: EAS Build

## 📱 Features

### Must Have (MVP)
- ✅ Email magic link authentication with deep linking
- ✅ Match creation and management
- ✅ FCFS signup system with server-side validation
- ✅ Waitlist with auto-promotion on cancellation
- ✅ Team lock and generation at T-60 minutes
- ✅ Player profiles with 1-5 rating system
- ✅ Mobile push notifications for key events
- ✅ Match countdown timers
- ✅ Audit logging for admin actions

### Should Have (Post-MVP)
- Configurable spots and team counts
- No-show tracking
- Post-match player voting
- Bilingual support (EN/RO)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- Expo account (sign up at https://expo.dev)
- Supabase account and project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd football-friends
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your credentials:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   EXPO_PUBLIC_APP_SCHEME=footy
   EXPO_PUBLIC_TIMEZONE=Europe/Bucharest
   EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id (optional)
   ```

4. **Set up Supabase**

   a. Create a new Supabase project at https://supabase.com

   b. Run the schema migration:
   ```bash
   # In Supabase SQL Editor, run:
   supabase/schema.sql
   ```

   c. Apply RLS policies:
   ```bash
   # In Supabase SQL Editor, run:
   supabase/rls-policies.sql
   ```

   d. Deploy Edge Functions:
   ```bash
   # Install Supabase CLI
   npm install -g supabase

   # Link to your project
   supabase link --project-ref your-project-ref

   # Deploy functions
   supabase functions deploy join-match
   supabase functions deploy cancel-signup
   supabase functions deploy lock-and-generate
   ```

   d. Add push_token column to profile table:
   ```bash
   # In Supabase SQL Editor, run:
   supabase/add_push_token.sql
   ```

5. **Configure deep linking**

   For production, you'll need to:
   - Set up Universal Links for iOS (apple-app-site-association)
   - Set up Android App Links (assetlinks.json)
   - Configure your domain in `app.json`

### Running the App

**Start development server:**
```bash
npm start
```

**Run on iOS simulator:**
```bash
npm run ios
```

**Run on Android emulator:**
```bash
npm run android
```

**Run on web (limited functionality):**
```bash
npm run web
```

## 📂 Project Structure

```
football-friends/
├── app/                      # Expo Router screens
│   ├── (auth)/              # Authentication screens
│   │   ├── login.tsx        # Magic link login
│   │   └── callback.tsx     # Deep link callback handler
│   ├── (tabs)/              # Main app tabs
│   │   ├── matches.tsx      # Matches list with countdowns
│   │   ├── profile.tsx      # User profile
│   │   └── admin.tsx        # Admin match creation
│   ├── match/[id].tsx       # Match detail with Join/Cancel
│   ├── teams/[id].tsx       # Teams view (post-lock)
│   ├── _layout.tsx          # Root layout with providers
│   └── index.tsx            # Entry point / auth check
├── lib/                      # Shared utilities
│   ├── supabase.ts          # Supabase client setup
│   ├── auth-store.ts        # Auth state management (Zustand)
│   ├── types.ts             # TypeScript type definitions
│   └── utils.ts             # Helper functions
├── supabase/                 # Backend configuration
│   ├── schema.sql           # Database schema
│   ├── rls-policies.sql     # Row Level Security policies
│   └── functions/           # Edge Functions
│       ├── join-match/      # FCFS signup logic
│       ├── cancel-signup/   # Cancellation with auto-promotion
│       └── lock-and-generate/  # Team generation algorithm
├── assets/                   # Icons, images, splash screens
├── app.json                  # Expo configuration
├── eas.json                  # EAS Build configuration
├── package.json              # Dependencies
└── tsconfig.json             # TypeScript configuration
```

## 🔐 Authentication Flow

1. User enters email address
2. Supabase sends magic link email
3. User clicks link → opens app via deep link (`footy://auth/callback`)
4. App exchanges token with Supabase
5. Session stored in AsyncStorage
6. User redirected to Matches screen

## 🎮 Key Workflows

### Match Signup (FCFS)

1. Organizer creates match with `signup_open_at` time
2. At open time, users can join
3. First 18 users → **confirmed**
4. Users 19+ → **waitlist** with queue position
5. On cancellation → first waitlisted user auto-promoted
6. Push notification sent to promoted user

### Team Generation

1. At **T-60 minutes**, organizer locks match
2. System fetches confirmed signups with ratings
3. **Serpentine draft algorithm**:
   - Sort players by rating (descending)
   - Draft in snake order: A→B→C→C→B→A→A→B→C...
4. **Local swaps** to minimize rating variance
5. Teams persisted to database
6. Rating snapshots saved for history
7. Push notifications sent with team assignments

## 📊 Database Schema

Key tables:
- **profile** - User profiles with display name and base rating
- **club** - Club info with organizer reference
- **match** - Match details (timing, capacity, status)
- **signup** - Player signups with state (confirmed/waitlist/cancelled)
- **team** - Generated teams for each match
- **team_assignment** - Player-to-team mappings
- **rating_snapshot** - Historical ratings per match
- **audit_log** - Action audit trail

See `supabase/schema.sql` for full schema.

## 🔔 Push Notifications

Events that trigger notifications:
- **T-10 minutes** before signup opens
- **Signup opens**
- **Successfully joined** (confirmed or waitlist)
- **Promoted from waitlist**
- **T-24 hours** before match
- **T-1 hour** before match
- **Teams published** after lock

## 🏗️ Building for Production

### EAS Build Setup

1. **Install EAS CLI**
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo**
   ```bash
   eas login
   ```

3. **Configure EAS**
   ```bash
   eas build:configure
   ```

4. **Build for iOS**
   ```bash
   eas build --platform ios --profile production
   ```

5. **Build for Android**
   ```bash
   eas build --platform android --profile production
   ```

### App Store Requirements

**iOS:**
- Apple Developer Account ($99/year)
- App Store Connect setup
- Privacy policy URL
- App icons and screenshots
- APNs certificate for push notifications

**Android:**
- Google Play Developer Account ($25 one-time)
- Play Console setup
- Privacy policy URL
- App icons and screenshots
- FCM configuration for push notifications

## 🧪 Testing

### Local Testing
```bash
# Type checking
npm run type-check

# Linting
npm run lint
```

### Testing Push Notifications

Expo Push Notifications work in Expo Go for testing!

1. Start the app and log in
2. App will automatically request notification permissions
3. Test with Expo Push Tool: https://expo.dev/notifications
4. Trigger notifications by:
   - Joining a match
   - Getting promoted from waitlist
   - Teams being generated

### Testing FCFS Logic

Create multiple test accounts and simulate concurrent signups at open time to verify:
- Correct confirmed/waitlist assignment
- Queue position accuracy
- Auto-promotion on cancellation

## 📝 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `EXPO_PUBLIC_APP_SCHEME` | Deep link scheme | `footy` |
| `EXPO_PUBLIC_TIMEZONE` | Display timezone | `Europe/Bucharest` |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | EAS project ID (optional) | `abc123...` |

## 🤝 Contributing

This is a private project for a specific group. For questions or issues, contact the repository maintainer.

## 📄 License

Private - All Rights Reserved

## 🆘 Troubleshooting

### Deep Links Not Working
- Verify `scheme` in `app.json` matches `EXPO_PUBLIC_APP_SCHEME`
- For iOS: Check Associated Domains entitlement
- For Android: Check intent filters in `app.json`
- Test with: `npx uri-scheme open footy://match/123 --ios`

### Supabase Connection Issues
- Verify URL and anon key in `.env`
- Check RLS policies are applied
- Ensure Edge Functions are deployed
- Check network connectivity

### Push Notifications Not Received
- Check device permissions are granted
- Verify push token is saved in database
- Test with Expo Push Tool: https://expo.dev/notifications
- Check Edge Function logs in Supabase
- Make sure you're using a physical device (not web)

### Build Failures
- Clear cache: `expo start -c`
- Remove node_modules: `rm -rf node_modules && npm install`
- Check EAS build logs for specific errors
- Verify all required credentials are configured

## 📞 Support

For setup assistance or bug reports, please contact the development team.

---

Built with ⚽ for organizing awesome football matches!
