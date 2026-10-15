# 001 — Keep toast motion continuous

- **Status**: IMPLEMENTED (browser verified; native feel check pending)
- **Commit**: cf2db85
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: shared motion helper and affected UI components

## Problem

`components/ToastHost.tsx:20` currently contains:

```tsx
if (!toast) return null;
```

## Target

Retain the last toast during a 150ms exit. Keep the same Animated.View across replacement IDs. Animate opacity and translateY only, with withTiming retargeting the current value. Enter 180ms, exit 150ms, Easing.bezier(0.23, 1, 0.32, 1). Translation 8pt to 0. Reduced motion keeps opacity only. Preserve ID-safe dismissal and action callbacks.

## Repo conventions to follow

Use Reanimated 4 already in package.json. Shared visual tokens live in constants/theme.ts (theme.spacing.m = 16); add motion tokens to that theme. Use lib/i18n.ts useT() for any labels, with keys in en.ts and ro.ts. Shared components live under components/ui.

## Steps

1. Add shared curve/duration tokens and a system reduced-motion hook in lib/motion.ts.
2. Implement the target behavior in the component above, using an internal presence helper where needed.
3. Review transform/opacity-only motion, callback timing, rapid reversal, and timer cleanup.

## Boundaries

No dependencies, backend, session, navigation or business logic changes. Preserve public component props and test IDs. Never animate layout properties or recycled list rows. If source has drifted from cf2db85, re-read and report material mismatches before execution.

## Verification

- **Mechanical**: Node 22; npm run type-check; npm run lint; npm run build:web; relevant npm run test:e2e browser flows.
- **Feel check**: open/close and rapidly reverse the affected UI; it must retarget smoothly without replaying entrance on content replacement. Slow playback to 20% and inspect fade/transform alignment. Emulate reduced motion and verify no movement while opacity feedback remains. On a release build on the slowest supported Android/iPhone, verify frame pacing and keyboard interaction.
- **Done when**: mechanical checks pass and browser behavior is verified. Record device feel-check limitations explicitly.
