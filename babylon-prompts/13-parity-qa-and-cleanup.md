# Stage 13 — Feature-parity QA, Phaser removal, and production readiness

## Context
The final stage. By this point every piece of the current Phaser/Arcade-Physics game should have
a working Babylon.js/Havok equivalent (Stages 1-12). This stage is about proving that
rigorously, retiring the old implementation, and closing the production-readiness gaps flagged
throughout this project (`../BABYLON_3D_OVERHAUL.md`'s risk section).

## What to do
1. **Build a feature-parity checklist** directly from the current game and the full
   `release-prompts/01-14` history (every bug fix and revamp that's already been done represents
   a piece of intended behavior that must not silently regress), and manually verify each item
   against the new Babylon version:
   - Both flippers respond reliably to keyboard and touch, including mid-swing ball arrival
     (`release-prompts/01-*.md`, `babylon-prompts/04-*.md`).
   - Mobile controls show/hide correctly (portrait/landscape/rotate-prompt), full-screen and
     orientation-lock behave as designed (`release-prompts/02-*.md`, `14-*.md`,
     `babylon-prompts/11-*.md`).
   - Every mission type is genuinely completable through real play, mission selection requires an
     explicit target hit (`release-prompts/03-*.md`, `05-*.md`).
   - Game Over stats, fuel-light visuals, and the pause menu's controls reference all show
     correct, live information (`release-prompts/06-*.md`, `08-*.md`, `04-*.md`).
   - No listener leaks or pause-state corruption from repeated pause/resume cycles
     (`release-prompts/07-*.md`, `babylon-prompts/12-*.md`).
   - Reduced-motion is respected for camera and particle effects (`release-prompts/12-*.md`,
     `babylon-prompts/10-*.md`, `08-*.md`).
   - High scores and statistics persist correctly across sessions.
2. **Remove Phaser entirely**: delete the Phaser CDN `<script>` tags and fallback-loader code from
   `index.html` (`release-prompts/10-*.md`'s CDN-resilience work), remove `index.js`'s Phaser-based
   implementation (or replace its contents with the new Babylon implementation, retiring the old
   file), and rename the Babylon spike/game files (`babylon-spike.*`/`babylon-game.*` from earlier
   stages) to be the real `index.html`/`index.js` if they weren't already. Grep the final codebase
   for any leftover `Phaser.` references to confirm nothing was missed.
3. **Resolve the CDN-for-production question flagged in `../BABYLON_3D_OVERHAUL.md`**: Babylon's
   own documentation states its CDN isn't intended for production use. Decide and implement one
   of: (a) download and self-host the specific Babylon.js core + Havok build files in the repo
   (same spirit as the asset-optimization work in `release-prompts/09-*.md`, keeping the
   zero-build-step static-file deployment model this project has used throughout), or
   (b) introduce a minimal bundler (e.g. Vite) and adopt npm packages (`@babylonjs/core`,
   `@babylonjs/havok`) with a build step. Document which was chosen and why - this is a real
   architecture decision, not busywork, since it affects every future deploy of this project.
4. **PWA/manifest/icon check**: confirm `manifest.json` and the icon set from
   `release-prompts/10-*.md` still make sense for the new visual identity (the icon was generated
   to match the 2D "cosmic eyeball" sprite - decide whether it still represents the game well, or
   needs a refresh to reflect the new 3D look).
5. Update `README`/project docs (or add one if none exists) to reflect that SPIRITBALL is now a
   Babylon.js/Havok 3D game, not a Phaser 2D game, so future contributors aren't misled by stale
   references.

## Constraints
- Don't remove Phaser until the parity checklist genuinely passes - a half-finished 3D version
  replacing a fully-working 2D one is a regression, not a shipment.
- Keep `KNOWN_ISSUES.md` and `release-prompts/01-14-*.md` in the repo as historical record (same
  treatment given to the superseded `CODE_REVIEW_REPORT.md` earlier in this project's history) -
  add a note at the top of `KNOWN_ISSUES.md` pointing at this document and the `babylon-prompts/`
  series as the current state, rather than deleting the history.

## Acceptance criteria
- The parity checklist is complete with every item verified against the new version, not assumed.
- No `Phaser` references remain anywhere in the shipped codebase.
- The CDN-vs-self-hosted/bundler decision is made, documented, and implemented - not left as an
  open question in a comment.
- A fresh visitor loading the game (desktop or a supported mobile browser) gets the full 3D
  SPIRITBALL experience with no dependency on the old Phaser implementation at all.
