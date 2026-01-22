# 🚀 Deployment Guide

This guide covers deploying the FootyFriends native app to production.

## Prerequisites Checklist

- [ ] Apple Developer Account ($99/year)
- [ ] Google Play Developer Account ($25 one-time)
- [ ] Supabase project configured
- [ ] EAS CLI installed (`npm install -g eas-cli`)
- [ ] Expo account created
- [ ] App icons and splash screens ready (1024x1024)
- [ ] Privacy policy URL published

## Step 1: Configure EAS

1. **Login to Expo**
   ```bash
   eas login
   ```

2. **Initialize EAS**
   ```bash
   eas build:configure
   ```

3. **Update `app.json` with production details**
   - Update `expo.extra.eas.projectId` with your Expo project ID
   - Verify bundle identifiers are correct

## Step 2: iOS Setup

### 2.1 Apple Developer Account

1. Go to https://developer.apple.com
2. Create App ID: `com.footyfriends.app`
3. Enable capabilities:
   - Push Notifications
   - Associated Domains

### 2.2 Push Notifications Setup

Expo handles push notifications automatically through EAS. No manual APNs configuration needed for Expo Push Notifications!

When building with EAS, push notification certificates are managed automatically.

### 2.3 Universal Links (Deep Linking)

1. Create `apple-app-site-association` file on your domain:
   ```json
   {
     "applinks": {
       "apps": [],
       "details": [
         {
           "appID": "TEAM_ID.com.footyfriends.app",
           "paths": ["/auth/*", "/match/*", "/teams/*"]
         }
       ]
     }
   }
   ```

2. Host at `https://yourdomain.com/.well-known/apple-app-site-association`

3. Update `app.json`:
   ```json
   {
     "ios": {
       "associatedDomains": ["applinks:yourdomain.com"]
     }
   }
   ```

### 2.4 Build iOS App

```bash
eas build --platform ios --profile production
```

### 2.5 Submit to App Store

1. **Via EAS Submit (recommended)**
   ```bash
   eas submit --platform ios
   ```

2. **Manual submission**
   - Download IPA from EAS dashboard
   - Upload to App Store Connect via Transporter
   - Configure app listing, screenshots, description
   - Submit for review

## Step 3: Android Setup

### 3.1 Google Play Console

1. Go to https://play.google.com/console
2. Create new app
3. Set package name: `com.footyfriends.app`

### 3.2 Push Notifications Setup

Expo handles push notifications automatically through EAS. No manual FCM configuration needed for Expo Push Notifications!

When building with EAS, Firebase Cloud Messaging is configured automatically.

### 3.3 Android App Links (Deep Linking)

1. Generate SHA-256 fingerprint:
   ```bash
   eas credentials
   # Select Android → Production → Keystore
   # Note the SHA-256 fingerprint
   ```

2. Create `assetlinks.json` on your domain:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.footyfriends.app",
       "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
     }
   }]
   ```

3. Host at `https://yourdomain.com/.well-known/assetlinks.json`

### 3.4 Build Android App

```bash
eas build --platform android --profile production
```

### 3.5 Submit to Google Play

1. **Via EAS Submit (recommended)**
   ```bash
   eas submit --platform android
   ```

2. **Manual submission**
   - Download AAB from EAS dashboard
   - Upload to Play Console
   - Create store listing with screenshots, description
   - Configure content rating
   - Submit for review

## Step 4: Supabase Edge Functions Deployment

1. **Install Supabase CLI**
   ```bash
   npm install -g supabase
   ```

2. **Login**
   ```bash
   supabase login
   ```

3. **Link project**
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. **Deploy functions**
   ```bash
   supabase functions deploy join-match
   supabase functions deploy cancel-signup
   supabase functions deploy lock-and-generate
   ```

5. **Set secrets** (if needed)
   ```bash
   supabase secrets set ONESIGNAL_API_KEY=your-api-key
   ```

## Step 5: Database Migration

1. **Run schema in Supabase SQL Editor**
   ```sql
   -- Copy contents of supabase/schema.sql
   ```

2. **Apply RLS policies**
   ```sql
   -- Copy contents of supabase/rls-policies.sql
   ```

3. **Verify tables created**
   ```bash
   # Check in Supabase Dashboard → Database → Tables
   ```

## Step 6: Environment Variables

Update production environment variables in EAS:

```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value https://your-project.supabase.co
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value your-anon-key
eas secret:create --name EXPO_PUBLIC_EAS_PROJECT_ID --value your-eas-project-id
```

## Step 7: App Store Listings

### iOS App Store

**Required:**
- App name: FootyFriends
- Subtitle: Organize 6-a-side football matches
- Description: (See below)
- Keywords: football, soccer, sports, organize, matches, teams
- Screenshots: 6.7", 6.5", 5.5" (portrait)
- App icon: 1024x1024
- Privacy policy URL
- Support URL

**Privacy Labels:**
- Contact Info: Email
- Location: Not collected
- User Content: Player ratings, match signups
- Identifiers: Used for push notifications

### Google Play Store

**Required:**
- App name: FootyFriends
- Short description: Organize 6-a-side football matches
- Full description: (See below)
- Screenshots: Phone and tablet
- Feature graphic: 1024x500
- App icon: 512x512
- Privacy policy URL
- Content rating questionnaire

**Sample Description:**
```
FootyFriends helps organize weekly 6-a-side football matches for your group.

FEATURES:
• First-come-first-served signup system
• Automatic waitlist management
• Balanced team generation based on player ratings
• Real-time countdown timers
• Push notifications for match updates
• Magic link login (no passwords!)

Perfect for organizing regular football games with friends!
```

## Step 8: Testing Production Build

1. **Install on test devices**
   ```bash
   # iOS TestFlight
   eas build --platform ios --profile preview
   # Add testers in App Store Connect

   # Android Internal Testing
   eas build --platform android --profile preview
   # Upload to Play Console Internal Testing track
   ```

2. **Test checklist**
   - [ ] Magic link login works
   - [ ] Deep links navigate correctly
   - [ ] Push notifications received
   - [ ] Match creation and signup
   - [ ] Waitlist promotion
   - [ ] Team generation
   - [ ] Countdown timers accurate

## Step 9: Post-Launch Monitoring

1. **Set up analytics** (optional)
   - Add Expo Analytics or Firebase Analytics
   - Track key events: signups, cancellations, match views

2. **Monitor Supabase**
   - Check Database → Performance
   - Review Edge Functions logs
   - Set up alerts for errors

3. **Monitor Expo Push Notifications**
   - Check Expo dashboard for delivery stats
   - Review notification logs in Supabase Edge Functions

4. **Crash Reporting**
   - Enable Sentry or similar service
   - Monitor production errors

## Troubleshooting

### Build fails with signing errors
- Verify Apple/Google credentials in EAS
- Clear credentials: `eas credentials` → delete → recreate

### Push notifications not working
- Verify device permissions are granted
- Check push token saved in database
- Test with Expo Push Tool: https://expo.dev/notifications
- Check Edge Function logs in Supabase

### Deep links not working
- Verify domain association files accessible
- Check bundle/package identifiers match
- Test with `npx uri-scheme`

### Supabase RLS blocks queries
- Review RLS policies
- Check user authentication state
- Use service role only in Edge Functions

## Rollback Plan

If issues arise after launch:

1. **Disable problematic features** via feature flags
2. **Roll back Edge Functions**
   ```bash
   supabase functions deploy function-name@previous-version
   ```
3. **Submit hotfix build** to stores (expedited review available)

## Maintenance

- **Weekly**: Check crash reports and fix critical bugs
- **Monthly**: Review analytics and user feedback
- **Quarterly**: Update dependencies and Expo SDK

---

Good luck with your deployment! 🚀⚽
