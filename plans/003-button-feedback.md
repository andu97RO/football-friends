# 003 — Make press feedback subtle and interruptible

- **Status**: IMPLEMENTED (browser verified; native feel check pending)
- **Commit**: cf2db85
- **Severity**: LOW
- **Category**: Missed opportunity / accessibility
- **Estimated scope**: shared motion helper and affected UI components

## Problem

`components/ui/Button.tsx:99` currently contains:

```tsx
pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
```

## Target

Use Reanimated CSS transitions on transform and opacity only. Pointer press: scale 0.97 and opacity 0.8 in 150ms; release in 100ms. Curve cubic-bezier(0.23, 1, 0.32, 1). Reduced motion and keyboard activation get opacity feedback only. Preserve disabled/loading states and existing style overrides. No animations on tabs, typing or scrolling.

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
