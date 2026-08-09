# Vendored third-party libraries

SPIRITBALL 3D self-hosts its Babylon.js and Havok physics build artifacts under `vendor/babylonjs/`
instead of loading them from `cdn.babylonjs.com`, per `babylon-prompts/13-*.md`'s explicit
production-readiness requirement: Babylon's own documentation states its CDN "isn't intended for
production use." This also happens to be why `cdn.babylonjs.com` was unreachable throughout this
project's development sandbox (a restrictive-but-realistic stand-in for the kind of network policy
a real deployment target might also enforce) - self-hosting removes that single point of failure
entirely, for development and production alike.

## What's vendored, and why these exact files

| File | Source | Purpose |
|---|---|---|
| `vendor/babylonjs/babylon.js` | npm `babylonjs@9.20.0`, the package's own `babylon.js` (its declared `main`) | The exact same UMD bundle `https://cdn.babylonjs.com/babylon.js` serves - full Babylon.js core, minified. |
| `vendor/babylonjs/havok/HavokPhysics_umd.js` | npm `@babylonjs/havok@1.3.14`, `lib/umd/HavokPhysics_umd.js` | The exact same loader `https://cdn.babylonjs.com/havok/HavokPhysics_umd.js` serves. |
| `vendor/babylonjs/havok/HavokPhysics.wasm` | npm `@babylonjs/havok@1.3.14`, `lib/umd/HavokPhysics.wasm` | The Havok physics engine's compiled WebAssembly binary. Must stay in the same directory as `HavokPhysics_umd.js` - the loader resolves it via `document.currentScript.src`, not a hardcoded path, so it finds `HavokPhysics.wasm` next to wherever the `<script>` tag actually points. |

These are **not** a different/smaller/customized build - deliberately the identical published
artifacts the CDN URLs this project verified against throughout `babylon-prompts/01-*.md` onward
resolve to, obtained via `npm`'s registry (reachable in this project's sandbox even though the CDN
itself was not) rather than hand-built or substituted, so no new API-compatibility risk was
introduced by this change.

## How they were obtained

No `package.json`/`node_modules` in this repo - these are one-time-vendored static files, keeping
the zero-build-step, static-file deployment model this project has used throughout (see
`babylon-prompts/13-*.md`'s implementation note for why this was chosen over introducing a
bundler). To reproduce or update:

```bash
# babylon.js core
curl -o babylon.js "https://registry.npmjs.org/babylonjs/-/babylonjs-<version>.tgz" | \
  tar -xzO package/babylon.js > vendor/babylonjs/babylon.js

# Havok physics (loader + WASM binary, same directory)
curl -o havok.tgz "https://registry.npmjs.org/@babylonjs/havok/-/havok-<version>.tgz"
tar -xzf havok.tgz package/lib/umd/HavokPhysics_umd.js package/lib/umd/HavokPhysics.wasm
cp package/lib/umd/HavokPhysics_umd.js vendor/babylonjs/havok/
cp package/lib/umd/HavokPhysics.wasm vendor/babylonjs/havok/
```

(Substitute the desired version, or `npm view babylonjs version` / `npm view @babylonjs/havok
version` for the current latest.) Re-run SPIRITBALL 3D's full manual playtest after any update -
this project's `babylon-prompts/` implementation notes document several real behavioral
assumptions (constraint-limit semantics, collision event structure, etc.) verified against this
specific version pairing that a future Babylon/Havok update could in principle change.

## Why self-host instead of a bundler

`babylon-prompts/13-*.md` posed this as an explicit either/or: self-host the CDN artifacts, or
adopt a bundler (Vite) and npm packages (`@babylonjs/core`, `@babylonjs/havok`) with a build step.
Self-hosting was chosen because it preserves the zero-build-step static-file deployment model this
project has used since Stage 1 - `index.html`'s `<script src="...">` tags still point directly at
plain files, GitHub Pages still serves the repository directly with no build/CI step required, and
every existing verification technique this project relied on (headless-Chromium tests against the
raw files, `node --check` on `babylon-game.js`) keeps working unchanged. A bundler would have
meant either committing a `dist/` build output (defeating much of the point) or adding a build
step to the deploy pipeline - a real, separate infrastructure decision better made deliberately if
this project's needs actually require tree-shaking, code-splitting, or npm-ecosystem dependencies
later, not as a side effect of removing a CDN dependency.
