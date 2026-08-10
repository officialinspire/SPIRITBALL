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

## Implementation note

**Approach.** Went with the raw Web Audio API rather than Babylon's `Sound`/`AudioEngine` wrapper.
All effects are procedurally synthesized at play-time — no audio files were added — consistent with
the starfield/particle/font precedent cited above. Two building blocks cover every effect:

- `playTone(freq, durationS, opts)` — an `OscillatorNode` (sine by default) through a `GainNode`
  with an exponential-decay envelope, optionally sweeping frequency via
  `exponentialRampToValueAtTime` (used for the launch's rising pitch sweep). Cheap, and a sine tone
  with a fast decay reads as a "pling"/"blip" which suits bumpers, targets, and lanes well.
- `playNoiseClick(durationS, volume)` — a short `AudioBufferSourceNode` filled with generated white
  noise, for the percussive, non-tonal sounds (flipper solenoid click, wall thud, drain).

Both route through a single `masterGainNode` (`AudioContext.destination` ← `masterGainNode` ←
individual per-sound gain envelopes), so mute is just `masterGainNode.gain.value = 0/1` — one place
to silence everything, including any sound already mid-decay.

**Autoplay-policy compliance.** `getAudioContext()` lazily constructs the `AudioContext` (and
resumes it if suspended) only on first call, and every playback function call goes through it. The
context is never touched at page/script load. Verified via Playwright
(`audio-01-noerrors.js`) that a page load with **zero** user interaction produces no console errors
or thrown exceptions — the game simply plays silently until the first real gesture (a launch,
flipper press, etc.) creates/resumes the context.

**Events wired:**
- `playLaunchSound(powerPercent)` — rising frequency sweep, sweep range/duration scaled by launch
  power — on `handleLaunchRelease()`.
- `playFlipperSound()` — noise click — on the leading edge of `activateFlipper()` (only on
  active-state transition, not every frame it's held).
- `playHitSound(pitch)` — tone, pitch varied per obstacle type (bumper 660Hz, satellite 880Hz,
  slingshot 520Hz, mission target 740Hz, re-entry lane 990Hz) — on `handlePhysicalHit()` /
  `handleTriggerHit()`.
- `playWallSound()` — noise click, quieter/duller than the flipper click — on wall and
  flipper-body physical contact.
- `playDrainSound()` — descending tone — on `handleDrain()`.
- `playGameOverSound()` — short descending tone sequence — first statement in
  `showGameOverScreen()`.

All playback calls are wrapped in try/catch; a synthesis failure is swallowed (audio is decorative,
never allowed to break gameplay).

**Mute control.** A `🔊 SOUND: ON` / `🔇 SOUND: OFF` toggle button was added to the Controls screen
(`#mute-toggle-btn`, styled by the existing generic `.screen-overlay button` rule — no new CSS).
State persists via `localStorage['spiritball-muted']` and is restored on load, applied to
`masterGainNode.gain.value` immediately so it also affects in-flight/already-mid-decay sounds, not
just future ones.

**Verification (Playwright, headless Chromium):**
- `audio-01-noerrors.js` — page load, no gesture: zero console/page errors.
- `audio-02-play.js` — real launch (Space) + dev ball-drop hit attempts: zero errors; controls-
  screen mute toggle flips the button label and persists `spiritball-muted` to `localStorage`.
- `audio-03-gain-check.js` — confirmed `masterGainNode.gain.value` is `1` during normal play, drops
  to `0` immediately on mute via the real UI flow, and restores to `1` on un-mute.
- `audio-04-persist-reload.js` — pre-set `localStorage['spiritball-muted'] = 'true'`, reloaded the
  page fresh: mute button correctly reads `🔇 SOUND: OFF` on load, confirming the persisted
  preference (not just the live in-session toggle) is honored.
- Full regression suite re-run after these changes (`flipper-test.js`, `ccd-test2.js`,
  `hud-check.js`, plus a 10s plunger-rest recheck): all pass, zero errors — the audio module adds
  no side effects to physics or existing UI state.

A temporary `window.__DEBUG_AUDIO` hook (exposing `getAudioContext`/`getMasterGain` for the gain
tests above) was added during development and removed before commit.
