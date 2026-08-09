# Stage 1 — Babylon.js foundation and a throwaway physics spike

## Context
First stage of the full 3D rewrite described in `../BABYLON_3D_OVERHAUL.md` — read that file
first for the architecture decisions and verified API details this prompt builds on. Nothing in
the current game gets touched yet; this stage only proves the new engine pipeline works at all,
in isolation, before any real content is built on top of it.

## Goal
A new, separate page (`babylon-spike.html` + `babylon-spike.js`, not `index.html`/`index.js` —
keep the working Phaser game fully intact and untouched during this stage) that: loads Babylon.js
+ Havok from CDN, renders a tilted plane, drops a sphere onto it with real gravity, and lets it
roll and bounce believably. This is the smallest possible slice that touches every layer of the
new stack (WebGL context, render loop, physics init, rigid bodies, camera) - if something is
going to be fundamentally broken (Havok fails to load, WASM blocked, physics unstable at the
chosen scale), find out here, not four stages in.

## What to do
1. Create `babylon-spike.html` with:
   ```html
   <script src="https://cdn.babylonjs.com/havok/HavokPhysics_umd.js"></script>
   <script src="https://cdn.babylonjs.com/babylon.js"></script>
   ```
   (confirmed CDN URLs — see `../BABYLON_3D_OVERHAUL.md`) plus a `<canvas id="renderCanvas">`
   sized to fill the viewport, and a script tag loading `babylon-spike.js`.
2. In `babylon-spike.js`:
   - Create a `BABYLON.Engine(canvas, true)`, a `BABYLON.Scene(engine)`.
   - Await Havok init and enable physics using the confirmed pattern from
     `../BABYLON_3D_OVERHAUL.md`:
     ```javascript
     const havokInstance = await HavokPhysics();
     const hk = new BABYLON.HavokPlugin(true, havokInstance);
     scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), hk);
     ```
   - Add an `ArcRotateCamera` (freely orbitable for this spike only — later stages define the
     real fixed pinball-cabinet camera) and a `HemisphericLight`.
   - **Use real-world scale, not pixel scale** (see the units note in `../BABYLON_3D_OVERHAUL.md`):
     a ground plane roughly 1m × 1m, tilted ~6.5° around the X axis to represent a pinball
     table's slope, given a static physics body (`PhysicsAggregate` with `PhysicsShapeType.BOX`
     or a thin box mesh, mass 0).
   - Add a sphere ~0.027m in diameter (a real pinball ball's size) a little above the tilted
     plane, given a dynamic `PhysicsAggregate` (`PhysicsShapeType.SPHERE`, some reasonable mass
     like 0.08kg matching a real pinball, restitution ~0.6, friction tuned by feel) with
     **continuous collision detection enabled** if Havok exposes it on the aggregate/shape (check
     current Babylon docs/playground for the exact property name at implementation time - don't
     guess it here) - the whole point of this spike is catching tunneling problems now, at tiny
     scale, before Stage 3 builds the real ball on top of unverified assumptions.
   - Run the render loop (`engine.runRenderLoop`), verify the ball rolls down the tilted plane
     and settles/bounces plausibly, not vibrating in place or falling through the floor.
3. Add a simple on-screen text overlay (plain HTML, not Babylon GUI) showing: Havok load status,
   current ball speed, and a "RESET BALL" button that respawns it above the plane - useful for
   repeated manual testing without reloading the page.

## Constraints
- Do not modify `index.html`, `index.js`, or `styles.css` in this stage - this is a fully
  separate, disposable spike file. It can be deleted once Stage 2 starts building the real thing,
  or kept around as a physics-tuning sandbox at the author's discretion.
- Don't try to make this look good - no materials, textures, or game content. Its only job is to
  prove the pipeline and surface any fundamental blockers early.
- If Havok fails to load or initialize for any reason, make that failure loud and visible (an
  on-page error message with the actual error), not a silent blank canvas - the CDN-failure
  problem this project already solved for Phaser (`archive/release-prompts/10-*.md`) is exactly the kind
  of thing to watch for here too.

## Acceptance criteria
- Loading `babylon-spike.html` in a real browser (this cannot be verified in a sandboxed
  environment where the Babylon/Havok CDN may be network-blocked - see the honest risk section
  in `../BABYLON_3D_OVERHAUL.md`) shows a 3D tilted plane and a ball that behaves believably
  under gravity: rolls downhill, bounces with decaying energy, comes to rest, doesn't clip
  through the plane or vibrate in place.
- The on-screen status readout confirms Havok initialized successfully.
- If anything about this spike feels physically wrong (ball floats, jitters uncontrollably,
  tunnels through the floor at higher drop heights), **stop and fix it here** before moving to
  Stage 2 - every later stage assumes this foundation is solid.

---

## Implementation note (2026-08-09)
Built `babylon-spike.html` + `babylon-spike.js`. Before writing code, verified the additional
API surface this stage needed beyond what `BABYLON_3D_OVERHAUL.md` already confirmed:
`PhysicsAggregate`'s constructor shape (`mesh, PhysicsShapeType, options, scene`),
`PhysicsShapeType.BOX`/`.SPHERE`, and - specifically - the CCD method names
`setCcdMotionThreshold`/`setCcdSweptSphereRadius` on a Havok `PhysicsBody`, confirmed via a
Babylon.js forum thread ("Continuous Collision Detection with Havok") surfaced through web
search (the thread itself was blocked by this environment's egress proxy, same as
`doc.babylonjs.com`, but the search engine's summary of it was accessible and consistent enough
to trust). Code defensively checks for those methods' existence before calling them and logs a
warning if absent, rather than assuming and crashing.

Implemented: CDN load-failure detection (`typeof BABYLON`/`typeof HavokPhysics` checks) before
touching either API, a full try/catch around async init with a loud on-page error panel (not
just a console error) on any failure, a tilted static box ground + dynamic sphere ball at
real-world pinball scale (27mm ball, ~6.5° tilt), CCD wired up on the ball body, a freely
orbitable camera for inspection, and a status readout (Havok load state, live ball speed/height)
plus a reset button that disposes and recreates the ball's physics body rather than relying on
unverified mesh-to-physics transform sync behavior.

**Verified in this sandbox**: the failure path. `cdn.babylonjs.com` is blocked by this
environment's network policy (confirmed via the same headless-Chromium + proxy technique used to
verify Phaser's CDN block in earlier sessions) - loading the page correctly shows the on-page
error panel with a specific, actionable message ("window.BABYLON is undefined... check network
access to cdn.babylonjs.com") rather than a silent blank canvas, and this was confirmed by
inspecting the rendered DOM (`#error-panel` has `style="display: block;"`) and the console log,
not just by reading the code. **Not verified**: the actual physics behavior (ball rolling, CCD,
camera framing, tilt direction) - none of that can be exercised until this runs somewhere the
Babylon/Havok CDN isn't blocked. The tilt direction is explicitly flagged in a code comment as an
unverified guess to confirm visually and correct if wrong. This needs a real browser session
before Stage 2 begins.

## Follow-up fix (2026-08-09)
Real playtesting reported the status panel never showed a Havok result at all (stuck, not even
reaching the error panel). Root-caused as a likely hang, not an outright failure: `HavokPhysics()`
fetches a `.wasm` binary internally, separate from the already-loaded UMD loader script, and if
that specific fetch stalls (slow/blocked network, a CORS quirk on the `.wasm` asset specifically)
the awaited promise can sit forever without resolving *or* rejecting - my original `try/catch`
only had something to catch once a promise actually settled, so a genuine hang produced no
console error and no error panel, just a permanently frozen "loading…" label.

Hardened this: added a `withTimeout()` wrapper (20s) around the `HavokPhysics()` call so a hang
now surfaces as a specific, actionable timeout error instead of silence; added progressive status
text ("checking scripts…" → "loading Havok WASM…" → "initializing physics world…" → "OK") so a
tester can see exactly where it's stuck if it happens again; and added `window.addEventListener`
handlers for `'error'` and `'unhandledrejection'` as a last-resort safety net catching anything
that escapes the explicit `main().catch(...)` entirely (e.g. an error thrown from inside an event
handler registered after `main()`'s own try/catch scope has already returned).

Re-verified in this sandbox: the CDN-blocked failure path (the one scenario testable here)
still works correctly after these changes - `#status-havok` shows "FAILED" and `#error-panel`
is visible. **Could not reproduce or verify the fix for the actual hang** reported, since this
sandbox's CDN block produces an immediate script-load failure, not the slower stall the report
described - that needs re-testing in the same environment/browser where the original hang was
observed.
