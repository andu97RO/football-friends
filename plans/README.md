# Animation improvements

Requested flow: review-animations → improve-animations → animate-expo.
Source: https://github.com/emilkowalski/skills/tree/main/skills
Baseline: cf2db85. Expo 54, Reanimated 4, restrained consumer utility UI.

| Plan | Severity | Status |
| --- | --- | --- |
| [001 Toast presence](001-toast-presence.md) | MEDIUM | IMPLEMENTED |
| [002 Modal motion](002-modal-motion.md) | MEDIUM | IMPLEMENTED |
| [003 Button feedback](003-button-feedback.md) | LOW | IMPLEMENTED |

Execute in this order; 002 and 003 reuse the shared tokens/reduced-motion hook from 001.

Missed opportunities selected: restrained press interpolation and a centered dialog scale/fade. Deliberately retain immediate tab switches, typing, scrolling and feed rows.

Native release-build feel checks require physical devices and remain separate from browser verification.

See [review and validation](REVIEW.md) for findings, exact behavior and physical-device limitations.
