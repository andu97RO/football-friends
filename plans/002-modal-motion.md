# 002 — Separate overlay and panel motion

- **Status**: IMPLEMENTED (browser verified; native feel check pending)
- **Commit**: cf2db85
- **Severity**: MEDIUM
- **Category**: Accessibility / physicality
- **Estimated scope**: shared motion helper and affected UI components

## Problem

`components/ui/Sheet.tsx:26` currently contains:

```tsx
<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
```

## Target

Use an internal MotionModal with core Modal animationType="none". Animate backdrop opacity independently. Sheet translation uses its own height (100% to 0), dialog scales 0.95 to 1. Enter 250ms, exit 200ms, Easing.bezier(0.23, 1, 0.32, 1). Retain modal until exit completes; cancel stale closing timers if reopened. Reduced motion drops transforms but retains fades. Preserve keyboard avoidance, safe areas, callbacks and dialog queue behavior.

## Repo conventions to follow

Use Reanimated 4 already in package.json. Shared visual tokens live in constants/theme.ts (theme.spacing.m = 16); add motion tokens to that theme. Use lib/i18n.ts useT() for any labels, with keys in en.ts and ro.ts. Shared components live under components/ui.

## Steps

1. Add shared curve/duration tokens and a system reduced-motion hook in lib/motion.ts.
2. Implement the target behavior in the component above, using an internal presence helper where needed.
3. Review transform/opacity-only motion, callback timing, rapid reversal, and timer cleanup.

4. Keep conditionally mounted editor contents alive for the exit in `app/group/[id].tsx` (MemberSheet), `app/teams/[id].tsx` (SwapSheet), `app/(tabs)/profile.tsx` (EditProfileSheet), and `components/match/sheets.tsx` (EditMatchSheet). Use a shared `useExitRetention` hook; pass actual visibility to Sheet. Cancel stale retention timers when reopened. After closing completes, unmount forms so subsequent openings reset drafts.

## Boundaries

No dependencies, backend, session, navigation or business logic changes. Preserve public component props and test IDs. Never animate layout properties or recycled list rows. If source has drifted from cf2db85, re-read and report material mismatches before execution.

## Verification

- **Mechanical**: Node 22; npm run type-check; npm run lint; npm run build:web; relevant npm run test:e2e browser flows.
- **Feel check**: open/close and rapidly reverse the affected UI; it must retarget smoothly without replaying entrance on content replacement. Slow playback to 20% and inspect fade/transform alignment. Emulate reduced motion and verify no movement while opacity feedback remains. On a release build on the slowest supported Android/iPhone, verify frame pacing and keyboard interaction.
- **Done when**: mechanical checks pass and browser behavior is verified. Record device feel-check limitations explicitly.
