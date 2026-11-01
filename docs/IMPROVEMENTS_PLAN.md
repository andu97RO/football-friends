# Plan: rename to Football Friends, PWA install, 1–10 ratings, full names in WhatsApp shares

## Context
Three improvements so friends can use FootyFriends more easily:
1. **PWA**: the web build is already deployed on Vercel (`vercel.json`, `npm run build:web`, `web` block in `app.json`). There's no manifest, service worker or home-screen icon yet, so "Add to Home Screen" gives a plain browser bookmark instead of an app-like launcher. The icons in `assets/` are 67-byte placeholders.
2. **Ratings 0–5 → 1–10**: most players pick 3, so teams don't balance well. Existing values convert ×2 (0→1, 1→2, 2→4, 3→6, 4→8, 5→10). Admins can fine-tune afterwards.
3. **WhatsApp shares** use `firstName()` (`lib/utils.ts:71`). Both the teams share and the squad share switch to full names.

4. **Rename**: the app is **Football Friends**. Remove every "FootyFriends" / "Footy" / `footy` from code, text and identifiers.

Ship all four in one branch/PR. Order: 4 (rename) → 3 → 2 → 1, so the new PWA files use the new name from the start.

---

## 0. Rename FootyFriends → Football Friends (everywhere)
At the end, `grep -rniI footy --exclude-dir=node_modules --exclude-dir=.git --exclude=package-lock.json --exclude=IMPROVEMENTS_PLAN.md .` must return nothing.

**Text people read**:
- `app.json` `web.shortName` "Footy" → "Football Friends"
- `supabase/templates/magic_link.html` and `confirmation.html` headings. These also have to be pasted into Supabase Dashboard → Auth → Email Templates
- `constants/theme.ts` comment, `supabase/schema.sql` + `rls-policies.sql` headers
- `CLAUDE.md`, `AGENTS.md`, all of `docs/*.md`, `plans/REVIEW.md`

**Technical identifiers**:
- Scheme `footy` → `footballfriends`: `app.json` (`scheme` + Android intent filter), `.env.example`, docs. Vercel/local `.env` `EXPO_PUBLIC_APP_SCHEME` must change too
- Bundle/package `com.footyfriends.app` → `com.footballfriends.app` (iOS + Android). No store builds exist yet (`eas.json` projectId is a placeholder), so nothing breaks for users
- `slug` `footyfriends` → `footballfriends`
- Domain `footyfriends.app` → `footballfriends.app` in `app.json` associatedDomains/intent filter, the `app/join/[code].tsx` comment and `e2e/matches-list.spec.ts:40`. **This is a placeholder until you tell me the real domain.** Web links already use `window.location.origin`, so the Vercel site keeps working whatever the domain is
- Storage keys `footy.pendingInvite` (`lib/invite.ts:4`) and `footy.locale` (`lib/i18n.ts:13`) → `footballfriends.*`. No fallback to the old keys, because reading them would put the old name back into the code. Each existing user's saved language resets to the device default once
- `scripts/seed-users.ts` test emails `@footytest.com` → `@footballfriends.test`
- **Supabase Auth → URL Configuration**: add `footballfriends://**` to the redirect allow-list (keep `footy://**` until the old native builds are gone). Edge Functions don't reference the name, so they need no change

---

## 1. Full names in WhatsApp shares (small)
- `app/teams/[id].tsx:145`: `firstName(p.name)` → `p.name`
- `app/match/[id]/index.tsx:171`: `firstName(p.display_name)` → `p.display_name`
- Leave `firstName` in place where it's still used, e.g. the swap sheet title at `app/teams/[id].tsx:238`. Drop the unused imports.

## 2. Rating scale 1–10

### Database: new migration `supabase/migrations/20261031xxxxxx_rating_scale_10.sql`
Order matters (drop the checks → convert → add new checks):
- Drop `group_membership_rating_check`, `profile_rating_base_check`, `rating_snapshot_rating_display_check`
- `update ... set x = greatest(1, x * 2)` on `group_membership.rating`, `profile.rating_base`, `rating_snapshot.rating_display`
- Add `check (... between 1 and 10)` on all three. Change the `default 3` → `default 6` on `group_membership.rating` and `profile.rating_base`
- `create or replace` the functions that hard-code 0–5. Copy each one from its **latest** definition:
  - `group_action` 'rating' branch (latest in `20261022074000_fix_group_update_description.sql:66`): accept `value ~ '^([1-9]|10)$'`
  - `complete_onboarding` (`20260930141927_redesign.sql:476`): `rating not between 1 and 10`
  - New-user trigger and backfill (`redesign.sql:488-500`): regex `^([1-9]|10)$`, fallback `6`
- Team generation (`private.generate_teams` serpentine) and `team_summary` averages don't depend on the scale, so they stay as they are
- Update `supabase/schema.sql` checks/defaults to match (it's reference documentation)

### App
- `components/ui/RatingPicker.tsx`: `RATING_STEPS = [1..10]`. Lay it out as **two rows of 5** so the buttons stay ≥44pt wide on phones. Update the doc comment. `ratingLabel` → `` `${value}/10` ``
- `lib/locales/en.ts` + `ro.ts`: replace `rating.step0..5` with `rating.step1..10` (10 short descriptions, from "New to football" to "Could play competitively"). Update `rating.model` / `rating.modelShort` text ("1 to 10", "1–10")
- `app/teams/[id].tsx`: the per-player and average displays need no logic change. Check that the 1-decimal averages still look right
- **Everywhere a rating is chosen or shown gets 1–10.** I checked every place. Picking goes through `RatingPicker` and display goes through `ratingLabel`, so these all change together:
  - Choosing: **sign-up** (`app/(auth)/sign-up.tsx`), **onboarding** after magic link/Google/Apple (`app/onboarding.tsx`), **admin rating editor** in Manage group (`app/group/[id].tsx` member sheet)
  - Showing: **profile** card (`app/(tabs)/profile.tsx`), **groups list** "Your rating" (`app/(tabs)/groups.tsx`), **join requests** "Self-rated x/10" and the **members list** (`app/group/[id].tsx`), **teams screen** per-player numbers and team averages (`app/teams/[id].tsx`)
  - Server side: sign-up metadata trigger, `complete_onboarding`, `group_action('rating')`, DB checks (see above). Team generation and balancing work on any scale
- `scripts/seed-users.ts:74`: random rating `1–10`
- `docs/ADMIN_FEATURES.md` (old "1-5 stars" text): update to 1–10

### Tests
- `e2e/fixtures.ts`: double the seeded ratings (and `self_rating: 3` → `6`, default `3` → `6`)
- `e2e/auth.spec.ts`, `e2e/groups.spec.ts`, `e2e/profile.spec.ts`: update the `rating-N` test IDs and expected strings (`3/5` → `6/10`, `4/5` → `8/10`, etc.)
- `tests/database.mjs:31`: `initial_rating: i` → `i + 1` (0 is no longer valid). Add assertions that the old→new conversion and the `group_action` bounds work

## 3. Progressive Web App

### Files
- **HTML template**: `npx expo customize public/index.html` (the Expo `output: "single"` template). Add:
  - `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color" content="#0A0E0B">`
  - iOS: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title=Football Friends`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`
  - `viewport-fit=cover` so the safe-area insets work in standalone mode
- **`public/manifest.webmanifest`**: name/short_name/description/colours from the `app.json` `web` block, `display: "standalone"`, `orientation: "portrait"`, `start_url: "/"`, `scope: "/"`, icons 192, 512 and 512 maskable
- **Icons**: generate a simple mark (dark `#0A0E0B` pitch background, lime accent ball/"FF" from `constants/theme.ts`) as SVG → PNGs in `public/icons/` (192, 512, maskable-512 with safe padding, apple-touch-icon 180) and a real `assets/favicon.png`. Also replace `assets/icon.png` / `adaptive-icon.png` so native builds get the same icon
- **`public/sw.js`**: a small service worker. Network-first for navigations with an offline fallback to the cached `/index.html`. Cache-first for `/_expo/static/*` (hashed, immutable) and `/icons/*`. **Never** cache Supabase requests (other origin). Versioned cache name; clean up old caches on `activate`
- **Registration**: new `lib/pwa.ts` with `registerServiceWorker()`. It's a no-op unless `Platform.OS === 'web' && 'serviceWorker' in navigator`. Call it from `app/_layout.tsx`. The CSP `script-src 'self'` blocks inline scripts, so registration has to live in the bundle, not in index.html

### Install hint (so friends actually find it)
- A small dismissible card on the Matches tab, shown only on web when the app is not running standalone (`matchMedia('(display-mode: standalone)')` / `navigator.standalone`):
  - Android/Chrome: catch `beforeinstallprompt` and show an "Install app" button
  - iOS Safari: there's no install API, so show the text "Tap Share → Add to Home Screen"
  - Remember the dismissal in AsyncStorage
- New i18n keys in `en.ts` + `ro.ts`

### Vercel config (`vercel.json`)
- `/sw.js`: `Cache-Control: no-cache` + `Service-Worker-Allowed: /`
- `/manifest.webmanifest`: `Content-Type: application/manifest+json`
- The SPA rewrite `/:path*` → `/index.html` must not swallow `/sw.js`, `/manifest.webmanifest` or `/icons/*`. Vercel serves static files before rewrites, so check this on the preview deploy
- The CSP already allows `'self'` for workers and manifest (falls back to `default-src`). Nothing to change there
- `scripts/verify-web-config.mjs`: also check that `dist/manifest.webmanifest`, `dist/sw.js` and the icons exist after export

### Known limitations (tell friends)
- **iOS login**: a home-screen app on iOS has separate storage from Safari, so tapping a magic link in Mail logs you in Safari, not the pinned app. Friends should log in **inside** the pinned app with password or the 6-digit email code (already supported in `app/(auth)/check-inbox.tsx`). Make the check-inbox copy point to the code when running standalone
- **Push notifications** use Expo push, which only works in the native app. The PWA won't get "You're in!" pushes. Web Push would be a separate project

---

## Verification
- `npm run type-check`, `npm run lint`, `npm run test:db` (migration applied to the local test DB, conversion + bounds), `npm run test:e2e`
- `npm run build:web`, then serve `dist/`: Chrome DevTools → Application shows a valid manifest, the SW is active, the app is installable, and Lighthouse PWA checks pass. Reload while offline and the app shell still loads
- On the Vercel preview: install on an Android phone (Chrome prompt) and an iPhone (Share → Add to Home Screen). It should open full-screen with the icon and a dark status bar, and logging in with the email code inside the pinned app should work
- Ratings: sign up and see 10 options in two rows. In Manage group, set a member to 7 and undo. The profile shows `x/10`. Lock a match and check the team averages look sensible
- Rename: the `footy` grep returns nothing. The installed PWA is labelled "Football Friends". Existing users' saved language resets once after the storage-key rename (accepted). Magic-link/OAuth callback still works on web
- Share: on the teams screen and the match "Share squad", the WhatsApp text shows full names
- Deploy order: apply the migration with Supabase (MCP `apply_migration` or SQL editor) **at the same time** as the web deploy, so old clients don't send 0–5 values that the DB now rejects. No Edge Functions change
