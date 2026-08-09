# Release-stability fix prompts

Each file in this folder is a **self-contained prompt** you can hand to a fresh Claude Code (or
other coding agent) session, one at a time, to fix one specific known issue toward a stable
desktop + mobile release of SPIRITBALL. See `../KNOWN_ISSUES.md` for the full analysis each
prompt is based on.

Usage: paste the contents of a file as the task/prompt for a new session (or `cd` into the repo
and say "follow release-prompts/01-flipper-collision-physics.md"). Each one includes its own
context, so the agent doesn't need the rest of this conversation.

## Suggested order

| # | File | Why this order |
|---|------|-----------------|
| 1 | `01-flipper-collision-physics.md` | Core gameplay bug affecting both platforms — fix first, everything else is downstream of "does the game feel right." |
| 2 | `02-mobile-controls-visibility.md` | Mobile can be literally unplayable in the affected case — same tier of urgency as #1. |
| 3 | `03-flag-rotation-mission.md` | Broken mission logic — correctness of the core scoring/progression loop. |
| 4 | `05-mission-selection-default.md` | Same area as #3, small and low-risk — do together. |
| 5 | `06-game-over-stats.md` | Quick, low-risk content fix. |
| 6 | `08-fuel-light-sync.md` | Quick, low-risk visual fix. |
| 7 | `04-audio-system-or-remove-toggle.md` | Decide scope (real audio vs. remove toggle) once the above are stable. |
| 8 | `07-pause-menu-listener-leak.md` | Small cleanup, safe any time. |
| 9 | `09-asset-optimization.md` | Deployment/performance hardening. |
| 10 | `10-pwa-and-cdn-resilience.md` | Deployment/production hardening. |
| 11 | `11-center-post-drain-playtest.md` | Do **after** #1 — flipper fix changes ball behavior in this exact area. |
| 12 | `12-accessibility-pass.md` | Final polish pass. |
| 13 | `13-plunger-ball-mechanics-revamp.md` | Gameplay/UX revamp of the plunger and ball physics (gravity, bounce, charge model, anti-stuck logic). |
| 14 | `14-arcade-mobile-fullscreen-controls.md` | Mobile control overhaul: full-screen portrait play, arcade-style edge-zone flippers. Pairs with #13 (shares the launch-ready DOM sync hook) but is otherwise independent. |

Prompts within the same tier are independent of each other and can be done in any order, or in
parallel by different sessions, unless a prompt explicitly says otherwise (#11 depends on #1;
#13 and #14 share one small integration point — `InputManager.setLaunchReady()` — but neither
blocks the other from being read/applied first).
