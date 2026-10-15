# Animation review — 15 October 2026

Applied Emil Kowalski's review-animations → improve-animations → animate-expo workflow to FootyFriends (Expo SDK 54 / Reanimated 4). Baseline: cf2db85. Implementation uses existing dependencies.

## Findings and resolution

| Before | After | Why |
| --- | --- | --- |
| ToastHost keyed each toast by ID and returned null immediately on dismissal (baseline components/ToastHost.tsx:20–26). | Stable surface, retained content and interruptible timing; 180ms enter, 150ms exit (components/ToastHost.tsx:14, lib/motion.ts:47). | Replacing a message keeps the same element; dismissal can finish its fade instead of removing its parent. |
| Sheet used Modal animationType="slide" (baseline components/ui/Sheet.tsx:26). | Static scrim fades independently; only the panel translates by its own height (components/ui/MotionModal.tsx:15, components/ui/Sheet.tsx:34). | The backdrop belongs to the screen, not the moving panel. |
| Sheet/Button transforms had no explicit system reduced-motion variant. | Live AccessibilityInfo subscription; opacity remains while translations/scales are removed (lib/motion.ts:9). | Honors both initial system settings and changes while the app is open. |
| Button press transform changed instantly (baseline components/ui/Button.tsx:99). | Reanimated CSS transitions: scale 0.97, 150ms press, 100ms release; keyboard and reduced-motion scale stays 1 (components/ui/Button.tsx:60). | Subtle, asymmetric feedback; retargets if reversed before completion. |
| AlertHost removed dialog immediately when request became null (baseline components/AlertHost.tsx:33). | Retains contents during exit; centered scale 0.95–1 with fade, 250ms enter / 200ms exit (components/AlertHost.tsx:30, components/ui/MotionModal.tsx:16). | The departure completes; queued dialogs replace contents without replaying the entrance. |
| MemberSheet/SwapSheet returned null for cleared selection; profile/match editor wrappers unmounted immediately when hidden. | Retain content during the 200ms exit and pass real visibility down to Sheet (lib/motion.ts:31 and the four callers). | The shell cannot animate an exit after its parent has already removed it. Forms unmount after closing to reset drafts. |

## Verdict by impact

**Interruptibility & timing:** fixed toast replacement and parent-unmount exits. All authored durations are 100–250ms. Timing uses cubic-bezier(0.23, 1, 0.32, 1). Native navigation defaults remain in place.

**Origin, physicality & cohesion:** sheet moves by its own height; scrim stays stationary. Dialog scale is centered, starting at 0.95. Frequent tabs, typing, feed rows and scrolling receive no added animation. The two additive opportunities selected were button press interpolation and occasional dialog scale/fade.

**Accessibility:** reduced motion removes movement and keeps opacity feedback; keyboard button activation has no scale. Sheet close labels now use translated English/Romanian copy. Existing Modal focus behavior, safe areas, scroll and keyboard avoidance are retained.

**Performance:** authored animation properties are transform and opacity only. Native interpolation uses Reanimated; no per-frame React state updates or additional libraries. Browser Reanimated behavior is separate from native frame pacing.

**Decision: Approve the code and browser behavior.** Physical-device release-build feel checks remain pending; native smoothness has not been verified.

## Validation

- Installed and byte-compared all 12 SKILL.md files in ~/.codex/skills and ~/.claude/skills.
- Node 22.23.3 TypeScript check passed.
- Lint passed; changed files have zero warnings. Full repository lint has 103 existing warnings elsewhere.
- Web export and public-config verifier passed with the same mock Supabase configuration as CI. This is not a production configuration check.
- Browser suite: 120 tests across Chromium desktop, Mobile Chrome and Mobile Safari; repeated after the conditional-form retention changes.
- Direct browser measurements: pointer scale ~0.97, reduced-motion scale 1, keyboard scale 1. Sheet reduced-motion translation exactly 0 while opacity fades.
- Direct lifecycle checks: two successive toast requests reuse the same DOM node; toast fades before removal; member sheet remains mounted during exit and is removed after it.
- No native release build/device frame-time measurements were available. On the slowest supported iPhone/Android: rapidly reopen sheets, reverse presses, check keyboard avoidance, large text and frame pacing. Inspect at slowed playback and recheck with fresh eyes.
