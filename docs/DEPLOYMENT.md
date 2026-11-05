# 🚀 Deployment Guide

This guide covers deploying Football Friends to production, both as a web app on
Vercel and as native apps on the App Store and Google Play.

- [Web deployment (Vercel)](#web-deployment-vercel) — fastest path to users, no store review
- [Native deployment (EAS)](#prerequisites-checklist) — everything from "Prerequisites Checklist" onwards

---

# Web Deployment (Vercel)

The same Expo codebase runs in the browser through `react-native-web`. The web
build is a static single-page app, so there is no server to run and no store
review to wait for.

## Step 1: Build locally (optional sanity check)

```bash
npm run build:web        # runs `expo export -p web`, output in dist/
npx serve dist -s        # -s serves the SPA fallback, mirroring Vercel
```

## Step 2: Connect the repository

1. In the Vercel dashboard, choose **Add New → Project** and import the GitHub repo.
2. Leave the framework preset as **Other**. Vercel has no Expo preset, and
   [`vercel.json`](../vercel.json) already pins `framework: null`, the build
   command, the output directory, the SPA rewrite and the asset cache headers.
3. Deploy. Every push to `main` becomes a production deployment and every other
   branch gets a preview URL.

## Step 3: Environment variables

`EXPO_PUBLIC_*` values are **inlined into the JavaScript bundle at build time**,
not read at runtime, so they must exist in Vercel's project settings before the
build runs. Set them for both **Production** and **Preview** — a preview build
without them fails at startup with `Missing Supabase environment variables`.

| Variable | Example |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://xyz.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` |
| `EXPO_PUBLIC_APP_SCHEME` | `footballfriends` |
| `EXPO_PUBLIC_TIMEZONE` | `Europe/Bucharest` |

Never give `SUPABASE_SERVICE_ROLE_KEY` the `EXPO_PUBLIC_` prefix. Anything with
that prefix ships in plain text to every visitor. The anon key is safe there
because it is protected by RLS.

## Step 4: Supabase auth configuration

Emailed auth links must be allowed to return to the deployed site. In
**Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL**: `https://your-domain.com`
- **Redirect URLs**: add `https://your-domain.com/callback` and, to make preview
  deployments usable, a wildcard such as `https://*.vercel.app/**`

The app derives the redirect from the current origin (see `getAuthCallbackUrl`
in `lib/auth-utils.ts`), so previews authenticate against themselves. Note the
path is `/callback`, not `/auth/callback`: expo-router omits the `(auth)` group
from URLs.

**Native builds only:** the web app and the installed PWA redirect to the https
URLs above and never use a custom scheme. Once you ship an iOS/Android build,
also add `footballfriends://**` (the URL scheme in `app.json`) to the redirect
list, otherwise emailed sign-in links cannot return to the native app.

## Step 5: Post-deploy checks

- [ ] Sign in, then hard-refresh on `/matches` — you should stay signed in
- [ ] Open a match deep link such as `/match/<id>` directly in a new tab
- [ ] Trigger an error (for example "Forgot password?" with an empty email) and
      confirm the dialog appears
- [ ] Join a match in two browsers and confirm the spot counter updates live
- [ ] Confirm the tab shows the favicon and the "Football Friends" title
- [ ] Install it: on Android (Chrome) use the **Install app** button on Matches
      or the browser menu; on iPhone (Safari) use Share → **Add to Home Screen**.
      It should open full screen with the football icon
- [ ] After one visit, switch to airplane mode and reopen the installed app: the
      shell still opens (data needs a connection)

## Installable web app (PWA)

The web build is a progressive web app, so friends can pin it to their phone and
use it like a regular app. The pieces:

- `public/index.html`: the HTML template (manifest link, iOS home screen tags,
  `viewport-fit=cover`). Expo adds `theme-color` from `app.json`
- `public/manifest.webmanifest` and `public/icons/*`: name, colours and icons
- `public/sw.js`: the service worker. Network-first for the app shell with an
  offline fallback, cache-first for hashed files under `/_expo/static` and
  `/assets`. Supabase requests are cross-origin and never touched. Bump
  `VERSION` in it when the (unhashed) icons change
- `lib/pwa.ts`: registers the worker in production builds only and powers the
  install card on the Matches tab (`components/InstallHint.tsx`)
- `vercel.json`: `no-cache` for `/sw.js` so updates roll out, and the manifest
  content type. `npm run build:web` fails if any of these files is missing from
  `dist/`

Limitations to tell players about:

- **iPhone login:** a home-screen app has separate storage from Safari, so a
  magic link opened from Mail signs in Safari, not the pinned app. Sign in
  inside the pinned app with the 6-digit email code or a password
- **No push notifications** in the web app (see below)

## Rating scale

Ratings run from 1 to 10. Migration `20261031120000_rating_scale_10.sql` doubles
every existing rating (0 becomes 1) and tightens the checks. Apply it at the
same time as the web deploy: until both are live, a client on the old scale can
send values the database rejects, or a new client can send values (6-10) an old
database rejects.

## Known web limitations

- **Push notifications do not work on web.** Expo Push is native-only, so web
  users receive no "You're In!" waitlist promotion notification. Either add Web
  Push with VAPID keys or send those notifications by email from an Edge Function.
- **The app shell is about 3.3 MB of JavaScript.** Since Expo SDK 56 each route
  is its own chunk, but the shared code (`__common` + `entry`) still loads up
  front, which is slow on a cold mobile connection.
- **Prerendering (`web.output: "static"`) does not work yet.** The export fails
  with `ReferenceError: window is not defined` because the Supabase client reads
  AsyncStorage during the Node render pass. SPA output is the supported mode.

## Troubleshooting

**An environment variable change does not show up in the deployed app.**
`EXPO_PUBLIC_*` values are baked in by a Babel transform whose output Metro
caches per module, so a stale cache can keep serving the old (or missing)
value even after the variable changes. On Vercel, use **Redeploy without
build cache**. Locally, run `rm -rf /tmp/metro-* node_modules/.cache .expo`
before rebuilding. The symptom is usually
`Missing Supabase environment variables` thrown at startup.

## Running the e2e suite against a deployment

```bash
PLAYWRIGHT_BASE_URL=https://your-preview.vercel.app npm run test:e2e
```

Setting `PLAYWRIGHT_BASE_URL` skips the local dev server and points the suite at
the deployed URL.

---

# Native Deployment (EAS)

The phone apps are built in the cloud with EAS (Expo Application Services). No
Mac or Android Studio is needed. Do the steps **in this order**: some values
from later steps (Team ID, signing fingerprints) go back into files from earlier
ones.

What is already in the repository:

| Piece | Where |
| --- | --- |
| Bundle ID / package `com.footballfriends.app`, URL scheme `footballfriends` | `app.json` |
| Sign in with Apple (native sheet on iOS), photo-permission text, notification icon, no export-compliance prompt | `app.json` plugins, `lib/oauth.ts` |
| `google-services.json` picked up from EAS or the project root | `app.config.js` |
| Build profiles, auto-incremented build numbers, EAS environments | `eas.json` |
| Link verification files for `football-friends-seven.vercel.app` | `public/.well-known/` |
| In-app account deletion, privacy policy, terms | Profile → Delete account, `public/privacy.html`, `public/terms.html` |

## Step 0: Accounts and tools

- [ ] **Apple Developer Program**, $99/year: https://developer.apple.com/programs/enroll/.
      Individual enrolment is quickest. An organisation needs a D-U-N-S number
      and shows the company name on the App Store.
- [ ] **Google Play Console**, $25 once: https://play.google.com/console/signup.
      New *personal* accounts must run a **closed test with at least 12 testers
      for 14 days** before they can publish to production. Start that early.
- [ ] **Expo account** (free): https://expo.dev/signup
- [ ] **Firebase project** (free), for Android push: https://console.firebase.google.com
- [ ] Node 22 and the EAS CLI:
  ```bash
  npm install -g eas-cli
  eas login
  ```

## Step 1: Link the project to EAS

```bash
eas init
```

This creates the project on expo.dev and writes `expo.extra.eas.projectId` into
`app.json`. **Commit that change**: push notifications use the project ID, and
`lib/notifications.ts` logs an error and skips push registration without it.

Then add the public build settings to the EAS environments. They are baked into
the app at build time, like on Vercel:

```bash
for ENV in production preview development; do
  eas env:create --environment $ENV --name EXPO_PUBLIC_SUPABASE_URL      --value https://exqtxouswbcunrgxftzr.supabase.co --visibility plaintext
  eas env:create --environment $ENV --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>                              --visibility sensitive
  eas env:create --environment $ENV --name EXPO_PUBLIC_APP_SCHEME        --value footballfriends                         --visibility plaintext
  eas env:create --environment $ENV --name EXPO_PUBLIC_TIMEZONE          --value Europe/Bucharest                        --visibility plaintext
  eas env:create --environment $ENV --name EXPO_PUBLIC_WEB_URL           --value https://football-friends-seven.vercel.app --visibility plaintext
done
```

Never add `SUPABASE_SERVICE_ROLE_KEY` here. Everything in an app binary can be extracted.

## Step 2: iOS signing and App Store Connect

1. In App Store Connect → **Apps → +**, create the app: name *Football Friends*,
   bundle ID `com.footballfriends.app`, SKU `footballfriends`, primary language
   English. If the bundle ID is taken, choose another and change `ios.bundleIdentifier`
   in `app.json`, the AASA file and the Supabase Apple client ID to match.
2. Let EAS create the certificates and the push key:
   ```bash
   eas credentials -p ios
   # production → set up everything EAS offers: Distribution Certificate,
   # Provisioning Profile and "Push Notifications: Apple Push Key"
   ```
   EAS turns on the Push Notifications, Sign in with Apple and Associated
   Domains capabilities for the bundle ID from `app.json`.
3. Find your **Team ID** (developer.apple.com → Membership details) and replace
   `APPLE_TEAM_ID` (twice) in `public/.well-known/apple-app-site-association`.

## Step 3: Android push (Firebase) and signing

1. In Firebase, **Add app → Android** with package `com.footballfriends.app`
   and download `google-services.json`. Do not commit it; it is git-ignored.
   ```bash
   eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret
   eas env:create --environment preview    --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret
   ```
   `app.config.js` passes it to the build. Keep a copy in the project root for local builds.
2. In Firebase → Project settings → **Service accounts → Generate new private key**.
   Upload that JSON so Expo can send pushes through FCM V1:
   ```bash
   eas credentials -p android
   # production → Google Service Account → "Manage your Google Service Account Key for Push Notifications (FCM V1)" → upload
   ```
3. Run the first Android build (Step 6). It creates the **upload keystore**.
   Then `eas credentials -p android` shows its SHA-256 fingerprint. Put it in
   `public/.well-known/assetlinks.json` in place of `EAS_UPLOAD_KEY_SHA256`.
4. After the first upload to Play (Step 7), copy the **App signing key**
   SHA-256 from Play Console → *Test and release → App integrity* in place of
   `PLAY_APP_SIGNING_SHA256`. Google signs store installs with that key, so
   https links only open the app once it is listed.

## Step 4: Supabase

1. **Authentication → URL Configuration → Redirect URLs**: add `footballfriends://**`,
   so emailed sign-in links and Google sign-in can return to the app.
2. **Authentication → Sign In / Providers → Apple**: enable it and put
   `com.footballfriends.app` in **Client IDs**. The native iOS sheet needs no
   secret key. (A secret key and Services ID are only needed for Apple sign-in
   on the web, which the app does not offer.)
3. **Google provider**: the existing setup is enough (native uses the same
   browser-based flow as the web).
4. The open launch items in [RELEASE_STATUS.md](RELEASE_STATUS.md): custom SMTP,
   leaked-password protection, a full backup.
5. Make sure the Edge Functions are current, deploying each one with `_shared`:
   ```bash
   supabase link --project-ref exqtxouswbcunrgxftzr
   for f in join-match cancel-signup lock-and-generate swap-players create-match notify-chat notify-teams delete-account; do
     supabase functions deploy $f
   done
   ```

## Step 5: Publish the web files the stores check

1. Commit the filled-in `public/.well-known/*` files and deploy to Vercel.
   `npm run build:web` warns while placeholders are left.
2. **Turn off Vercel Deployment Protection for production.** Apple and Google
   download `/.well-known/*` without signing in, and reviewers must open the
   privacy policy. Do this only after the RELEASE_STATUS checklist passes.
3. Check:
   ```bash
   curl -sI https://football-friends-seven.vercel.app/.well-known/apple-app-site-association | grep -i content-type   # application/json
   curl -s  https://football-friends-seven.vercel.app/.well-known/assetlinks.json
   curl -sI https://football-friends-seven.vercel.app/privacy.html | head -1                                          # 200
   ```

## Step 6: Test builds on real phones

```bash
eas build -p ios --profile preview        # register test iPhones first: eas device:create
eas build -p android --profile preview    # installable .apk
```

Install from the links EAS prints and check:

- [ ] Email + password, magic link (open the email on the phone), 6-digit code
- [ ] Continue with Google; **Continue with Apple** on iPhone (first sign-in suggests your name in onboarding)
- [ ] An invite link `https://football-friends-seven.vercel.app/join/CODE` tapped in Messages/WhatsApp opens the app
- [ ] Allow notifications, then from a second account: a waitlist promotion sends "You're In!"; teams being picked and chat send their pushes
- [ ] Join and cancel a match, generate and swap teams, record a result, change avatar, delete a throwaway account

## Step 7: Production builds and store submission

```bash
eas build -p all --profile production    # build numbers increase automatically
```

**iOS**
```bash
eas submit -p ios --latest               # uploads to App Store Connect / TestFlight
```
In App Store Connect: add TestFlight testers if wanted, then fill in the listing
(Step 8) and **Add for Review**.

**Android**
1. Google requires the **first** upload by hand: Play Console → *Test and release →
   Testing → Internal testing → Create release* → upload the `.aab` from the EAS build page.
2. Later releases: `eas submit -p android --latest`. That needs a Google Play
   service account key (`eas credentials -p android` → *Google Service Account
   for Play Store submissions*). It goes to the internal track as a draft (`eas.json`).
3. Promote internal → closed testing (12 testers, 14 days for new personal
   accounts) → production.

## Step 8: Store listings

Both stores:
- Name *Football Friends*, short description *Organise your weekly 6-a-side football*, full description in English and Romanian
- Privacy policy: `https://football-friends-seven.vercel.app/privacy.html`
- Support contact: an email address you read
- **A demo account for reviewers** (email + password) that belongs to a group
  with an upcoming match. Reviewers can't receive magic links or join a group without one.

App Store (App Store Connect):
- Screenshots: iPhone 6.9" (1320×2868) and, because `supportsTablet` is on, iPad 13" (2064×2752)
- App Privacy: Contact info (email, name); User content (photos, messages,
  other: ratings/sign-ups); Identifiers (user ID, device ID: the push token).
  All linked to the user, none used for tracking
- Age rating questionnaire (it has user chat), category Sports

Google Play (Play Console):
- Screenshots (phone), a 512×512 icon (`assets/icon.png` scaled down), a 1024×500 feature graphic
- **Data safety**: same data as above, encrypted in transit, users can request deletion
- **Account deletion URL**: `https://football-friends-seven.vercel.app/privacy.html` (section 7)
- Content rating questionnaire, target audience 13+, no ads

## After launch

- Edge Function logs: Supabase Dashboard → Edge Functions → Logs; push receipts: https://expo.dev/notifications
- Each update: `eas build -p all --profile production`, then `eas submit`
- Update the Expo SDK roughly every 6 months. Store builds require recent Xcode
  and Android target SDK versions (SDK 58 targets Android 36).

## Troubleshooting

- **No push token / "need an EAS project ID"**: run `eas init`, commit `app.json`, rebuild.
- **Android push never arrives**: the FCM V1 key is missing (Step 3.2) or the build
  had no `google-services.json` (Step 3.1). Check that `GOOGLE_SERVICES_JSON` exists in that EAS environment.
- **https links open the browser**: the `.well-known` files still have
  placeholders, are behind Vercel protection, or (Android) are missing the Play
  signing fingerprint. Apple caches the file; reinstall the app after fixing it.
- **Sign in with Apple says the provider is not enabled**: Step 4.2.
- **Emailed link opens the app but does not sign in**: `footballfriends://**` is missing from Supabase redirect URLs.
- **Signing errors**: `eas credentials`, remove the broken item and let EAS recreate it.

## Rollback

Store releases cannot be pulled back to an older binary. Fix forward with a new
build (Apple offers expedited review). Edge Functions and the web app roll back
independently (see the web section and `supabase functions deploy`).
