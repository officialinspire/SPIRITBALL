// ===================================
// SPIRITBALL - config/constants module
//
// First extraction of a larger effort to split babylon-game.js's accumulated systems into
// logical ES modules (user-requested) - see MODULARIZATION.md at the repo root for the full
// remaining module boundary plan and why this one was chosen to go first. Everything in this
// file is pure, side-effect-free configuration: numeric/string/array/object literal constants,
// plus a handful of pure helper functions (coordinate conversion, hex-to-Color3 conversion,
// mission-required-count math) with no mutable shared state, no DOM access, and no BABYLON
// calls at module-evaluation time (only inside function bodies, called later - see
// hexToColor3()'s own comment below for exactly why that distinction matters here). Behavior is
// unchanged from before this split: every value and function below is verbatim from
// babylon-game.js, just re-exported instead of being a bare top-level declaration inside its
// IIFE.
// ===================================

// ===================================
// Coordinate / scale conversion (the single source of truth every later stage must reuse)
// ===================================
//
// The current 2D game (../index.js) uses CONFIG.width=540 x CONFIG.height=960 pixels, with
// Phaser's screen convention: +X right, +Y DOWN, rotation measured clockwise-positive on
// screen. This stage converts that entire layout into a real-world-scale, LEVEL 3D table
// (see the tilt-convention note below for why "level"), using Babylon's default left-handed
// convention: +X right, +Y up, +Z "into the screen" / away from the viewer.
//
// BABYLON_3D_OVERHAUL.md specified real pinball dimensions of 0.51m x 1.07m, but that pair
// has a different aspect ratio (0.4766) than the current 2D layout's 540:960 (0.5625).
// Applying those two numbers as independent non-uniform X/Z scale factors would distort
// every rotated wall (the slants and guide rails aren't axis-aligned, so non-uniform scaling
// changes their effective angle and shape, not just their size). Preserving the existing,
// already-designed table LAYOUT matters more here than hitting an exact real-world figure,
// so this deliberately deviates from the master doc: ONE uniform scale factor, derived from
// the width (0.51m target), applied identically to both axes. This keeps every angle and
// proportion from the 2D layout exactly intact; the resulting table is 0.51m x 0.907m
// (close to, not identically, "real" pinball length - a reasonable trade to make once, with
// this comment, rather than silently drifting from the master doc's numbers).
export const PX_TO_M = 0.51 / 540; // uniform scale, ~0.944mm per old pixel
export const TABLE_WIDTH_M = 540 * PX_TO_M; // 0.51
export const TABLE_LENGTH_M = 960 * PX_TO_M; // ~0.9067
export const WALL_HEIGHT_M = 0.04; // new 3D-only dimension - taller than the ball so it can't hop out

// Havok collision filtering category for the ball (see PhysicsShape.filterMembershipMask/
// filterCollideMask - confirmed real API against physicsShape.ts). Everything else keeps
// Havok's own default membership/collide masks (unrestricted - collides with everything), so
// this alone changes nothing about existing ball-vs-playfield/wall/bumper/etc. collision. It
// exists purely so the flipper (see createFlipper()) can restrict ITS collide mask to "ball
// only" - flippers were exploding on contact with the playfield/nearby scenery once their
// position became rigidly LOCKED (Stage 13's flipper-constraint fix), and a flipper has no
// gameplay reason to physically collide with anything but the ball anyway.
export const COLLISION_CATEGORY_BALL = 2;

// Converts a 2D CONFIG-space X (0..540) to 3D world X, centered on the table.
export function toWorldX(x2d) {
    return (x2d - 540 / 2) * PX_TO_M;
}

// Converts a 2D CONFIG-space Y (0..960, DOWN the screen, 0 = far/top wall, 960 = near/
// flippers) to 3D world Z. Inverted relative to 2D Y: the far/top wall (2D y=0) becomes
// +Z ("far" from the camera), and the near/flipper end (2D y=960) becomes -Z ("near" the
// camera) - matching where the fixed gameplay camera sits (see buildCamera() below).
export function toWorldZ(y2d) {
    return (960 / 2 - y2d) * PX_TO_M;
}

// Converts a 2D Phaser rotation (radians, clockwise-positive on a Y-down screen) to a 3D
// rotation around Babylon's Y axis (vertical - walls lie flat in the X-Z table plane, same
// role 2D screen-plane rotation played). Because toWorldZ() above inverts one axis relative
// to the 2D convention, a rotation that reads as one direction in 2D reads as the opposite
// direction once mapped into this 3D space - negating preserves left/right mirror symmetry
// between paired pieces (leftSlant/rightSlant, leftGuide/rightGuide) regardless of whether
// the *overall* sign guess below turns out backwards. NOT visually verified yet (this
// sandbox cannot load the Babylon CDN - see BABYLON_3D_OVERHAUL.md's risk section): if the
// whole table looks mirrored end-to-end once viewed for real, flip the sign here in this one
// place rather than touching each wall's rotation individually.
export function toWorldRotationY(rotation2d) {
    return -rotation2d;
}

// ===================================
// Tilt convention: TILTED GRAVITY, LEVEL GEOMETRY (deliberately different from the Stage 1
// spike's tilted-geometry approach - see the implementation note in
// babylon-prompts/02-3d-table-and-camera.md for the full reasoning). All table geometry
// below is built perfectly level/axis-aligned in local space; gravity itself gets a small
// -Z component so the ball rolls toward the flipper end, and the CAMERA is angled to sell
// the visual "tilted cabinet" impression. This keeps every later stage's math simple - wall
// positions, flipper hinge axes, bumper placements in Stages 4+ never need to account for a
// globally-tilted parent transform, only the gravity vector (set once, here) does.
// ===================================
export const TABLE_TILT_DEGREES = 6.5;
export const TILT_RAD = (TABLE_TILT_DEGREES * Math.PI) / 180;
export const GRAVITY_VECTOR_FN = () => new BABYLON.Vector3(
    0,
    -9.8 * Math.cos(TILT_RAD),
    -9.8 * Math.sin(TILT_RAD) // pulls the ball toward -Z, i.e. toward the flipper end
);

export const BALL_DIAMETER_M = 0.027;
export const BALL_MASS_KG = 0.08;

// Converted from CONFIG.ballMaxVelocity: 1800 (px/s) in ../index.js, using the same PX_TO_M
// scale as everything else - the primary defense against tunneling/instability, same spirit
// as the old Arcade Physics safety net. See archive/release-prompts/13-*.md for the original
// 2D value's history.
//
// NOT "a second line of defense behind Havok's CCD" (an earlier version of this comment's
// claim) - improvement-prompts/01-*.md's investigation found this vendored Havok build (grep
// of both vendor/babylonjs/babylon.js and the compiled HavokPhysics.wasm's own string table)
// exposes no continuous-collision-detection or "motion quality" API at all, at any level
// (JS wrapper or native HP_* function). createBall() previously called two methods
// (setCcdMotionThreshold/setCcdSweptSphereRadius) that don't exist on this PhysicsBody build -
// dead code, now removed. This per-frame JS clamp is genuinely the only per-body defense.
export const MAX_BALL_SPEED_MS = 1800 * PX_TO_M; // ~1.7 m/s

// Real Havok API found in the same investigation (HavokPlugin.setVelocityLimits(), backed by
// the native HP_World_SetSpeedLimit/GetSpeedLimit functions - confirmed present via the same
// WASM string-table grep, and confirmed live via a temporary debug hook: this build's default
// is 200 m/s linear / 100 rad/s angular, both far looser than this game's actual scale needs).
// A world-level clamp Havok enforces inside its own solver every physics substep, not just
// once per rendered frame the way MAX_BALL_SPEED_MS above is - a genuine second line of
// defense against a velocity spike happening and causing a tunnel-through in the gap between
// two JS-side checks. Deliberately looser than MAX_BALL_SPEED_MS (a safety ceiling, not the
// real gameplay tuning knob, which stays MAX_BALL_SPEED_MS) so it never affects normal play.
export const WORLD_MAX_LINEAR_SPEED_MS = MAX_BALL_SPEED_MS * 3;

// Anti-stuck thresholds, converted from checkBallStuck() in ../index.js (revamped in
// archive/release-prompts/13-*.md): speed threshold 40px/s -> m/s, kick components 400/380px/s ->
// m/s. Time values (ms) don't need conversion. "Downhill" in this stage's tilt convention is
// -Z (see the GRAVITY_VECTOR_FN comment above), replacing the 2D version's "+Y" (toward the
// bottom of the screen).
export const STUCK_SPEED_THRESHOLD_MS = 40 * PX_TO_M; // ~0.038 m/s
export const STUCK_TIME_THRESHOLD_MS = 450;
export const STUCK_KICK_X_RANGE_MS = 400 * PX_TO_M; // ~0.378 m/s, randomized +/-
export const STUCK_KICK_DOWNHILL_MS = 380 * PX_TO_M; // ~0.359 m/s toward -Z
export const STUCK_KICK_UP_MS = 0.15; // small vertical hop to help clear resting contact - new in
                                // 3D, no 2D equivalent needed since 2D had no "resting on a
                                // surface via normal contact" concept the same way

// ===================================
// Flippers + obstacle layout: an authentic, Space-Cadet-inspired arrangement, NOT a raw
// port of the current 2D game's coordinates. The 2D layout put mission targets in a straight
// column on the far left, fuel lights in a column on the far right, and 4 attack bumpers in
// a horizontal row near the top - workable in a 2D top-down arcade sense, but not how a real
// (or Space-Cadet-style) pinball table is actually laid out. This redesigns positions only;
// the underlying feature set (a target bank, a bumper cluster, a satellite bumper, twin
// slingshots, re-entry lanes) is unchanged from the existing game, matching real Space Cadet
// conventions: a tight pop-bumper cluster near table center, an angled target bank in the
// upper-left, a satellite feature elsewhere up top, slingshots directly above the flippers.
// ===================================

// --- Flippers ---
// Real-world pinball flipper proportions, used directly since this table is already built
// at real-world scale (no pixel conversion needed for genuinely new elements like this).
export const FLIPPER_LENGTH_M = 0.075;
export const FLIPPER_THICKNESS_M = 0.014;
export const FLIPPER_HEIGHT_M = 0.012;
export const FLIPPER_MASS_KG = 0.03;
export const FLIPPER_GAP_HALF_M = 0.045; // each pivot sits this far from table center X=0
export const FLIPPER_Z_M = -0.36; // near the flipper/near-camera end of the table
export const FLIPPER_PLAYFIELD_CLEARANCE_M = 0.003; // see createFlipper()'s comment - avoids flipper/playfield contact fighting the LOCKED constraint

// Sweep angle in radians, converted with plain math, not BABYLON.Tools.ToRadians() - this
// file's constants are evaluated at script-parse time, before the CDN-load checks inside
// main() run, so referencing BABYLON up here would throw an unguarded ReferenceError (not a
// caught, reported failure) if the CDN is blocked, ahead of where the error-handling
// listeners further down even get registered.
//
// The 70-degree sweep magnitude reuses the OLD 2D game's already-tuned value (20deg rest to
// -50deg active - see archive/release-prompts/01-*.md) but the actual REST ANGLES below are NOT
// reused from 2D - flippers are a brand-new 3D mechanism (motorized hinge constraint, not a
// velocity-injection formula), and naively reusing the 2D angle numbers via this file's
// toWorldRotationY() wall-conversion helper produced physically wrong geometry (paddle tips
// crossing the centerline AT REST, before activation - verified with a standalone Node
// script, not by eye, since this sandbox can't render). These values were instead derived by
// numerically searching for a (rest angle, direction) pair that actually produces correct
// real-world flipper geometry: tip pointing outward-and-toward-the-near/player-end at rest,
// swinging toward center-and-up-table when activated - then mirrored exactly for the right
// flipper (mirroring an angle-plus-rotation-direction pair requires negating both the angle
// reflection AND the sweep direction, not just the angle - also verified numerically).
//
// Bug fix (user-reported - "rest position angle looks wrong"): the original -100/-80 pair put
// the rest angle only 10 degrees off perfectly vertical (nearly straight down, toward the
// player), which reads on screen as a stubby vertical pillar rather than a classic pinball
// flipper's diagonal paddle silhouette. Shifted 15 degrees further from vertical (each rest
// angle now 25 degrees off vertical instead of 10), re-verified numerically the same way the
// original pair was: LEFT's rest tip is still further outward (more negative X) than its own
// pivot (no crossing at rest, same invariant as before), and with FLIPPER_SWEEP_RAD unchanged,
// both ACTIVE tips still cross well past the centerline AND still overlap each other by ~6mm
// when fired simultaneously (no new gap for the ball to sneak through - checked at every 5-degree
// shift up to 25 before picking 15, since a 20-degree shift left only ~3mm of that overlap and
// 25 degrees lost it entirely). Mirroring relationship (RIGHT_REST = 180 - LEFT_REST) preserved
// exactly as established above.
//
// Bug fix (user-reported - "flippers flip down instead of up"), superseded by the fix directly
// below - kept for history: the "verified numerically" claim above checked that the active tip
// crosses the centerline (X) and moves further from the rest position than at rest, but never
// actually checked the active tip's Z position against the PIVOT's own Z - the number that
// determines whether the tip visually ends up above (up-table) or below (down-table, toward the
// player) the hinge. It doesn't: with the old 70-degree sweep, LEFT's active angle landed at -45
// degrees, whose tip sits ~53mm further TOWARD THE PLAYER than its own pivot - confirmed both by
// direct position readout and by Playwright screenshots showing the "fired" flipper stretching
// further down-screen than at rest. The sweep was simply too small to ever reach "up-table"
// starting from a REST angle that pointed down-and-outward - the active tip's Z only ever
// crosses to positive (above the pivot) once the sweep is large enough to carry the angle up
// through horizontal (0 degrees) and beyond, so that first fix widened the sweep to 160 degrees
// instead, keeping the down-and-outward REST angles untouched.
//
// Bug fix, attempt 2 (user-reported, with a reference image - "tip up versus tip down"),
// superseded by attempt 3 directly below - kept for history: read the reference as "the REST
// silhouette itself needs to point up-and-outward, not down-and-outward", so REST was mirrored
// across the horizontal axis (LEFT_REST +115 instead of -115, RIGHT_REST +65 instead of -65) with
// FLIPPER_SWEEP_RAD back to 70 degrees. Confirmed via Playwright screenshots to genuinely keep
// the tip above its pivot's Z at both rest and fired - but the user then clarified this still
// didn't match the reference: the tips needed to point INWARD (toward the center gap) at rest,
// not outward, only the up/down component was about direction, not in/out.
//
// Bug fix, attempt 3 (user-clarified explicitly, in plain language): "the tips point toward the
// center and downwards, and when pressed lift up towards center" - i.e. REST = down-and-INWARD,
// FIRED = up-and-INWARD, with the inward lean roughly unchanged between the two (only the
// vertical component flips) rather than any outward lean at either extreme. Superseded by
// attempt 4 directly below - kept for history: this was achieved by swapping which rest angle
// belongs to which side from the very first (pre-any-of-these-fixes) values (LEFT_REST -65,
// RIGHT_REST -115) with FLIPPER_SWEEP_RAD widened to 130 degrees. The user then reported this was
// STILL inverted from a real machine after a hard refresh (ruling out stale-cache confusion with
// attempt 2's up-and-outward rest) and asked for flippers that "function and operate exactly like
// a normal pinball machine" instead of continuing to interpret the original reference image.
//
// Bug fix, attempt 4 (real-pinball-mechanics baseline, per explicit user request - "exactly like
// a normal pinball machine"): on every real (and virtual) pinball table, the flipper's spring-
// loaded REST position points DOWN-and-OUTWARD (hanging toward the player/outlane, away from
// center - this is what lets a ball that misses the flipper drain past it), and the solenoid-
// fired ACTIVE position snaps UP-and-INWARD (toward the other flipper, to intercept and redirect
// the ball back up the table) - this is the universally standard flipper motion, independent of
// any particular reference image. This restores the REST angles to the very first (pre-any-of-
// these-fixes) down-and-outward values (LEFT -115, RIGHT -65 - see the numerically-searched
// derivation above for why these specific angles) and keeps FLIPPER_SWEEP_RAD at 160 degrees
// (from the "flippers flip down instead of up" fix above) so ACTIVE lands up-and-inward (LEFT:
// -115 -> 45, RIGHT: -65 -> -135/225) rather than still-downward. createFlipper()'s motorSign/
// minAngleRad/maxAngleRad needs no further change - it's already back at its very first
// direction convention from the previous fix, which is exactly what these REST values need.
// Verified numerically (tip position vs. pivot, both axes, both states) and visually via
// Playwright screenshots.
export const FLIPPER_SWEEP_RAD = (160 * Math.PI) / 180;
export const FLIPPER_LEFT_REST_RAD = (-115 * Math.PI) / 180;
export const FLIPPER_RIGHT_REST_RAD = (-65 * Math.PI) / 180;

// Motor tuning - NOT ported from anything (flippers are an entirely new mechanism in this
// 3D rewrite; the 2D version's velocity-injection formula has no equivalent here). These are
// angle-per-second rates consumed directly by updateFlipperMotor()'s kinematic stepping (see
// createFlipper()'s comment for why this isn't a physics-constraint motor).
//
// Bug fix (user-reported - "when I fire the flippers they literally jump out of position" instead
// of visibly swinging from the hinge): at the original 26 rad/s, the current 160-degree
// FLIPPER_SWEEP_RAD (see its own comment) completes in ~107ms - only 2-3 rendered frames on a
// real device at a typical 24-30fps, and a single frame in this sandbox's own much slower ~2fps
// headless rendering (confirmed directly: a captured per-frame angle trace showed the entire
// rest-to-active sweep landing in exactly one frame, a literal 160-degree jump with zero
// intermediate samples - see this fix's own testing note in the PR). A kinematic body's rotation
// is only as smooth as the frames sampling it - a real solenoid's near-instant physical snap
// doesn't need to look continuous to the eye the way an ANIMATED (not physically simulated)
// mesh's per-frame teleport does. Slowed to 10 rad/s so the same 160-degree sweep takes ~279ms -
// still a fast, snappy flip (nowhere near sluggish), but now spans roughly 7-17 frames across the
// realistic 24-60fps range instead of 2-3, enough to read as a hinge swing rather than a jump.
// This sandbox's own ~2fps headless rendering still can't show it as multi-frame motion (a
// pre-existing, documented environment limitation, not something this fix can address) - could
// not be re-verified visually here, only reasoned about via frame-count math; needs confirming on
// real hardware. FLIPPER_RETURN_SPEED_RAD_S was already slow enough (310ms for the same sweep) to
// not exhibit this problem and is unchanged.
export const FLIPPER_ACTIVATE_SPEED_RAD_S = 10; // fast "punch" (~279ms for the current 160-degree sweep), fast enough to still land in Havok's own next physics step like a real solenoid, slow enough to visibly swing across multiple frames instead of teleporting - see this constant's own bug-fix comment
export const FLIPPER_RETURN_SPEED_RAD_S = 9; // slower, controlled return (magnitude only - direction is per-flipper, see createFlipper())

// --- Obstacle layout (placeholder geometry only this stage - see file header) ---
export const BUMPER_RADIUS_M = 0.02;
export const BUMPER_CLUSTER = [
    { x: 0, z: 0.16 },
    { x: -0.08, z: 0.06 },
    { x: 0.08, z: 0.06 },
    { x: 0, z: -0.02 }
]; // 4 bumpers in a tight diamond near table center, matching CONFIG.attackBumperCount in ../index.js

// Active pop-bumper kick: bumpers previously only ever bounced the ball via Havok's own
// restitution (set in buildObstacles()) - a real pop bumper actively fires the ball away on
// contact instead of just passively reflecting it. applyBumperKick() (in main(), used only by
// handlePhysicalHit()'s 'bumper' branch) adds a horizontal velocity kick of this magnitude on
// top of that existing restitution bounce. One tunable constant, not a magic number buried in
// the hit handler.
export const BUMPER_KICK_SPEED_MS = 480 * PX_TO_M; // ~0.453 m/s added away from the bumper center

export const TARGET_RADIUS_M = 0.014;
export const MISSION_TARGET_BANK = [
    { x: -0.20, z: 0.32 },
    { x: -0.16, z: 0.28 },
    { x: -0.11, z: 0.24 }
]; // 3 targets in an angled upper-left bank, matching CONFIG.missionTargetCount

// Drop-target bank upgrade (user-requested) - a hit target sinks from its raised resting
// height down to below the playfield surface instead of just flashing in place. Named here
// so both buildObstacles() (initial mesh placement) and main()'s updateDropTargetBank()
// (the per-frame tween) reference the same two endpoints rather than duplicating the
// literal 0.015 in two places.
export const TARGET_RAISED_Y_M = 0.015;
export const TARGET_DROPPED_Y_M = -0.05;
export const TARGET_DROP_ANIM_MS = 220;

// Giant spinning Saturn (board redesign, user-requested) - the table's new visual and
// gameplay centerpiece, top-center. Real collider (notably bigger than every other bumper -
// 0.045m vs 0.02m - a genuine "boss" piece), decorative rings extending well beyond it,
// continuously rotating (see updateSaturnRotation() in main()'s render loop). Positioned at
// z=0.32 rather than further up-table specifically so its collider's top edge (0.32+0.045=
// 0.365) stays comfortably clear of the re-entry lanes at z=0.40 (0.035m of margin) without
// needing to move them.
export const SATURN_RADIUS_M = 0.045;
export const SATURN_POS = { x: 0, z: 0.32 };

// The old "satellite" object, re-themed as a comet now that Saturn itself is a real dedicated
// piece (having both would be a confusing "two Saturns") - same role/size/position family,
// just reskinned (new icy-cyan identity, see HEX_COMET) and nudged slightly right/down from
// its old (0.16, 0.36) spot to sit clear of Saturn's new footprint and rings.
export const COMET_RADIUS_M = 0.022;
export const COMET_POS = { x: 0.17, z: 0.29 };

// Score-multiplier power-up orb (board redesign) - appears periodically in the open lane
// between the bumper cluster and Saturn (naturally in the ball's travel path when it rolls
// up-table), despawns if not hit in time. See updatePowerUp() in main()'s render loop.
export const POWERUP_RADIUS_M = 0.016;
export const POWERUP_POS = { x: 0, z: 0.22 }; // clear of both the boss bumper's decorative collar (below) and Saturn's collider (above)
export const POWERUP_SPAWN_INTERVAL_MS = 20000; // how long it stays hidden before reappearing
export const POWERUP_ACTIVE_DURATION_MS = 7000; // how long it stays visible/hittable before despawning unhit
export const POWERUP_MULTIPLIER = 2;
export const POWERUP_MULTIPLIER_DURATION_MS = 12000; // how long the 2x window lasts once collected

export const SLINGSHOT_SIZE_M = 0.05;
export const SLINGSHOTS = [
    { x: -0.13, z: -0.30, mirror: 1 },
    { x: 0.13, z: -0.30, mirror: -1 }
]; // directly above/outside each flipper, like real slingshot kickers

// Active slingshot kick: like the bumpers' applyBumperKick(), a real slingshot kicker
// actively punches the ball away rather than just bouncing it off restitution. Two separate
// tunable components (see applySlingshotKick() in main()): a lateral "away from the face"
// push using the same ball-relative direction math as the bumpers (naturally mirrors
// correctly for both the left and right slingshot, since it's derived from each mesh's own
// position), plus a fixed up-table (+Z) bias applied unconditionally on top. The bias is
// deliberately larger than the kick speed so the combined kick's net Z contribution can
// never end up negative (toward the flippers/drain) regardless of the ball's approach angle -
// a ball coming off a flipper shot approaches a slingshot from below (more negative Z), where
// the away-from-face component alone would often point further down-table, not the "feed the
// ball back into play" behavior a real slingshot has.
export const SLINGSHOT_KICK_SPEED_MS = 520 * PX_TO_M; // ~0.491 m/s, away-from-face lateral push
export const SLINGSHOT_KICK_UPTABLE_BIAS_MS = 600 * PX_TO_M; // ~0.567 m/s, unconditional +Z addition - larger than SLINGSHOT_KICK_SPEED_MS by design, see comment above

export const REENTRY_LANE_RADIUS_M = 0.016;
export const REENTRY_LANES = [
    { x: -0.14, z: 0.40 },
    { x: 0, z: 0.40 },
    { x: 0.14, z: 0.40 }
]; // 3 lanes near the top wall, matching CONFIG.reentryLaneCount

// ===================================
// Lower-table inlanes/outlanes - real pinball return paths between the slingshots and the
// flippers, plus their dangerous outer-edge counterparts. NOT the same feature as
// REENTRY_LANES above (those are 3 top-of-table lanes, their own distinct mission-tied
// mechanic) - kept fully separate (own metadata.kind values, own mission-free scoring, no
// shared state) to avoid conflating the two.
//
// Geometry derived from ground-truth values read directly off the live scene (Playwright,
// not hand-derived trig) rather than assumed from the flipper's rest-angle math, which is
// easy to get subtly wrong (see createFlipper()'s own rotation-convention caveat elsewhere in
// this file): left flipper's pivot sits at (-0.045, -0.36), its resting mesh center at
// (-0.0515, -0.397), and its extrapolated resting tip around (-0.058, -0.434) - almost
// touching the drain trigger's own inner edge (z=-0.4297, see DRAIN_ZONE_CENTER_Y_PX). The
// left slingshot (x=-0.13) has a real oriented footprint of roughly x=[-0.158,-0.102] once its
// 20-degree rotation is accounted for, and leftWall's inner face sits at x~-0.2267.
//
// Layout (left side; SIDE_LANES' mirror flips everything for the right):
//   [leftWall -0.2267] -- OUTLANE (trigger @ -0.185) -- [divider rail @ -0.145] -- INLANE
//   (trigger @ -0.095, bounded on its inner side by an angled guide tapering from -0.14 down
//   to -0.06 - see INLANE_GUIDE_TOP_X_M/INLANE_GUIDE_BOTTOM_X_M) -- open onto the flipper's
//   own approach beyond that.
// Z runs from LANE_Z_TOP_M (just clear of the slingshot's own footprint) to LANE_Z_BOTTOM_M
// (within the flipper's operating Z range, but the divider/guide both stay far enough out in
// X at every point along their length - divider fixed at 0.145, guide tapering only as far in
// as 0.06, vs the flipper's own -0.058..+0.02 sweep envelope - that neither can ever
// physically overlap the flipper mechanism at any angle). Below LANE_Z_BOTTOM_M, both lanes
// are left open (no wall) - gravity/tilt alone carries an outlane ball into the existing
// full-width drainZone trigger exactly the way any unguided ball past the flippers already
// does today, and an inlane ball - already redirected inward by the guide by this point -
// rolls onto the open playfield directly in front of the flipper.
//
// "Do not make unavoidable drains": which lane (if either) a ball even enters at the top
// depends entirely on its incoming trajectory off the slingshot/bumpers, not a forced funnel -
// nothing upstream of LANE_Z_TOP_M steers the ball toward one side or the other. The divider
// and guide only take over ONCE a ball has already committed to the inlane/outlane region,
// and even then only shape which of the two existing outcomes (flipper approach vs. drain) it
// heads toward - they don't create a new drain path that wasn't already there (any ball past
// the flippers with nothing to stop it was always going to reach the same full-width
// drainZone trigger, lanes or not).
export const LANE_Z_TOP_M = -0.33; // ~0.0175m clear of the slingshot's own lower edge (~-0.3125)
export const LANE_Z_BOTTOM_M = -0.40; // divider rail's far end - see block comment for the X-clearance reasoning
export const LANE_DIVIDER_X_M = 0.145; // mirrored per side
export const LANE_TRIGGER_Z_M = -0.365; // mid-lane, between LANE_Z_TOP_M and LANE_Z_BOTTOM_M
export const INLANE_TRIGGER_X_M = 0.095; // mirrored - inboard of the divider, toward the flipper
export const OUTLANE_TRIGGER_X_M = 0.185; // mirrored - outboard of the divider, toward the wall
export const LANE_TRIGGER_WIDTH_M = 0.03;
export const LANE_TRIGGER_DEPTH_M = 0.025;
// The inlane's own inner guide rail - a real physical wall, not just an open gap. An early
// build left the inlane's inner edge fully open on the theory that gravity/tilt alone would
// carry the ball toward the flipper; verified via Playwright that this was wrong (a ball
// dropped anywhere in the channel just fell straight down in Z with zero X drift and missed
// the flipper entirely, landing in the drain - tilt only accelerates -Z here, nothing biases
// X without an actual collision to redirect it). This angled rail is what actually satisfies
// "inlanes should naturally feed toward their corresponding flipper": it starts almost flush
// with the divider (so the inlane's mouth, right where a ball exits the slingshot area, has no
// gap a ball could fall through untouched) and tapers inward as Z decreases, ending near the
// flipper's own resting reach (left flipper's extrapolated rest-tip sits around x=-0.058 - see
// SIDE_LANES' block comment) - so a ball riding this rail down arrives close enough for the
// flipper to actually reach it, matching how a real inlane guide is shaped, not just labeled.
export const INLANE_GUIDE_TOP_X_M = 0.14; // mirrored - almost flush with LANE_DIVIDER_X_M (0.145)
export const INLANE_GUIDE_BOTTOM_X_M = 0.06; // mirrored - tapers inward to near the flipper's reach
// mirror is a plain position-sign multiplier here (unlike SLINGSHOTS'/BUMPER_CLUSTER's own
// `mirror`, which only flips rotation handedness - their X positions are hardcoded per-entry
// instead) - left is negative X throughout this file (see FLIPPER_GAP_HALF_M's left pivot at
// -FLIPPER_GAP_HALF_M, SLINGSHOTS[0] at x=-0.13), so left must be mirror:-1 against the
// positive-valued LANE_DIVIDER_X_M/INLANE_TRIGGER_X_M/OUTLANE_TRIGGER_X_M constants above.
export const SIDE_LANES = [
    { side: 'left', mirror: -1 },
    { side: 'right', mirror: 1 }
];

// ===================================
// Upper-table LEFT ORBIT / RIGHT ORBIT skill shots - guided routes carrying the ball from
// mid-table up into the upper board and back, scored only on a genuine entrance->completion
// traversal (see orbitState in main() and its handleTriggerHit() branch).
//
// Layout constraint, checked against the real geometry before picking any numbers: a true
// wall-hugging orbit (running right along leftWall/rightWall) does NOT fit on either side of
// this board. leftWall's inner face sits at x~-0.2267, and the mission target bank's own
// outermost target (x=-0.20, TARGET_RADIUS_M=0.014) already reaches to x~-0.214 - only 0.0127m
// of gap, well under the ball's own diameter (BALL_DIAMETER_M=0.027). The mirrored right-side
// gap (rightWall's inner face to the comet's outer edge) is 0.0347m - technically wider than
// the ball but with essentially zero margin, not a reliable guided channel. Both sides were
// measured this way (target/comet radius + position, wall inner face) rather than assumed.
//
// The corridor that DOES have real room on both sides is the inboard one, between Saturn's
// collider and the mission-target-bank/comet: ~0.051m clear on the left (target bank's own
// inner edge to Saturn's edge) and ~0.103m clear on the right (Saturn's edge to the comet's
// inner edge) - both comfortably wider than the ball. Each orbit runs through its side's
// corridor, alongside (not through) the existing target bank/comet/Saturn/bumper cluster -
// nothing about this feature moves or removes any of that existing geometry.
export const ORBIT_RAIL_BOTTOM_Z_M = 0.12; // just above the boss bumper's own footprint (z~0.16-0.03 clearance-wise, see BUMPER_CLUSTER)
export const ORBIT_RAIL_TOP_Z_M = 0.37; // just below the reentry lanes (z=0.40), inside the upper table
export const ORBIT_ENTRANCE_Z_M = 0.15; // inside the rail's guided span, not at its unguided tip
export const ORBIT_COMPLETION_Z_M = 0.35; // ditto, near the rail's top end
export const ORBIT_TRIGGER_WIDTH_M = 0.03;
export const ORBIT_TRIGGER_DEPTH_M = 0.025;
// How long a completion trigger has to fire after its matching entrance before the shot is
// considered stale (a ball that entered, stalled, and rolled back down shouldn't silently
// score if it happens to clip the completion trigger much later on some unrelated pass).
export const ORBIT_COMPLETION_WINDOW_MS = 4000;
export const ORBITS = [
    // Left: rail runs alongside the mission target bank's inner (Saturn-facing) edge.
    { side: 'left', railBottomX: -0.075, railTopX: -0.08, entranceX: -0.078, completionX: -0.08 },
    // Right: rail runs alongside the comet's inner (Saturn-facing) edge, through the wider gap.
    { side: 'right', railBottomX: 0.09, railTopX: 0.1, entranceX: 0.095, completionX: 0.1 }
];

// ===================================
// VISION GATE - SPIRITBALL's signature capture/portal target. A difficult mid/upper-
// playfield scoop: on a valid entry the ball is captured (frozen in place, never lost), a
// short psychedelic reveal sequence plays, then the ball ejects back into play. Full behavior
// lives in main() (visionGate state, startVisionGateCapture()/endVisionGateCapture()) - this
// block is geometry/scoring/timing constants only, so every tunable number lives in one place.
//
// Position checked against every neighboring obstacle's real footprint before picking numbers
// (same discipline as ORBITS' own clearance math above) - this is genuinely the last open
// pocket left on the board: squeezed between the boss bumper (BUMPER_CLUSTER[0], below), the
// power-up orb (POWERUP_POS, left), Saturn's collider (above), and the right orbit's guide
// rail (right). That tightness is a feature, not a compromise - a "difficult" signature shot
// should require real precision, not just be another open target. See buildObstacles() for
// the physical mechanism: a small trigger sphere (the actual capture volume) sits inside a
// 3-post ring - left/right/far posts only, deliberately leaving the near (-Z, bumper-cluster-
// facing) side open as the shot's approach mouth, the same "raised back and sides, open front"
// shape a real pinball scoop has. Posts are real CYLINDER colliders (Havok has no torus
// primitive - confirmed by the existing bumper/Saturn/comet decorative rings in this file
// never getting a PhysicsAggregate at all), so a near-miss clips a post and bounces away
// rather than sailing through untouched.
export const VISION_GATE_POS = { x: 0.045, z: 0.235 };
export const VISION_GATE_RADIUS_M = 0.015; // the actual capture trigger
export const VISION_GATE_COLLAR_RADIUS_M = 0.02; // ring radius the 3 guard posts sit on
// Awarded once per successful capture - deliberately the single biggest configurable bonus on
// the board (bigger than Saturn's 3000, just under a mission completion's 5000), matching a
// signature feature's weight. Kept as its own named constant, not folded into MISSION_
// COMPLETE_BONUS or SCORE_SATURN, specifically so it stays independently tunable.
export const SCORE_VISION_GATE = 4000;
// Total capture->eject duration. Short enough to stay "a beat," not a cutscene - about 3x a
// mission-complete's own camera beat (500ms), the biggest existing moment on the board, since
// this is meant to read as bigger still without genuinely interrupting pinball flow.
export const VISION_GATE_SEQUENCE_MS = 1800;
// Debounces the entry trigger itself, on top of the visionGate.active state guard (see
// main()) - two independent layers, not one. Deliberately set LONGER than VISION_GATE_
// SEQUENCE_MS, not just "a normal debounce window" - it's set once, at the moment capture
// starts, and needs to still be covering the trigger mesh at the moment the ball is ejected
// back into real physics right next to it (see endVisionGateCapture()). Without that margin,
// the cooldown from the ORIGINAL entry would already have expired by eject time, and a ball
// that hasn't yet physically cleared the trigger's small radius could immediately re-arm a
// second capture on itself.
export const COOLDOWN_VISION_GATE_MS = VISION_GATE_SEQUENCE_MS + 300;
export const VISION_GATE_EJECT_SPEED_MS = 550 * PX_TO_M; // ~0.519 m/s eject kick
export const HEX_VISION_GATE = 0xaa00ff; // vivid violet - "third eye" adjacent to COLOR_CHAKRA's own palette (which the capture sequence cycles through) without duplicating any single existing identity color

// ===================================
// Plunger / launch lane (babylon-prompts/05-*.md). Per that stage's own recommendation, this
// is a kinematic-animated plunger mesh (no physics body of its own) plus a directly-set ball
// velocity on release - not a simulated spring - for the same determinism reasons the 2D
// version (CONFIG.plungerMinPower/plungerMaxPower, updatePlunger()/launchBall() in
// ../index.js, hardened in archive/release-prompts/13-*.md) kept its launch mechanic simple.
// ===================================

// Launch lane position/size, ported from setupPlunger()'s launchPort rectangle and
// resetBall()'s ball-rest position in ../index.js (2D CONFIG-space pixels), not redesigned.
export const BALL_REST_X_PX = 470; // matches resetBall()'s (CONFIG.width-70, CONFIG.height-220) exactly
export const BALL_REST_Z_PX = 740;
// The ball's actual rest position in world space - used directly for its spawn/reset
// position, NOT plunger.baseZ (see PLUNGER_REST_Z_M's comment for why those two used to be,
// wrongly, the same value). Y is the ball's radius plus a small clearance above the playfield
// floor (Y=0, see buildTable()'s playfield comment), same clearance reasoning as the
// flipper's FLIPPER_PLAYFIELD_CLEARANCE_M - previously a hardcoded 0.03, floating the ball
// ~1.65cm above where it actually needed to rest.
export const BALL_REST_Z_M = toWorldZ(BALL_REST_Z_PX);
export const BALL_REST_Y_M = BALL_DIAMETER_M / 2 + 0.002;
// The lane's only wall that didn't already exist: rightWall (see buildTable()) already forms
// the lane's outer edge, but nothing separated it from the main playfield on the inner side.
// NOT derived from setupPlunger()'s launchPort rectangle (center 495, width 50, "inner edge"
// at 470, same as BALL_REST_X_PX) - confirmed that rectangle is purely decorative in the 2D
// game (setupPlunger() never calls physics.add.existing() on it, unlike every real wall in
// setupTable()), so reusing 470 for a genuine physics wall here would put the ball resting
// flush against it with zero clearance. Node-verified: needs >= ball radius (0.0135m) + this
// wall's own half-thickness (~0.0038m) =~0.017m of clearance from BALL_REST_X_PX; picked 30px
// (~0.028m) for a comfortable margin, which also reads as a believably real-width lane.
export const LANE_INNER_WALL_X_PX = BALL_REST_X_PX - 30; // 440
// Bug fix (reported: ball gets stuck in the chute on mobile, never reaching the main table) -
// was 500 ("a bit past the old decorative port's own 535-785 span for margin"), meaning the
// ball had to coast ~0.227m from its rest position to the lane's exit while the tilted table's
// gravity constantly decelerates it back toward the flippers the whole way. Confirmed via
// Playwright (real launch-button taps, and a direct launch-velocity sweep from a bare-minimum
// charge up through full charge) that even a FULL-power launch routinely fell short of that
// exit point and rolled all the way back to rest - not just a weak-tap edge case, a launch-
// lane-length problem: idealized (frictionless) physics already showed PLUNGER_MIN_POWER_MS
// sits at barely 93% of the bare velocity needed to reach the old exit point, meaning literally
// any real friction at all was enough to fail it. Shortened to 650 (~0.085m of required travel,
// down from ~0.227m) - re-verified via the same sweep that this reliably clears at every real
// charge level, including a bare instant tap, with real margin to spare. Also moves the lane's
// exit to a Z position further from the center bumper cluster (nearest bumper at z=-0.02,
// world), reducing how likely a ball that's still carrying leftover leftward drift is to
// immediately re-collide with it on exit.
export const LANE_WALL_Z_TOP_PX = 650;
export const LANE_WALL_Z_BOTTOM_PX = 830;

export const PLUNGER_CHARGE_TIME_MS = 2000; // same charge window as CONFIG.plungerChargeTime
// Power range originally ported from CONFIG.plungerMinPower/plungerMaxPower (700/1600 px/s)
// via the same PX_TO_M scale used for MAX_BALL_SPEED_MS in 03-*.md - these become target ball
// speeds in m/s, directly set on release (not an impulse - see the block comment above),
// consistent with how updateBallPhysics()'s anti-stuck kick already sets velocity directly
// rather than applying a force/impulse.
//
// MIN raised from 700 to 900 (bug fix: ball gets stuck in the launch lane, never reaching the
// main table - see LANE_WALL_Z_TOP_PX's comment for the full investigation). The tilted
// table's gravity decelerates the ball the entire time it's coasting up the lane, and 700 left
// essentially zero margin even against idealized frictionless physics - confirmed via
// Playwright that a bare-minimum-charge launch (the realistic "quick tap" case, not a
// deliberate edge case) consistently fell short and rolled all the way back, even after
// shortening the lane itself. 900 was verified (direct launch-velocity sweep) to clear the
// shortened lane with a real, repeatable margin (~0.10-0.13m to spare, not a hair's-width
// pass). MAX stays at 1600 - already comfortably clears with room to spare, and raising it
// further would start colliding with MAX_BALL_SPEED_MS's anti-tunneling ceiling for little
// benefit.
export const PLUNGER_MIN_POWER_MS = 1200 * PX_TO_M; // ~1.13 m/s
export const PLUNGER_MAX_POWER_MS = 1600 * PX_TO_M; // ~1.51 m/s - comfortably under MAX_BALL_SPEED_MS
// launchBall()'s horizontal kick (-(150 + power*0.08)) ported the same way: a fixed base plus
// a ratio of the power itself, so proportionally weaker/stronger launches still curve the same
// relative amount.
export const PLUNGER_HORIZONTAL_BASE_MS = 150 * PX_TO_M;
export const PLUNGER_HORIZONTAL_RATIO = 0.08;

// ===================================
// Upper-lane skill shot (user-requested) - turns the plunger's existing variable charge
// power into an actual mechanic: three small lanes just past the shooter lane's exit, in the
// real gap between the bumper cluster's two rows (BUMPER_CLUSTER has one bumper at z=-0.02
// and a pair at z=0.06 - this sits at z=0.02, comfortably clear of both), reward depending on
// which one the ball's first clean launch passes through.
//
// The geometry below was chosen by direct trajectory sampling (Playwright: launching the
// ball at a spread of real charge durations and recording its actual position over time),
// the same empirical-not-assumed approach this file already uses for its guide-rail/orbit-
// rotation geometry - NOT by retuning any plunger constant (PLUNGER_MIN_POWER_MS/MAX_POWER_MS/
// HORIZONTAL_BASE_MS/HORIZONTAL_RATIO above are all untouched). That sampling turned up
// something genuinely useful for the "full power shouldn't be optimal" requirement: a bare-
// minimum tap AND a full-power launch both consistently landed in the easiest, outermost
// lane, while only a calibrated MID-range charge reliably reached the two better, more
// central lanes - so holding for maximum power is not the winning strategy here, a
// deliberately-timed medium charge is.
// ===================================
export const SKILL_SHOT_WINDOW_MS = 2500; // short, per the request - how long the window stays armed after a launch
export const SKILL_SHOT_Z_M = 0.02;
export const SKILL_SHOT_DEPTH_M = 0.03;
export const SCORE_SKILL_SHOT_SUPER = 2500; // hardest to reach (innermost lane) - biggest reward
export const SCORE_SKILL_SHOT_MID = 1500;
export const SCORE_SKILL_SHOT_SAFE = 800; // where both a weak tap and a full-power launch tend to land
export const SKILL_SHOT_LANES = [
    { x: 0.04, halfWidth: 0.02, label: 'SUPER SKILL SHOT', points: SCORE_SKILL_SHOT_SUPER },
    { x: 0.08, halfWidth: 0.02, label: 'SKILL SHOT', points: SCORE_SKILL_SHOT_MID },
    { x: 0.125, halfWidth: 0.025, label: 'LAUNCH SHOT', points: SCORE_SKILL_SHOT_SAFE }
];

// ===================================
// Fairness mechanics (user-requested): BALL SAVE and OUTLANE KICKBACK. Both integrate into
// the existing handleDrain()/handleTriggerHit() paths in main() rather than duplicating any
// drain/scoring logic - see their own comments there for exactly how.
// ===================================
// BALL SAVE - a short grace window that arms on every launch (handleLaunchRelease()): a
// drain within it returns the ball instead of costing a life. "Limit abuse/retriggering" is
// enforced by ballSave.usedThisLife (main()) - once a save is used, it does NOT re-arm on
// the very next launch; only a genuine (unsaved) drain, or a new game, restores the
// opportunity for the next life.
export const BALL_SAVE_WINDOW_MS = 7000; // "short configurable period" - typical real-machine ball-save length
// Brisk and clearly distinct from a real drain's own ~1500ms pre-decision delay (handleDrain()) -
// a save should read as "whew, saved," not as the same somber beat as losing a ball.
export const BALL_SAVE_RETURN_DELAY_MS = 700;

// OUTLANE KICKBACK - one outlane (SIDE_LANES' side value below) gets a kickback solenoid,
// earned by clearing the rollover-lane bank (see the 'reentryLane' bank-complete branch in
// main()) and consumed the next time a ball rolls that specific outlane, kicking it back
// in and deactivating. Direction is derived from SIDE_LANES' own mirror value for that side
// (see applyKickback() in main()), not hardcoded, so flipping this one constant to 'right'
// would move the whole mechanism with no other changes needed.
export const KICKBACK_SIDE = 'left';
export const KICKBACK_INWARD_SPEED_MS = 550 * PX_TO_M; // pushes the ball back toward center X
export const KICKBACK_UPTABLE_BIAS_MS = 500 * PX_TO_M; // +Z boost, same "guarantee real forward progress" role as SLINGSHOT_KICK_UPTABLE_BIAS_MS

// How far the plunger tip sits behind the ball's true rest spot (toWorldZ(BALL_REST_Z_PX),
// used directly for the ball's own spawn/reset position - NOT plunger.baseZ, which used to be
// the same value and meant the ball spawned inside the plunger's own collision volume once
// the plunger got real physics - see createPlunger()'s comment and
// improvement-prompts/02-*.md's investigation). Needs >= the plunger cylinder's own
// half-length (0.015m) + the ball's radius (0.0135m) =~0.0285m of clearance so the two don't
// overlap at rest; picked -0.035 for a small safety margin beyond that minimum (same
// reasoning as LANE_INNER_WALL_X_PX's margin above) - the ball settles the last ~6.5mm onto
// the plunger's tip under gravity after spawning, rather than needing to spawn flush against
// it (which would risk a spawn-time overlap explosion, the same failure mode the flipper
// investigation found with FLIPPER_PLAYFIELD_CLEARANCE_M).
export const PLUNGER_REST_Z_M = -0.035;
export const PLUNGER_TRAVEL_M = 0.045; // from the ball at rest, and how far it pulls back at full charge

// ===================================
// Scoring, collision/trigger detection, and the drain zone (babylon-prompts/06-*.md).
//
// SCOPE DECISION made back in Stage 6, now superseded: the full mission FSM in ../index.js
// (mission select/start/complete/abort, fuel depletion, rank-up, the mission-target-selects-
// mission flow) was deferred every stage since because it needed real UI to show it. Stage 12
// built that UI (backglass, HUD) but still didn't build the FSM itself - see
// improvement-prompts/05-mission-fsm-and-rank-system.md, implemented below (mission
// select/progress/complete + rank state live on the `mission` object and backglass.state,
// declared further down where `stats`/`backglass` are in scope).
//
// Point values ported directly from CONFIG.scores in ../index.js (not redesigned).
export const SCORE_ATTACK_BUMPER = 500;
export const SCORE_BOSS_BUMPER = 1200; // one bumper in the cluster is a bigger "boss" variant (board redesign) - worth notably more
export const SCORE_COMET = 1000; // was SCORE_SATELLITE - renamed alongside the satellite->comet reskin
export const SCORE_MISSION_TARGET = 750;
// Drop-target bank upgrade - a separate, one-time bonus for dropping all of MISSION_TARGET_
// BANK, on top of (not instead of) each individual target's own SCORE_MISSION_TARGET hit.
// Deliberately not folded into MISSION_COMPLETE_BONUS or the mission FSM at all - the bank
// and the mission-select system are two independent mechanics that happen to share the same
// three meshes (see dropMissionTarget()'s comment in main()).
export const SCORE_TARGET_BANK_COMPLETE = 2500;
export const SCORE_REENTRY_LANE = 2000;
// Rollover-lane bank upgrade (user-requested) - a separate, configurable bonus for lighting
// all of REENTRY_LANES, on top of each individual lane's own SCORE_REENTRY_LANE hit.
// Deliberately independent of mission.progress/MISSION_COMPLETE_BONUS (see laneBank's own
// block comment in main() - "so it can later feed multiplier progression" is the whole
// reason this stays a separate constant/counter rather than folding into the mission FSM).
export const SCORE_LANE_BANK_COMPLETE = 3000;
// How long the bank stays visibly all-lit before resetLaneBank() clears it for another cycle
// - long enough to read as a deliberate "you did it" beat, not an instant flicker.
export const LANE_BANK_RESET_DELAY_MS = 400;
export const SCORE_SLINGSHOT = 100;
export const SCORE_SATURN = 3000; // the new giant Saturn centerpiece - the single biggest non-mission scoring hit on the board, matching its size/prominence
export const MISSION_COMPLETE_BONUS = 5000;
export const SCORE_INLANE = 300;
// Outlane rollover deliberately scores MORE than the inlane, not less - a common real-pinball
// choice (the ball is very likely about to drain down that path with no ball-save/kickback
// implemented yet to rescue it), so the outlane isn't purely a punishment with zero upside.
export const SCORE_OUTLANE = 500;
// Awarded only on a completed entrance->completion traversal (see orbitState in main()) - a
// genuine skill shot, worth notably more than any single obstacle hit but less than Saturn or
// a mission completion. Shared by both sides - leftOrbitShots/rightOrbitShots track which side
// separately, the point value itself doesn't need to differ between them.
export const SCORE_ORBIT = 1500;

// ===================================
// Traditional pinball bonus/multiplier subsystem (user-requested) - a classic end-of-ball
// "bonus count." Points quietly accumulate in ballBonus.points (main()) during play, from
// major shots and mission completions at their own call sites below, multiplied by
// ballBonus.multiplierX (advanced by clearing the rollover-lane bank), and only actually
// added to the real score - via a rapid, visible count-up - when the ball drains (see
// startBonusCount() in main()). None of this touches any existing base obstacle score
// constant above (SCORE_ATTACK_BUMPER etc.) or the mission/rank FSM - every contribution
// here is purely additive, alongside the normal addScore() call each hit already makes.
// ===================================
export const BONUS_MULTIPLIER_MAX = 5;
// "Substantial" per the request - notably bigger than a single major-shot contribution,
// since completing a whole mission is a bigger achievement than one good shot.
export const BONUS_MISSION_COMPLETE_AMOUNT = 3000;
// Major shots: the board's biggest, most deliberate hits (Saturn, a completed orbit, a
// Vision Gate capture) - NOT ordinary bumper/lane/target hits, which stay bonus-free so the
// pool specifically rewards genuine skill shots, not routine scoring.
export const BONUS_MAJOR_SHOT_AMOUNT = 500;
// Fixed tick count regardless of the actual total, so the count-up's timing stays
// predictable and brisk no matter how big the bonus got.
export const BONUS_COUNT_TICKS = 16;
export const BONUS_COUNT_TICK_MS = 45; // ~720ms for the full sequence at BONUS_COUNT_TICKS ticks - brisk per the request
// Reduced motion: skip the tick sequence entirely and award the whole bonus in one step -
// this is just how long the single resulting message stays legible before continuing.
export const BONUS_COUNT_REDUCED_MOTION_MS = 150;

// ===================================
// Lightweight combo scoring (user-requested) - short chains of already-scored "major shot"
// events (orbit completions, comet hits, Vision Gate captures, bumper hits, a cleared
// rollover-lane bank), each within a short, per-combo time window. Deliberately NOT another
// mission FSM: COMBO_DEFS is a flat, data-driven list matched by one small, generic state
// machine (advanceCombo() in main()) shared by every entry - adding a new combo means adding
// one entry here (plus, if its event type is new, one recordComboShot() call at whatever
// existing hit site already scores it), never new collision/trigger architecture. A step can
// be a single type string (exact match) or an array of type strings (match any of them) - see
// 'BANK RUSH' below, whose second step accepts either orbit side.
// ===================================
export const COMBO_ORBIT_TYPES = ['orbitLeft', 'orbitRight']; // "any orbit side" - the rollover-bank-into-orbit combo's second step
export const COMBO_STEP_WINDOW_MS = 2500; // default per-step time budget between two consecutive combo steps
// BUMPER-BUMPER-BUMPER needs a tighter per-step window than the default - matching a genuine
// rapid-fire triple rather than three incidental hits minutes apart.
export const COMBO_TRIPLE_STEP_WINDOW_MS = 1800;
// How soon after one combo completes the next one must start to escalate the combo TIER
// (COMBO x2, x3...) instead of resetting back to x1 - independent of any single combo
// definition's own per-step window above.
export const COMBO_CHAIN_WINDOW_MS = 4000;
export const COMBO_MAX_TIER = 5;
export const COMBO_BASE_SCORE = 800; // tier-1 award; scales linearly by tier, see fireCombo() in main()
export const COMBO_MESSAGE_MS = 900;

// The two ORBIT SWITCH entries track independently (each is just its own {index, lastAtMs}
// cursor over the same shared shot stream, see advanceCombo() in main()) - on a real
// alternating L/R/L/R run, both directions legitimately complete in an overlapping,
// roughly-every-shot cadence. That's intentional, not a double-count bug: the user's spec
// lists LEFT->RIGHT and RIGHT->LEFT as two separate combos, and rewarding sustained
// alternation this way is a standard real-pinball "combo train" pattern, not noise.
export const COMBO_DEFS = [
    { name: 'ORBIT SWITCH', steps: ['orbitLeft', 'orbitRight'], stepWindowMs: COMBO_STEP_WINDOW_MS },
    { name: 'ORBIT SWITCH', steps: ['orbitRight', 'orbitLeft'], stepWindowMs: COMBO_STEP_WINDOW_MS },
    { name: 'COMET GATE', steps: ['comet', 'visionGate'], stepWindowMs: COMBO_STEP_WINDOW_MS },
    { name: 'TRIPLE BUMPER', steps: ['bumper', 'bumper', 'bumper'], stepWindowMs: COMBO_TRIPLE_STEP_WINDOW_MS },
    { name: 'BANK RUSH', steps: ['laneBankComplete', COMBO_ORBIT_TYPES], stepWindowMs: COMBO_STEP_WINDOW_MS }
];

// Rank names ported from the classic "3D Pinball for Windows - Space Cadet" progression this
// table's own layout is explicitly modeled on (see buildObstacles()'s "authentic
// Space-Cadet-inspired" comment) - the same rank ladder archive/KNOWN_ISSUES.md item 3
// references ("LT Commander -> Fleet Admiral", ranks 4-8 there matching indices 4-8 here).
export const RANK_NAMES = [
    'Cadet', 'Ensign', 'Lieutenant JG', 'Lieutenant', 'Lt. Commander',
    'Commander', 'Captain', 'Commodore', 'Admiral', 'Fleet Admiral'
];

// One mission slot per mission-target index (0-2, see MISSION_TARGET_BANK), each tied to a
// distinct scoring category so progress can only come from deliberate play toward the
// selected mission, not incidental hits of other types - the spirit of the original
// CONFIG.missions[rank][index] table (archive/KNOWN_ISSUES.md items 3 and 5) without its
// separate launch-ramp "start" step, which has no equivalent object in this 3D build (a
// mission-target hit selects AND starts in one action here - a deliberate simplification,
// not an oversight).
export const MISSION_DEFS = [
    { type: 'bumper', name: 'BUMPER RUN' },
    { type: 'comet', name: 'COMET CHASE' }, // was 'satellite'/'SATELLITE SWEEP' - renamed alongside the board redesign's satellite->comet reskin
    { type: 'lane', name: 'RE-ENTRY CIRCUIT' }
];
export function missionRequiredCount(rank) {
    return 3 + rank; // scales with rank so later missions take deliberately more effort
}

// Cooldown durations ported from setupCollisions()'s setCooldown() calls in ../index.js.
export const COOLDOWN_BUMPER_MS = 300;
export const COOLDOWN_COMET_MS = 400; // was COOLDOWN_SATELLITE_MS
export const COOLDOWN_SLINGSHOT_MS = 200;
export const COOLDOWN_MISSION_TARGET_MS = 500;
export const COOLDOWN_REENTRY_LANE_MS = 1000;
export const COOLDOWN_SATURN_MS = 500; // new giant Saturn - a bit longer than the regular bumpers, matching its "big, deliberate hit" feel rather than rapid-fire pinging
export const COOLDOWN_SIDE_LANE_MS = 600; // shared by all 4 new inlane/outlane rollovers, same one-constant-per-mechanic pattern as COOLDOWN_REENTRY_LANE_MS
export const COOLDOWN_ORBIT_MS = 600; // shared by all 4 orbit entrance/completion triggers
// Not present in the 2D cooldown map (walls/flippers there fire shake unconditionally, every
// physics-substep-worth of contact) - added here (Stage 10) specifically to keep grinding
// contact from shaking the camera every single frame, matching the doc's own "don't add
// camera effects for every single event if it starts feeling noisy" constraint.
export const COOLDOWN_WALL_MS = 150;
export const COOLDOWN_FLIPPER_MS = 150;

// Drain zone, ported from setupDrainZone() in ../index.js (2D px: center x=270 (table
// center), y=1010 (50px past the table's bottom edge), width=540, height=150). The 3D table
// boundary (buildTable()) was already built with no "bottom wall" - Stage 2 faithfully ported
// setupTable()'s 7 walls, none of which close off the bottom, matching the 2D game's actual
// open gap between the flippers for the ball to drain through. This trigger volume is what
// catches it on the far side of that gap, well past FLIPPER_Z_M (-0.36).
export const DRAIN_ZONE_WIDTH_M = TABLE_WIDTH_M;
export const DRAIN_ZONE_DEPTH_PX = 150;
export const DRAIN_ZONE_CENTER_Y_PX = 1010;

export const STARTING_LIVES = 3; // ported from CONFIG.startingLives

// ===================================
// Visual identity (babylon-prompts/07-*.md) - SPIRITBALL's actual DMT/cosmic/chakra palette,
// ported directly from CONFIG.colors in ../index.js (hex -> BABYLON.Color3, /255 per
// channel), not redesigned.
//
// hexToColor3() converts a raw hex int into a real BABYLON.Color3 - deliberately NOT called at
// this module's own top-level scope (only the raw HEX_* numbers below are constant-evaluated
// here, safe with no BABYLON reference). babylon-game.js calls hexToColor3() once per color,
// inside main(), only after confirming BABYLON is actually loaded (see the "Populate deferred
// COLOR_* constants" block there, and the `let COLOR_*` declarations just above it) - a
// top-level `new BABYLON.Color3(...)` call would evaluate at script-parse time and throw an
// unguarded ReferenceError if the Babylon vendor bundle failed to load, defeating this
// project's whole load-failure error-handling effort before it even registers (see
// 04-*.md's implementation note for how this was learned the hard way).
// ===================================
export function hexToColor3(hex) {
    return new BABYLON.Color3(
        ((hex >> 16) & 0xff) / 255,
        ((hex >> 8) & 0xff) / 255,
        (hex & 0xff) / 255
    );
}

export const HEX_BALL = 0xffffff;
export const HEX_EYEBALL = 0x00ffff;
export const HEX_FLIPPER = 0xff00ff;
export const HEX_WALL = 0x00ccff;
export const HEX_BUMPERS = [0xff0099, 0x00ffff, 0xff00ff, 0xffff00];
export const HEX_CHAKRA = [0x9400d3, 0xff1493, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0x8b00ff];
export const HEX_SATURN = 0xffa500;
export const HEX_SATURN_RING = 0xffd700;
// Icy cyan-white - a deliberately distinct identity from HEX_SATURN/HEX_SATURN_RING (gold/
// orange) now that those colors belong to the real giant Saturn centerpiece; the re-themed
// comet needed its own look, not a second "Saturn-colored" object on the board.
export const HEX_COMET = 0x66e0ff;
export const HEX_MISSION_ACTIVE = 0x00ff00;
// Classic amber/gold pinball insert-lamp color - deliberately distinct from HEX_MISSION_ACTIVE
// (green), so the new inlane/outlane lamps read as their own thing, not a re-skin of the
// reentry lanes' mission-tied "lit" state (a genuinely different mechanic, see SIDE_LANES'
// block comment).
export const HEX_LANE_LAMP = 0xffaa00;
// Electric cyan-white - the orbit lamps' own identity, distinct from HEX_LANE_LAMP's amber
// (inlane/outlane) and HEX_MISSION_ACTIVE's green (reentry lanes), so the board's three
// "lit insert" mechanics each read as visually distinct at a glance.
export const HEX_ORBIT_LAMP = 0x33ccff;
// Hot red-pink - the upper-lane skill shot's own identity (user-requested), distinct from
// every other "lit insert" color on the board (amber lane lamps, cyan orbit lamps, green
// mission-active), so a lit skill-shot lane reads as its own thing at a glance.
export const HEX_SKILL_SHOT_LAMP = 0xff3366;
// Fairness mechanics (user-requested) - two more distinct "lit insert" identities. Cool
// spring-green for ball save (a reassuring, "you're safe" color - distinct from
// HEX_MISSION_ACTIVE's green by being noticeably cooler/lighter) and a hot orange-red for
// kickback (reads as "loaded/armed," distinct from every warm color already in use).
export const HEX_BALL_SAVE_LAMP = 0x00ffcc;
export const HEX_KICKBACK_LAMP = 0xff5500;
export const HEX_BACKGROUND = 0x1a0033;
