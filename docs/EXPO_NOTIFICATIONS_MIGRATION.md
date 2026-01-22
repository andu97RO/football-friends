# Migration Guide: OneSignal to Expo Push Notifications

This project has been migrated from OneSignal to Expo Push Notifications.

## What Changed

### 1. **Removed OneSignal**
- ❌ Removed `react-native-onesignal` package
- ❌ Removed `onesignal-expo-plugin` package
- ❌ Removed OneSignal configuration from `app.json`
- ❌ Removed OneSignal initialization code from `app/_layout.tsx`

### 2. **Added Expo Push Notifications**
- ✅ Added `expo-notifications` package
- ✅ Created `lib/notifications.ts` with notification utilities
- ✅ Updated `app/_layout.tsx` to initialize Expo notifications
- ✅ Added `push_token` column to `profile` table
- ✅ Updated all Edge Functions to send notifications via Expo Push API

## Setup Instructions

### 1. Install the new package

```bash
npm install expo-notifications@~0.30.5
```

### 2. Run the database migration

In your Supabase SQL Editor, run:

```sql
-- Add push_token column to profile table
ALTER TABLE public.profile 
ADD COLUMN IF NOT EXISTS push_token text;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profile_push_token ON public.profile(push_token);
```

Or run the provided migration file:

```bash
# In Supabase SQL Editor, execute:
supabase/add_push_token.sql
```

### 3. Update your environment variables

**No environment variables needed for Expo Push Notifications in development!**

For production (optional):
```bash
EXPO_PUBLIC_EAS_PROJECT_ID=your-eas-project-id
```

This is automatically provided by EAS when you build, so you don't need to set it manually.

### 4. Redeploy Edge Functions

The Edge Functions have been updated to use Expo Push Notifications. Redeploy them:

```bash
supabase functions deploy join-match
supabase functions deploy cancel-signup
supabase functions deploy lock-and-generate
```

### 5. Clean reinstall (recommended)

```bash
rm -rf node_modules package-lock.json
npm install
```

## Testing Push Notifications

### 1. **Testing in Expo Go** (Development)

Expo Push Notifications work in Expo Go on **physical devices only**!

**Requirements:**
- ✅ Physical iPhone or Android device (not simulator/emulator)
- ✅ Expo Go app installed
- ✅ Same network as your development machine

```bash
npm start
# Scan QR code with Expo Go app on your physical device
```

When you log in, the app will automatically:
- Request notification permissions
- Register for push token
- Save token to database

**Note:** Simulators/emulators will show "Push notifications require a physical device" - this is normal!

### 2. **Test notification manually**

You can test sending a notification using the Expo Push Tool:

1. Get a test token from your database:
```sql
SELECT push_token FROM profile WHERE user_id = 'your-user-id';
```

2. Visit: https://expo.dev/notifications

3. Paste the token and send a test notification

### 3. **Test in your app**

- Join a match → Should receive "You're in!" or "You're on the waitlist"
- Get promoted from waitlist → Should receive "You're confirmed!"
- Teams get locked → Should receive "Teams are ready!"

## Notification Events

The following events now trigger Expo Push Notifications:

| Event | Title | Body | Data |
|-------|-------|------|------|
| Join Match (Confirmed) | ✅ You're in! | You're confirmed for the match! | `{ matchId }` |
| Join Match (Waitlist) | 📋 You're on the waitlist | You're #N on the waitlist. | `{ matchId }` |
| Promoted from Waitlist | 🎉 You're confirmed! | A spot opened up. You're now confirmed! | `{ matchId }` |
| Teams Generated | ⚽ Teams are ready! | You're on Team X. See you at the match! | `{ matchId, teamName }` |

## Advantages of Expo Push Notifications

✅ **Works with Expo Go** - Test without building
✅ **Free & Unlimited** - No pricing tiers
✅ **Simpler Setup** - No APNs/FCM configuration needed for development
✅ **Native to Expo** - Better integration with Expo ecosystem
✅ **Cross-platform** - iOS and Android automatically handled

## Production Considerations

For production apps:

1. **Set up your EAS project**: Get your project ID from `eas.json`
2. **Configure credentials**: EAS will handle APNs/FCM for you
3. **Build with EAS**: `eas build --platform all`
4. **Monitor delivery**: Check Expo dashboard for notification stats

## Troubleshooting

### Notifications not received?

1. Check if push token is saved:
```sql
SELECT push_token FROM profile WHERE user_id = 'your-user-id';
```

2. Check app permissions:
```typescript
import * as Notifications from 'expo-notifications';
const { status } = await Notifications.getPermissionsAsync();
console.log('Permission status:', status);
```

3. Check Edge Function logs in Supabase

### Token not saving?

- Make sure you're logged in when the app starts
- Check database migration was applied
- Check console for errors

## Files Modified

- ✏️ `package.json` - Removed OneSignal, added expo-notifications
- ✏️ `app.json` - Removed OneSignal plugin
- ✏️ `app/_layout.tsx` - Updated to use Expo notifications
- ✨ `lib/notifications.ts` - NEW: Notification utility functions
- ✨ `supabase/add_push_token.sql` - NEW: Database migration
- ✏️ `supabase/functions/join-match/index.ts` - Updated to send Expo notifications
- ✏️ `supabase/functions/cancel-signup/index.ts` - Updated to send Expo notifications
- ✏️ `supabase/functions/lock-and-generate/index.ts` - Updated to send Expo notifications

## Need Help?

If you encounter any issues during the migration, check:
1. Expo Notifications docs: https://docs.expo.dev/push-notifications/overview/
2. Your Supabase Edge Function logs
3. Your mobile app console logs

