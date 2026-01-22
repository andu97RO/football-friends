# 🔧 Fixed: Push Notification Errors

## The Errors You Saw

```
ERROR: Error registering for push notifications: 
"projectId": Invalid uuid.
```

## What Was Wrong

The `getExpoPushTokenAsync()` function was trying to use an invalid/missing `projectId`.

## What I Fixed

### 1. Removed `projectId` requirement
**Before:**
```typescript
const tokenData = await Notifications.getExpoPushTokenAsync({
  projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
});
```

**After:**
```typescript
const tokenData = await Notifications.getExpoPushTokenAsync();
```

For Expo Go (development), the projectId is **not needed** - Expo automatically uses your app's configuration from `app.json`.

### 2. Improved error messages
Changed vague errors to be more helpful:
- "Push notifications require a physical device. Skipping registration."
- "Push notifications are not supported on web"
- "Push notification permissions not granted"

### 3. Added platform checks
The code now properly detects:
- ✅ Physical device → Register for push
- ❌ Simulator/emulator → Skip (with clear message)
- ❌ Web → Skip (with clear message)

## How to Test

### ✅ This WILL work:
1. Start dev server: `npm start`
2. Open Expo Go on your **physical iPhone or Android device**
3. Grant notification permissions when prompted
4. Push token will be registered automatically

### ❌ This WON'T work (but that's OK):
- iOS Simulator - Will show: "Push notifications require a physical device"
- Android Emulator - Will show: "Push notifications require a physical device"
- Web browser - Will show: "Push notifications are not supported on web"

## Why Physical Device Only?

Push notifications in Expo Go require:
- Apple Push Notification Service (APNs) for iOS
- Firebase Cloud Messaging (FCM) for Android

Both of these services only work on real devices, not simulators.

## Testing Without a Physical Device?

You have two options:

### Option 1: Skip notifications in development
The app works fine without notifications - you just won't receive them. All other features work in the simulator.

### Option 2: Create a development build
```bash
# This creates a custom app with native modules
eas build --profile development --platform ios
# Install on your simulator
```

But honestly, for testing, just use a physical device with Expo Go - it's much faster!

## No Environment Variables Needed

You **don't** need to set `EXPO_PUBLIC_EAS_PROJECT_ID` for development. It's automatically handled by Expo.

For production builds with EAS, the projectId is injected automatically - you still don't need to set it manually.

---

**TL;DR:** The errors are fixed. Test on a physical device and notifications will work! 📱✅

