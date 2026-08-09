# Sync fuel-light target visuals with actual fuel count

## Context
The 6 "fuel light" chakra sprites on the right side of the playfield (`this.fuelLights` in
`index.js`, built in `setupChakras()`) are meant to visually track the fuel gauge. See
`KNOWN_ISSUES.md` item 8. Note this is purely cosmetic — the numeric fuel gauge in the HUD
(`updateHUD()`'s `fuelDots`) is already correct and unaffected.

## Problem
Two different pieces of code index into `this.fuelLights[]` using two different, unrelated
numbers:

- `hitFuelLight(fuel, index)` (~L2564) lights up the *specific sprite the ball just hit*,
  identified by that target's own `fuelIndex`:
  ```js
  this.gameState.fuelLights[index] = true;
  fuel.setAlpha(1);
  fuel.setTint(CONFIG.colors.fuelFull);
  ```
- `depleteFuel()` (~L2994) instead dims the sprite at array position `this.gameState.fuel`, the
  *current remaining fuel count* (a countdown index, not a "which target was hit" index):
  ```js
  if (this.gameState.fuel >= 0 && this.gameState.fuel < this.fuelLights.length) {
      this.fuelLights[this.gameState.fuel].setAlpha(0.3);
      this.fuelLights[this.gameState.fuel].setTint(CONFIG.colors.fuelLow);
  }
  ```
These two indexing schemes have no fixed relationship, so which physical light appears lit vs.
dim on the table can drift out of sync with the actual fuel total and with which lights the
player has actually hit.

## What to do
1. Decide on one consistent visual model and implement it. Simplest correct option: treat the 6
   fuel-light sprites as a **fixed-order countdown bar** (matching how `depleteFuel()` already
   treats them) — i.e. always show fuel lights `0..fuel-1` as lit and `fuel..5` as dim, recomputed
   any time fuel changes, rather than trying to track "which specific target was hit."
   - In `hitFuelLight()`, instead of lighting the sprite that was physically hit, just call a
     shared `updateFuelLightVisuals()` helper after incrementing `gameState.fuel` that sets all 6
     sprites' tint/alpha based on the current fuel count (same logic already used for the HUD
     `fuelDots`, just applied to `this.fuelLights` sprites too).
   - Use that same helper in `depleteFuel()` and in `startMission()` (which resets
     `fuel = CONFIG.fuelLightCount`) so all three code paths stay consistent.
2. Remove the now-redundant per-index tinting logic that caused the mismatch.

## Constraints
- Purely visual/cosmetic fix — don't change the underlying `gameState.fuel` numeric logic,
  depletion rate, or mission-abort-on-empty behavior.

## Acceptance criteria
- Start a mission (fuel resets to 6, all 6 lights show "full" tint), let fuel deplete over time,
  and confirm exactly `fuel` lights show "full" and the rest show "low" at every point, regardless
  of which physical fuel target the ball hit to refuel.
- Hitting a fuel-refuel target increases the fuel count and the correct number of lights updates
  to "full," not just the specific sprite that was hit.

---

## Implementation note (2026-08-08)
Added `updateFuelLightVisuals()`, which sets all 6 `this.fuelLights` sprites' tint/alpha as a
fixed-order countdown bar based on `this.gameState.fuel` (indices `0..fuel-1` full, `fuel..5`
low) — the same model `depleteFuel()` already used, just applied consistently everywhere fuel
changes. Replaced the per-index tinting in `hitFuelLight()` with a call to this helper, replaced
the countdown-index tinting in `depleteFuel()` with the same call, and added a call in
`startMission()` (which resets fuel to full) so the lights are correctly all-lit the moment a
mission starts rather than carrying over whatever state they were in from the previous mission.
`node --check index.js` passes.
