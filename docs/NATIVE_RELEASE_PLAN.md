# Native release plan: App Store and Google Play

Status as of 5 November 2026. Branch `claude/native-release-prep`.
Step-by-step instructions: [DEPLOYMENT.md](DEPLOYMENT.md#native-deployment-eas). Current state: [RELEASE_STATUS.md](RELEASE_STATUS.md#native-release-status--5-november-2026).

## Context

The web app is live behind Vercel protection. The goal is to ship the same Expo
app to iOS and Android, find what blocks that, and update packages for security.

Verdict before this work: **not ready**. The blockers found:

| # | Blocker | Status |
| --- | --- | --- |
| 1 | `extra.eas.projectId` was a placeholder, so store builds could not get push tokens | Placeholder removed; `lib/notifications.ts` passes the ID and reports when it is missing. **Owner:** run `eas init` |
| 2 | Android push needs Firebase (FCM V1); the old guide said it was automatic | `app.config.js` reads `google-services.json`; guide corrected. **Owner:** Firebase project + FCM key |
| 3 | Universal Links / App Links pointed at `footballfriends.app`, with no verification files anywhere | Moved to `football-friends-seven.vercel.app`; `.well-known` files added, served as JSON, checked by the web build. **Owner:** Team ID + SHA-256, turn off Vercel protection |
| 4 | Google sign-in on iOS without Sign in with Apple (guideline 4.8) | Native Apple sign-in on iOS |
| 5 | Generic photo-permission text (guideline 5.1.1); no Android notification icon | Purpose-specific text; camera, microphone and overlay permissions removed; white notification icon |
| 6 | No build-number strategy; placeholder submit config | Remote auto-incremented build numbers, EAS environments, placeholders removed |
| 7 | 25 npm vulnerabilities (4 high) only fixed in newer Expo SDKs | Expo SDK 58; `npm audit`: 0 |
| 8 | Backend launch items open (SMTP, backup, protection) | **Owner**, unchanged (RELEASE_STATUS web section) |

Decisions taken with the owner: upgrade to SDK 58 one SDK at a time; use the
Vercel domain for links; add native Sign in with Apple.

## What changed

### Expo SDK 54 → 58

One commit per SDK, each checked with type-check, lint, database and function
tests and the web build. `npx expo install --fix` aligned the packages. The
`expo-modules-core` nesting bug was fixed by regenerating the lockfile.

Code changes the new versions needed:

- **SDK 56:** `Tabs` and `BottomTabBarProps` now come from `expo-router/js-tabs`
  (expo-router ships its own React Navigation). Reanimated's `AnimatedStyle`
  type is used for the modal render prop. `StyleSheet.absoluteFillObject` was
  removed. eslint-config-expo added React Compiler rules (`react-hooks/purity`,
  `react-hooks/set-state-in-effect`); these are kept as warnings because the app
  doesn't use the compiler. The flagged effects are left for a separate refactor.
- **SDK 58:**
  - The tab bar uses `emitter` / `navigateToTab`.
  - `TextInputInstance` refs.
  - `StatusBar.backgroundColor` was removed (Android is always edge-to-edge).
  - `RefreshControl.onRefresh` returns void.
  - `AndroidImportance` is imported by name.
- **supabase-js 2.81 → 2.119:** custom locks are now called with
  `lockAcquireTimeout`, and the library's `navigatorLock` steals the lock on
  timeout. `lib/supabase.ts` now uses `navigator.locks` directly, so a busy
  session in another tab is still cancelled and retried, not raced.
- **Web code splitting** (new in expo-router): route chunks now load as screens
  open. The service worker deleted chunks cached after the page's first cache
  message, and missed chunks that loaded before it controlled the page, so the
  offline shell could fail. Eviction now only replaces the shell bundles every
  page reports, and `lib/pwa.ts` reports each bundle file as it loads. The
  offline test passed 100 of 100 runs on 8 parallel workers.
- **Security overrides:** scoped npm overrides move glob and minimatch inside
  Expo CLI, `@expo/fingerprint` and typescript-estree past GHSA advisories.
  These are build and lint tools only.

### Native configuration

- `app.json`:
  - Apple sign-in entitlement.
  - Associated domains: `applinks` and `webcredentials`.
  - `usesNonExemptEncryption: false`.
  - Image-picker, notifications and Apple-authentication plugins.
  - Blocked `SYSTEM_ALERT_WINDOW`.
  - `expo-system-ui`, so Android honours the dark theme.
- `app.config.js`: `google-services.json` from EAS or the project root (git-ignored).
- `eas.json`: `appVersionSource: remote`, `autoIncrement`, `environment` per
  profile, and an Android submit to the internal track as a draft.
- `lib/oauth.ts` + `components/AuthShell.tsx`: `signInWithAppleNative()`.
  - It uses a SHA-256 nonce and `supabase.auth.signInWithIdToken`.
  - It shows Apple's official button only when `isAvailableAsync()` is true (iOS).
  - It stores Apple's one-time name in the user metadata.
  - `app/onboarding.tsx` suggests that name.

## Verification

| Check | Result |
| --- | --- |
| `npm run type-check` | passes |
| `npm run lint` | 0 errors (116 warnings, up from 103 because of the new React Compiler rules) |
| `npm run test:db` | 172 checks pass |
| `npm run test:functions` | passes |
| `npm run build:web` | passes and checks the `.well-known` files (warns about the placeholders) |
| Playwright (Desktop and Mobile Chrome, using the container's Chromium) | all pass; Mobile Safari (WebKit) not installed here, CI runs it |
| `npm audit` | 0 vulnerabilities |
| `expo prebuild` (scratch copy, not committed) | Info.plist, entitlements, AndroidManifest and notification icon resources contain the expected values |

**Not verified here:** native compilation and behaviour on devices. Those are
covered by the preview builds in DEPLOYMENT.md, Step 6.
