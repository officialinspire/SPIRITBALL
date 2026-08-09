# Archive

Historical documentation from SPIRITBALL's original Phaser/Arcade-Physics 2D implementation,
kept for reference after that codebase was fully removed (2026-08-09) in favor of the
Babylon.js/Havok 3D rewrite (see `../BABYLON_3D_OVERHAUL.md` and `../babylon-prompts/`).

None of the code these documents describe still exists in the repository. They're kept because
they record real bugs found and fixed, and design decisions made, that are still useful context
if a similar issue resurfaces in the 3D build.

- `CODE_REVIEW_REPORT.md` — an early, superseded review of the 2D game (see its own header note).
- `KNOWN_ISSUES.md` — the 2D game's release-stability report; `release-prompts/01-14` are the
  fixes that resulted from it.
- `release-prompts/` — one prompt doc per 2D bug fix/feature (flipper physics, mobile controls,
  accessibility, PWA/CDN resilience, etc.), each with an implementation note describing what was
  actually done.

For current project status and what to work on next, see `../BABYLON_3D_OVERHAUL.md`,
`../babylon-prompts/` (the 13-stage 3D rewrite, complete), and `../improvement-prompts/` (ongoing
post-rewrite improvements).
