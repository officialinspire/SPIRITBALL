# Improvement 4 — Basic audio (the 3D build currently has none at all)

## Context

`babylon-game.js` has zero audio implementation — no sound effects, no music, nothing. The only
trace of the 2D game's audio is a comment noting its sound/music toggle was "replaced" by the new
controls screen, which really means audio was dropped entirely during the rewrite, not ported.
`archive/release-prompts/04-audio-system-or-remove-toggle.md` shows the 2D game already had this
exact tension (a toggle for a system that may not have been fully functional) — worth reading
before starting, to avoid re-doing whatever was already learned there.

A pinball game with no launch/flipper/bumper/drain sound is missing a huge part of what makes the
mechanic feel physical and satisfying — this is one of the more player-noticeable gaps in the
current build.

## What to do

1. Decide the approach: Babylon has a built-in `Sound`/`AudioEngine` API, or the Web Audio API can
   be used directly - check what's actually available in the vendored Babylon build (same
   verify-before-assuming approach as everything else in this project) before committing to one.
2. Prefer procedurally-generated or synthesized sound effects (e.g. via the Web Audio API's
   oscillator/noise nodes) over loading external audio files, to stay consistent with this
   project's established pattern of avoiding new asset/CDN dependencies (the starfield skybox,
   particle textures, and UI fonts all made this same call already - see `babylon-prompts/07-*.md`
   and `08-*.md`'s implementation notes for the reasoning). If procedural audio can't achieve a
   good enough result for some specific sound, a small set of committed audio files is a
   legitimate fallback - just keep them small and few.
3. Cover at minimum: plunger launch, flipper activation, ball-bumper/target/lane/slingshot hits
   (can reuse pitch/tone variation instead of building N separate sounds), wall/flipper collision,
   drain, and game-over. Background music is a nice-to-have, not required for this prompt - keep
   scope tight and ship sound effects first.
4. Respect the existing reduced-motion signal's spirit for audio too - a mute/volume control
   belongs somewhere reachable (the controls screen is the natural home, matching where the 2D
   game's toggle lived) rather than only being controllable via OS-level mute.
5. Verify via Playwright that audio doesn't throw errors or block game startup on a browser
   context without user interaction yet (autoplay-policy restrictions are real and will silently
   fail/throw if not handled - Havok/WebGL's own async load already established a pattern for
   handling browser quirks defensively in this codebase, follow it).

## Acceptance criteria

- Launch, flipper, at least one hit type, and drain all have an audible, distinct sound.
- No console errors or startup failures related to audio, including on first load before any user
  gesture (autoplay policies).
- A mute/volume control exists and is reachable from the controls or pause screen.
