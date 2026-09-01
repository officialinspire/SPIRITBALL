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
// Board-circulation tuning pass (user-requested, measured): 6.5 -> 6.0. Down-table gravity is
// 9.8*sin(tilt), so this trims the climb penalty ~8% (1.109 -> 1.025 m/s^2), which measurably
// raised how often a flipper shot carries into the upper third without making the ball floaty -
// balls still drain in the large majority of trials and average ball life did NOT increase.
// Deliberately a small step: 5.5 and 5.0 were both measured and were WORSE (the ball dribbles
// instead of returning cleanly), so this is not "less tilt is better".
export const TABLE_TILT_DEGREES = 6.0;
export const TILT_RAD = (TABLE_TILT_DEGREES * Math.PI) / 180;
export const GRAVITY_VECTOR_FN = () => new BABYLON.Vector3(
    0,
    -9.8 * Math.cos(TILT_RAD),
    -9.8 * Math.sin(TILT_RAD) // pulls the ball toward -Z, i.e. toward the flipper end
);

export const BALL_DIAMETER_M = 0.027;
export const BALL_MASS_KG = 0.08;

// Ball-feel tuning pass (user-requested - "playtest and tune SPIRITBALL's general ball feel").
// Previously inline literals (restitution: 0.65, friction: 0.35) in createBall()'s
// PhysicsAggregate call; pulled out here, same "one place to retune" reasoning as the flipper
// pass's FLIPPER_RESTITUTION/FLIPPER_FRICTION.
//
// BALL_FRICTION addresses a demonstrated, reproducible problem: a ball given ordinary rolling
// velocity in open, level playfield decayed to a fraction of its speed far faster than a real
// low-friction ball-on-lacquered-wood table would (measured: a 0.6 m/s lateral roll fell to ~15%
// of that speed within 800ms at the old 0.35; 0.08 retains ~29% over the same window) - a real,
// direct win for "retain momentum through lanes". On a surface tilted at TABLE_TILT_DEGREES
// (6.5 deg), 0.08 also sits below tan(6.5 deg) ~= 0.114, so static friction alone can no longer
// explain a ball refusing to start rolling downhill from rest. Confirmed via Havok's own vendored
// source (PhysicsShape.setMaterial()'s default frictionCombine = MINIMUM) that the ball's own
// friction value alone governs every ball<->surface pairing where it's the lower of the two (true
// for every surface in this file except the flipper's own passive FLIPPER_FRICTION, which is
// lower still) - so this one constant was the actual lever, not PLAYFIELD_FRICTION.
//
// IMPORTANT caveat, found by the anti-stuck audit pass right after this one: lowering this alone
// does NOT eliminate every case of a ball freezing at exactly zero velocity from a dead stop -
// a SEPARATE, still-unexplained resting-contact behavior (confirmed to survive this friction
// value unchanged, and to survive explicitly disabling Havok body sleep via
// PhysicsActivationControl.ALWAYS_ACTIVE too - neither changed the measured freeze at all) can
// still hold a ball motionless long enough to trip STUCK_TIME_THRESHOLD_MS from a genuine dead
// start. That specific edge case never reproduced in any more realistic scenario tested (a moving
// roll, a corner shot, a wall rebound), and the existing anti-stuck kick already recovers it
// correctly, so it's left as a known, mitigated characteristic - see updateBallPhysics()'s own
// comment (STUCK_KICK_CENTERWARD_MS etc.) for the anti-stuck pass this caveat belongs to.
//
// BALL_RESTITUTION: Havok's default restitutionCombine is MAXIMUM (same vendored-source check),
// meaning the ball's OWN restitution was the effective FLOOR for every surface it touches,
// including the flat playfield (playfield's own 0.2 was being overridden up to the ball's 0.65
// on every contact) - part of why a resting/settling ball could still be seen doing several
// bounce-and-correct cycles before friction let it lie still. Lowered from 0.65 to 0.35 - still a
// genuinely bouncy ball off walls/rails (whose own restitution, 0.3-0.5, mostly governs those
// contacts once the floor isn't artificially raising the baseline), but no longer forces every
// softer surface (playfield 0.2, bumpers/comet/saturn already have their OWN much higher values
// and are unaffected either way) up to a superball-like bounce it never asked for.
// Board-circulation tuning pass: 0.35 -> 0.45. Havok combines restitution with MAXIMUM (see
// this constant's own note above), so raising the BALL's own value is what actually governs how
// much speed survives a bounce off anything softer than it - walls (0.3), flippers (0.3), the
// playfield (0.2). Measured effect on 42 distinct flipper shots: shots reaching the upper third
// 2% -> 12%, with scoring-object contacts per ball unchanged (~2.0) and the drain rate slightly
// UP (81% -> 88%), i.e. livelier circulation without becoming floaty. 0.50 was also measured and
// was worse on every metric, so this is not simply "bouncier is better".
//
// Ball-movement tuning pass (user-requested - "a lively steel pinball rolling across a polished
// machine"): 0.45 -> 0.55. This is the ONLY constant that pass changed; the measurement rig that
// justified it is qa/ball-movement.js, which reports every number quoted here.
//
// Why this constant and not the other three candidates:
//   - Rolling decay and downhill acceleration were measured FIRST and are already essentially
//     ideal: 0.717 m/s^2 downhill against a theoretical maximum of 0.7317 for a rolling solid
//     sphere at 6 degrees (98.0%), and 97.5% gravity-corrected speed retention per second of
//     free rolling. There was nothing for BALL_FRICTION or TABLE_TILT_DEGREES to recover there.
//   - The ball's angularDamping is 0.1 (a Havok/Babylon body default, never set anywhere in this
//     repo). Zeroing it was measured and is deliberately NOT done: it pushes free-roll retention
//     to 99.9%/s, which is the "floaty/frictionless" failure mode this pass was asked to avoid.
//     That default damping is what makes the ball lose energy GRADUALLY, so it stays.
//   - Restitution was the one lever that moved the two symptoms that were actually wrong.
//
// Measured, before -> after (identical deterministic rig, physics stepped at a fixed 1/60):
//   head-on rebound off the outer wall  33-40%  -> 40-46% of incoming speed
//     (the rig fires three speeds at the wall and reports whichever land a clean head-on
//      impact, so a given run may print a narrower range than this - the floor is what moved)
//   average speed over a whole ball     0.445   -> 0.595 m/s   (+34%)
//   frames spent below 0.1 m/s          12.5%   -> 0.0%        (the "sticky" feel, gone)
//   downhill acceleration               0.717   -> 0.717 m/s^2 (unchanged, already ideal)
//   free-roll retention                 97.5%/s -> 97.5%/s     (unchanged, still loses energy)
//   airborne frames                     0.0%    -> 0.0%        (superball guard: no floor hopping)
//
// KNOWN TENSION, recorded rather than hidden: this partly reverses the previous pass's finding
// just above. A flipperless ball now drains in ~2.05s instead of ~2.90s, and that pass rejected
// 0.50 for exactly that reason. The two passes measured different things and both are right -
// that one scored "shots reaching the upper third" and drain RATE, this one scored rebound
// retention and time spent nearly stationary. Some of the shorter ball life is dead time being
// removed rather than difficulty being added: the 0.45 ball spent 12.5% of every ball under
// 0.1 m/s, which is where the "heavy/sluggish" feel came from. If ball life turns out to matter
// more than liveliness in playtest, BALL_FRICTION 0.08 -> 0.05 was also measured and buys a
// similar speed gain (avg 0.642 m/s) for a smaller drain cost (~2.35s) - but it does nothing for
// rebound, which is why it is not the one chosen here.
export const BALL_RESTITUTION = 0.55;
export const BALL_FRICTION = 0.08;

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
//
// Flipper-to-ball energy-transfer pass (user-requested, measured): 1800 -> 2700 px/s
// (1.70 -> 2.55 m/s). Raised as a SAFETY ceiling, not as a gameplay knob - it is still the only
// per-body anti-tunneling defense this build has, and it still clamps every velocity source.
//
// Why this constant moved and FLIPPER_CONTACT_VELOCITY_TRANSFER did not. That pass was asked to
// grade shot strength by contact point: base modest, midpoint strong, tip strongest. Measured
// exit speed at a real rolling contact, by contact radius along the bat:
//
//   transfer  base(24%)   mid(59%)   tip(89%)     with the 1.70 ceiling applied
//   2.4        0.729       1.679      4.833  ->   0.729 / 1.679 / 1.700
//
// The natural spread is already 1 : 2.3 : 6.6, which is exactly the requested gradient - the
// ceiling was flattening the top of it, putting mid (1.679) and tip (1.700) within 1% of each
// other so timing carried no information. And because transfer is a plain linear gain, it scales
// base/mid/tip together and CANNOT restore that spread: at 1.70 every value >= 2.4 pins both mid
// and tip, and low enough values to leave headroom make every shot weak. So the required increase
// to FLIPPER_CONTACT_VELOCITY_TRANSFER measured as exactly zero, and it is left at 2.4.
//
// At 2.55 the same three contacts read 0.729 / 1.679 / 2.550 - 29% / 66% / 100% of the ceiling,
// a gradient a player can actually feel. Flipper-strike reach (qa/circulation-suite.js, n=8):
// mean best-Z 0.075 -> 0.138, best Z 0.186 -> 0.332.
//
// Why 2.55 and not higher: 3.40 measured the same mean reach (0.138) for less anti-tunneling
// margin, so it buys nothing. The ceiling was chosen against a direct tunneling probe - 40 shots
// per speed, fired at the walls from five positions in eight directions:
//   1.70 m/s (2.1 ball-radii/frame)  0/40 escaped
//   2.55 m/s (3.1 ball-radii/frame)  0/40 escaped   <- shipped
//   3.40 m/s (4.2 ball-radii/frame)  0/40 escaped
//   5.10 m/s (6.3 ball-radii/frame)  1/40 escaped   <- ball reached x=0.284, past the 0.227 wall
//
// SCOPE NOTE, recorded rather than hidden: this ceiling is shared, so raising it also lets the
// pop bumpers and slingshots push a ball past 1.70 where they previously could not. No kick force
// was modified (BUMPER_KICK_SPEED_MS and friends are untouched) - the same clamp is simply
// clamping less often. The plunger is unaffected either way: PLUNGER_MAX_POWER_MS is 1.51 m/s,
// already under the old ceiling.
export const MAX_BALL_SPEED_MS = 2700 * PX_TO_M; // ~2.55 m/s

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

// Anti-stuck audit (user-requested - "safety net, not visible gameplay mechanic... small
// deterministic escape... downhill bias... minimal vertical component... avoid obvious random
// teleport/kick behavior"). The escape used to be Math.random()*STUCK_KICK_X_RANGE_MS (a
// randomized +/- sideways component) plus a 0.15 m/s vertical hop - both read as an obvious,
// non-physical "reset" the instant they fired (0.15 m/s straight up is a large, visibly floaty
// pop for a 0.027m ball, and a random sideways component means the same stuck position could
// escape in a different direction every time, which is the opposite of a believable physical
// nudge).
//
// A first attempt replaced the random component with a fixed, deterministic push toward table
// center (X=0) alone - reproducible, but a real playtest (a synthetic box-canyon trap: the ball
// centered exactly between two close walls, boxed in on the downhill side too, so it could only
// escape sideways) found a genuine flaw: a trap that happens to be roughly SYMMETRIC around the
// ball's stuck position makes "always push toward center" walk the ball back toward the middle
// after every kick, never accumulating the net progress needed to actually clear either wall -
// it can oscillate indefinitely instead of escaping. The old random version didn't have this
// specific failure mode (a lucky streak of same-direction random kicks would eventually clear
// it), so simply removing the randomness without addressing this would have been a real
// regression in the one thing this system exists to guarantee: an eventual escape.
//
// The fix keeps the direction deterministic (still toward center - correct for the much more
// common asymmetric case, where it makes real one-directional progress) but makes the MAGNITUDE
// escalate on each consecutive kick that fails to produce a real recovery (ball.stuckKickStreak
// in updateBallPhysics() below, reset the moment the ball demonstrates real, sustained motion on
// its own - not just right after a kick). The first kick for any given stuck episode stays small
// (this preference's #1 priority); magnitude only grows if that wasn't enough, capped at
// STUCK_KICK_ESCALATION_MAX so even a pathological trap can't produce a runaway velocity (also
// still bounded by the same MAX_BALL_SPEED_MS clamp everything else respects).
//
// Verified against a REALISTIC synthetic box canyon (closed on both sides and uphill, open
// downhill - a ball settling into a pocket while rolling downhill necessarily has this shape,
// since an opening on the downhill side would mean it just kept rolling through instead of
// stopping there): escalation clears it in a handful of kicks where a flat magnitude alone
// oscillated the ball around center forever. A deliberately backwards/adversarial version of the
// same test (closed downhill instead, open uphill - the opposite of how a real trap forms) does
// NOT clear even at full escalation, because only Z-axis movement can clear that particular
// trap's walls and this kick's Z is locked downhill by design (the "downhill bias" preference
// itself). Not fixed, and not expected to be: no real table geometry should ever produce a
// pocket that's open specifically on the uphill side only, so this isn't a case the system needs
// to solve, just one worth naming so a future reader doesn't assume escalation makes any and
// every trap shape solvable.
export const STUCK_KICK_CENTERWARD_MS = 400 * PX_TO_M; // ~0.378 m/s, toward table center (X=0) at streak 0 - same magnitude as the old random range's peak, now a fixed, deterministic push instead of a coin-flip direction
export const STUCK_KICK_DOWNHILL_MS = 380 * PX_TO_M; // ~0.359 m/s toward -Z at streak 0 - unchanged, already deterministic and already the correct "downhill" direction this preference asks for
export const STUCK_KICK_UP_MS = 0.02; // was 0.15 - just enough to break exact resting Y-contact for one step, not a visible hop (see this block's own comment). Deliberately NOT escalated with the horizontal kicks below - more height never helps clear a horizontal pinch, it would only make repeated attempts look more like a visible "hop"
export const STUCK_KICK_ESCALATION_STEP = 0.5; // +50% magnitude (X and Z only) per consecutive failed kick
export const STUCK_KICK_ESCALATION_MAX = 3; // caps escalation at 3x the base magnitude (~1.1 m/s X, ~1.1 m/s Z - still comfortably inside MAX_BALL_SPEED_MS's own ceiling even before that clamp catches it next frame)

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
//
// MOUNTING LAYOUT (final, real-machine convention - the root cause of every "flippers feel
// backwards" report, diagnosed and fixed for good): a real machine hinges each flipper at the
// OUTER end - at the base of its inlane guide - with the bat extending INWARD toward the
// centerline, the two tips leaving a ball-sized drain gap in the middle. This table originally
// had that mirrored: hinges near the centerline (x = +/-0.045) with bats extending OUTWARD
// toward the walls. All the motion logic was internally consistent, which is why every earlier
// angle/sweep-focused fix "passed its tests" yet still looked wrong - the bats were mounted
// backwards, not moving wrongly. The fix is the mounting, not the motion:
//   - FLIPPER_PIVOT_X_M places each hinge just inboard of its inlane guide's delivery end
//     (INLANE_GUIDE_BOTTOM_X_M = 0.125, same 0.008m clearance the old outward tip kept), so a
//     ball rolling out of the inlane lands on the bat exactly like a real machine.
//   - FLIPPER_LENGTH_M is sized so the bat spans from that outer hinge toward center: rest
//     reach is L*cos(25 deg) ~= 0.0997m, putting the rest tips at x ~= +/-0.017 - a 0.035m
//     center drain gap, ~1.3 ball diameters (BALL_DIAMETER_M = 0.027), the classic "ball can
//     drain between idle flippers, flip to stop it" geometry.
export const FLIPPER_LENGTH_M = 0.11;
export const FLIPPER_THICKNESS_M = 0.014;
export const FLIPPER_HEIGHT_M = 0.012;
export const FLIPPER_MASS_KG = 0.03;
export const FLIPPER_PIVOT_X_M = 0.117; // each hinge sits this far from table center X=0 - see MOUNTING LAYOUT above
export const FLIPPER_GAP_HALF_M = 0.045; // legacy layout datum - no longer the pivot X (see FLIPPER_PIVOT_X_M); still positions the decorative outer guide fins in babylon-game.js
export const FLIPPER_Z_M = -0.36; // near the flipper/near-camera end of the table
export const FLIPPER_PLAYFIELD_CLEARANCE_M = 0.003; // see createFlipper()'s comment - avoids flipper/playfield contact fighting the LOCKED constraint

// Sweep angle in radians, converted with plain math, not BABYLON.Tools.ToRadians() - this
// file's constants are evaluated at script-parse time, before the CDN-load checks inside
// main() run, so referencing BABYLON up here would throw an unguarded ReferenceError (not a
// caught, reported failure) if the CDN is blocked, ahead of where the error-handling
// listeners further down even get registered.
//
// ROOT CAUSE of every earlier "wrong sweep angle" bug fix (all superseded, no longer kept
// verbatim - see git history if the blow-by-blow is ever needed again): createFlipper()'s old
// setFlipperAngle() computed the paddle mesh's world position by hand each frame - orbiting a
// CENTER-origin box around the pivot with pivot + halfLength*(cos angle, sin angle) - while
// separately handing that same `angle` to BABYLON.Quaternion.RotationAxisToRef(Axis.Y, angle)
// for the mesh's rotation. Those two formulas silently disagreed: Babylon's actual left-handed
// Y-axis rotation maps local +X to world (cos angle, -sin angle) - a MINUS on the Z term - not
// the (cos angle, +sin angle) the position code assumed. Verified directly against the
// vendored engine (BABYLON.Vector3.TransformNormal through the real rotation matrix), and by
// replaying the exact old position formula: at this file's own rest angles the paddle's
// "pivot" end actually drifted up to 68mm from the real fixed pivot (the flipper was only
// 75mm long at the time) - i.e. the flipper wasn't hinging at all, it was sliding through an arc that only
// coincidentally passed through the intended pivot at angle=0. Every earlier fix (rest-angle
// sign flips, mirroring swaps, and above all the 160-degree sweep - nearly 2.5x a real
// flipper's throw) was blind trial-and-error against that drift, not a fix for it.
//
// THE FIX (see createFlipper()'s own comment in babylon-game.js for the code): the paddle mesh
// is now a child of a small pivot TransformNode, offset by a constant, never-changing local
// (FLIPPER_LENGTH_M / 2, 0, 0). Only the pivot node's rotationQuaternion changes per frame,
// stepped by updateFlipperMotor(). Babylon's own transform hierarchy - not hand-rolled trig -
// turns that into the mesh's world transform, so the base end is mathematically pinned to the
// pivot's world position at every angle (checked programmatically for this exact rest/active
// pair below: 0.00mm drift, versus the old formula's 68mm). There is no separate position
// formula left to disagree with the rotation, so this whole bug class can't recur.
//
// REST/ACTIVE ANGLES, re-derived from scratch for the fixed (correct) transform - the pre-fix
// values are meaningless here since they were tuned against the broken formula's drift, not
// against real geometry. Also re-derived, rather than reused, is the SWEEP itself: a real
// flipper's rest is only diagonal-ish (down-and-outward), not close to vertical, and its fired
// position is only diagonal-ish (up-and-inward relative to rest), not close to horizontal - a
// single rigid hinge simply cannot swing between a genuinely-vertical-leaning rest and a
// genuinely-horizontal-leaning active in under ~90 degrees (provable: the two would sit in
// non-adjacent quadrants of the rotation circle). Splitting the difference the way real
// hardware does - rest tilted a modest 25 degrees below the outward-horizontal line, active
// tilted 40 degrees above that same line, 65 degrees apart - keeps both ends genuinely diagonal
// (rest: outward-dominant with a real downward lean; active: still net-outward but visibly
// LESS outward than rest, and strongly upward) while landing squarely in a real 50-70 degree
// mechanical stroke. The original numeric verification (68mm/58mm tip reach) was measured at
// the then-current 75mm bat length; the reach scales directly with FLIPPER_LENGTH_M and the
// angles themselves are unchanged.
//
// SIDE-SWAP NOTE (see the MOUNTING LAYOUT comment at the top of this section for the full
// story): these two profiles keep their exact original values, but which PIVOT each one is
// assigned to was deliberately swapped at the createFlipper() call sites in babylon-game.js -
// the 25-degree profile (tip extending toward +X) is what a LEFT-hinged, inward-pointing bat
// needs, and the 155-degree profile (tip toward -X) is what the RIGHT hinge needs. The names
// below are kept for their git history; read them as "the profile originally authored for that
// side's outward-pointing bat", not "the profile the left/right pivot currently uses".
export const FLIPPER_SWEEP_RAD = (65 * Math.PI) / 180;
export const FLIPPER_LEFT_REST_RAD = (155 * Math.PI) / 180;
export const FLIPPER_RIGHT_REST_RAD = (25 * Math.PI) / 180;

// Motor tuning - NOT ported from anything (flippers are an entirely new mechanism in this
// 3D rewrite; the 2D version's velocity-injection formula has no equivalent here). These are
// angle-per-second rates consumed directly by updateFlipperMotor()'s kinematic stepping (see
// createFlipper()'s comment for why this isn't a physics-constraint motor) - a hard-clamped,
// constant-angular-velocity ramp toward the target angle each frame, deliberately NOT an
// eased/lerped animation: real flipper hardware is two distinct mechanisms with two distinct
// characters, a powered solenoid punching up fast and a passive return spring pulling back
// slightly slower, not one smoothed curve - see updateFlipperMotor()'s own comment for how the
// clamp guarantees an exact, jitter-free landing on both the active stop and the rest angle.
//
// Electromechanical-feel pass (user-requested - "very fast powered upstroke... spring-like
// return, slightly slower than the upstroke"): FLIPPER_SWEEP_RAD is a real 65-degree stroke (see
// its own comment), so these speeds are picked as durations for THAT sweep, not as arbitrary
// rad/s numbers - FLIPPER_ACTIVATE_SPEED_RAD_S = 9.9 completes the 65-degree upstroke in ~115ms
// (a snap, not a lerp - about 2.7 rendered frames even at a modest 24fps, comfortably more at
// 60fps), and FLIPPER_RETURN_SPEED_RAD_S = 7.1 completes the return in ~160ms, ~40% slower than
// the upstroke - close enough to read as the same mechanism relaxing back, not a second copy of
// the punch. If FLIPPER_SWEEP_RAD ever changes, these two should be rescaled by the same ratio
// (speed = sweep / desired-duration) rather than left as-is, or the durations above silently
// drift with it.
export const FLIPPER_ACTIVATE_SPEED_RAD_S = 9.9; // fast "punch" (~115ms for the current 65-degree sweep) - see this constant's own comment for why it's not picked independently of FLIPPER_SWEEP_RAD
export const FLIPPER_RETURN_SPEED_RAD_S = 7.1; // spring-like, slightly slower return (~160ms - magnitude only, direction is per-flipper, see createFlipper())

// Ball<->flipper contact material (physics-tuning pass, user-requested - "expose minimal tuning
// constants and document them"). Previously inline literals in createFlipper()'s
// PhysicsAggregate call; pulled out here so they're the one place to retune passive contact feel
// without hunting through the aggregate constructor. Restitution 0.3 gives a believable,
// non-explosive passive bounce off a stationary/held flipper; friction 0.4 is high enough that a
// resting ball doesn't slide off a level paddle from initial contact "jitter" alone, matching
// every other solid obstacle's friction in this file (0.4-0.8). These two alone are the WHOLE
// story for a stationary/held flipper - see FLIPPER_CONTACT_VELOCITY_TRANSFER below for why an
// ACTIVELY MOVING flipper needs something more.
export const FLIPPER_RESTITUTION = 0.3;
export const FLIPPER_FRICTION = 0.4;

// How much of the paddle's OWN real motion at the actual contact point gets added to the ball's
// velocity on a flipper hit (applyFlipperContactVelocity() in babylon-game.js). Exists because a
// direct playtest measurement (Playwright, manually-stepped physics via scene.getPhysicsEngine().
// _step() so a full ~115ms stroke could be sampled many times instead of completing within one
// throttled render tick - see
// syncFlipperPhysicsVelocity()'s comment) found Havok's own contact response for a kinematic
// (ANIMATED) body is purely POSITIONAL: it pushes the ball out of the way of the paddle's new
// position each step, but never incorporates the paddle's velocity into the ball's outgoing
// velocity, even after correctly setting that velocity on the body. A stationary and a
// full-speed mid-swing flipper produced identical post-contact ball motion before this constant's
// call site existed. The DIRECTION and RELATIVE magnitude here are still fully physically derived,
// never arbitrary: v = omega x r, the same real rigid-body math a native engine would use,
// evaluated at the real contact point Havok itself reports (not a hand-picked kick direction) -
// this alone is what makes a tip hit outrun a base hit, and what makes this exactly zero whenever
// the flipper isn't actually moving (omega=0: held at a stop, at rest, or the tail of a return
// about to snap home) - so a resting/held contact is untouched by this and still governed purely
// by FLIPPER_RESTITUTION/FLIPPER_FRICTION's passive bounce, which is what keeps a held flipper
// from injecting energy into a ball it's cradling. This constant is the one honestly-arbitrary
// knob in the formula - a plain scalar gain on that physically-derived vector. 1.0 (add the
// contact-point surface velocity exactly once) measured as too weak to reliably read as a real
// "hit" in playtest: Havok's own COLLISION_STARTED/CONTINUED events (this fires on both - see the
// call site's own comment) only land a handful of times over a ~115ms stroke, so a 1:1 transfer
// left most strokes barely distinguishable from a passive bounce. 5.0 clearly and repeatably
// produced a strong, correct up-table redirect in the same playtest. 3.0 is the middle ground kept
// as the shipped default - re-tune from here (not from 1.0) if a future playtest shows it still
// reads as too weak or too strong, and prefer changing this one scalar over changing the vector
// math above it. Always subject to the same MAX_BALL_SPEED_MS ceiling every other velocity source
// respects (clampBodySpeed() call at the end of applyFlipperContactVelocity()), so no value here
// can ever produce an unbounded spike regardless of how many genuine separate contacts compound
// during one swing.
// Flipper->ball energy-transfer tuning pass (user-requested, measured): 3.0 -> 2.4.
//
// The problem with 3.0 was NOT weak shots - it was the opposite. Measured on realistic rolling
// approaches (ball rolls down-table, flipper fires as it arrives), every contact point pinned the
// MAX_BALL_SPEED_MS ceiling: base 1.700 (100% of the 1.7 clamp), mid 1.600 (94%), tip 1.702
// (100%). A base hit and a clean tip hit came off at the SAME speed, so how well the player timed
// the shot carried no information - the "every touch launching maximum speed" failure mode.
//
// 2.4 differentiates shot strength without costing any reach. Across 42 varied flipper shots it
// measured indistinguishable from 3.0 on how far the ball actually travels (upper-third reach
// 12% vs 10%, best Z 0.251 vs 0.248, mid-table reach 100% both) while pulling average exit speed
// down 1.580 -> 1.463 and taking a mid-bat contact from 94% to 76% of the clamp. So the strongest
// shot is undiminished and the softer ones are no longer maxed out.
//
// Do NOT drop this further chasing a wider spread: 2.0 was measured and is a clear regression -
// upper-third reach 0%, mid-table reach falls 100% -> 86%, and best Z halves (0.248 -> 0.111).
// The tip shot needs to stay at/near the clamp for "a properly timed hit is the main tool for
// reaching the upper table" to hold.
//
// The base < tip ordering needs no special-casing and is not tuned here: the transfer is
// v = omega x r at the REAL contact point, so contact radius alone produces it. Verified linear in
// this scalar - at a fixed 0.0277m contact radius, exit speed went 0.757 / 0.484 / 0.348 / 0.212
// for transfer 3.0 / 2.0 / 1.5 / 1.0.
//
// Unchanged: flipper geometry, sweep, activate/return speeds, resting behaviour, and the
// held-flipper guarantee (omega is 0 once the bat reaches its stop, so a held flipper adds
// nothing - re-verified at every value tested; a cradled ball stayed at ~0 m/s).
// Flipper-to-ball energy-transfer pass (user-requested, measured): INSPECTED, DELIBERATELY
// UNCHANGED at 2.4. That pass was asked to raise transfer "only as much as required" to grade
// shots by contact point; the required amount measured as zero, and the ceiling moved instead
// (see MAX_BALL_SPEED_MS above for the full numbers).
//
// The reason is a property of this constant worth stating outright: it is a plain LINEAR GAIN on
// a physically-derived vector, so it scales base, midpoint and tip together and leaves their
// ratios fixed at 1 : 2.3 : 6.6 no matter what value it takes. It sets how hard the flipper hits;
// it cannot change how much a tip hit beats a base hit. Measured natural exit speeds:
//
//   transfer   base(24%)   mid(59%)   tip(89%)
//   2.4         0.729       1.679      4.833
//   3.0         0.914       2.085      6.044
//   3.5         1.068       2.423      7.054
//
// So if shots ever read as too weak or too strong ACROSS THE BOARD, this is the right knob. If
// they read as insufficiently DIFFERENTIATED, this is the wrong knob - look at what is flattening
// the top of the range instead.
export const FLIPPER_CONTACT_VELOCITY_TRANSFER = 2.4;

// --- Obstacle layout (placeholder geometry only this stage - see file header) ---
export const BUMPER_RADIUS_M = 0.02;
// SHOT-CORRIDOR REFACTOR (user-requested "deliberate shot corridors"). The cluster used to be a
// diamond straddling the table's centre line from z=-0.02 up to z=0.16 - i.e. sitting in the
// middle of every shot lane leaving the flippers. Measured (174-shot fan through the live
// physics scene, 2 flippers x 3 exit speeds x 29 angles): 50% of shots reached a bumper and 39%
// hit one FIRST, which sounds healthy until you notice what it cost - the Vision Gate and the
// power-up were reached 0 times in 174 shots, because this diamond plus the stacked centre
// column above it left no ball-width route past. bumper3 at (0,-0.02) sat 60mm above the flipper
// line and shadowed the entire centre channel on its own.
//
// The four bumpers are now a single ROW across the upper board at z=0.325, above Saturn, where
// balls ARRIVE (orbit exits, Saturn rebounds, re-entry drops) rather than where flipper shots
// DEPART. That is where a pop-bumper nest belongs on a real table, and it is what clears the
// centre spine: nothing now occupies x=0 between the drain and Saturn's lower edge at z=0.160.
//
// Gaps are held out of the 27-39mm "trap band" (a gap the 27mm ball enters but cannot pass
// comfortably is where balls come to rest): boss<->pop 40.0mm and pop<->pop 50.0mm are real
// lanes THROUGH the row; each outer pop sits 7.5mm from its orbit rail's inner face, sealed, so
// the orbit lane is not open into the nest at that height.
//
// INDEX 0 IS THE BOSS (buildObstacles() uses `isBoss = i === 0`, radius BUMPER_RADIUS_M*1.5 =
// 0.03, not 0.02) - it keeps index 0 here so nothing about its scoring, message, pitch or kick
// tier changes; only where it stands.
// Camera-readability revision: at z=0.325 with Saturn at 0.205, the two left-hand bumpers - the
// BOSS among them - were hidden behind Saturn's dome and rings from the fixed low gameplay camera
// (confirmed by screenshot, not assumed). The row moved up to 0.345 and Saturn down to 0.190,
// taking their separation from 120mm to 155mm, which clears the whole row above Saturn's
// silhouette. 0.345 is the ceiling: any higher and the boss's fixture reaches the re-entry lane
// inserts at z=0.400.
// CLUSTER LAYOUT: a hub with channels onto it, not a row and not a blob.
//
// Two failure modes bracket this. Four bumpers on one Z line is a wall - every approach meets the
// same face at the same height and is thrown back the way it came. Four bumpers packed tight is one
// blob - the ball cannot get between them, so it strikes the outside and leaves. What makes the
// cluster a section of playfield rather than an obstacle is CHANNELS: gaps wide enough to weave
// through but narrow enough that a bumper's kick lands the ball on a neighbour.
//
// The geometry here is severely constrained and the layout was solved against it rather than
// sketched. Every position has to clear Saturn by 40mm, the comet by 40mm, both orbit top arcs by
// 40mm, and the orbit rails by either 18mm or 42mm (a gap between those two figures is where a ball
// jams); its top edge has to stay under the top-crossing corridor; and no two bumpers may sit
// closer than 40mm, because two round bodies nearer than that form a V the ball settles into - the
// single worst trap this board's audit has found. Saturn's 40mm exclusion circle alone rules out a
// two-deep centre column: the usable band above it is 55mm tall and a bumper is 40-60mm across.
//
// The result is a hub-and-spoke, not a chain:
//   BOSS      (-0.045, 0.345)  the apex, upper, with THREE channels feeding it (47.1mm to the far
//                              left pop, 68.6mm to the low one, 69.5mm to the right one). It is
//                              the hardest of the four to reach directly - Saturn shields it from
//                              straight below - and everything that ricochets tends toward it
//   pop L-low (-0.102, 0.241)  hangs BELOW the arch, leaving a 49mm channel between it and Saturn
//                              that a ball coming up the centre-left threads
//   pop R     (+0.073, 0.326)  upper right, in the right orbit's exit path
//   pop L-far (-0.142, 0.341)  upper left, in the left orbit's exit path
//
// Four of the six pairs sit in the 40-70mm chaining band (47.1, 67.7, 68.6, 69.5) and two are
// deliberately far apart (154mm and 176mm) - those are the through-routes ACROSS the cluster rather
// than channels through it. Nothing is mirror-symmetric: the left carries two pops at different
// depths, the right one, and the boss sits 45mm off the centre line, so a ball arriving at the same
// angle from either side takes a different path.
//
// INDEX 0 IS THE BOSS (buildObstacles() uses `isBoss = i === 0`, radius BUMPER_RADIUS_M*1.5 = 0.03,
// not 0.02) - it keeps index 0 so nothing about its scoring, message, pitch or kick tier changes.
// Its POSITION is also a readability constraint, not a free choice. Measured by its boss-only gold
// trim's visible pixel count, which qa/skin-bumper-cap.js requires to be at least 80: Saturn
// occludes anything close behind it from this game's fixed low camera, and the occlusion depends on
// x at least as much as z - (-0.045, 0.300) read 67 px, (-0.130, 0.320) read 77, and (-0.021, 0.338)
// read 42 despite being HIGHER than the last, because it sits almost directly behind Saturn's
// centre. (-0.045, 0.345) reads clean. That is why the boss is upper-and-left-of-centre rather than
// on the centre line.
export const BUMPER_CLUSTER = [
    { x: -0.045, z: 0.345 }, // BOSS (index 0 - see note above)
    { x: -0.102, z: 0.241 },
    { x: 0.073, z: 0.326 },
    { x: -0.142, z: 0.341 }
]; // 4 bumpers, matching CONFIG.attackBumperCount in ../index.js

// Active pop-bumper kick: bumpers previously only ever bounced the ball via Havok's own
// restitution (set in buildObstacles()) - a real pop bumper actively fires the ball away on
// contact instead of just passively reflecting it. applyRadialKick() (in main(), used by
// handlePhysicalHit()'s 'bumper' AND 'saturn' branches - see that function's own comment) adds a
// horizontal velocity kick of this magnitude on top of that existing restitution bounce. One
// tunable constant, not a magic number buried in the hit handler.
export const BUMPER_KICK_SPEED_MS = 480 * PX_TO_M; // ~0.453 m/s added away from the bumper center - the "normal pop bumper" tier

// Active-obstacle power-hierarchy normalization (user-requested - "clear power hierarchy without
// arbitrary/explosive differences... wall < passive flipper < sling < normal pop bumper < strong
// flipper strike < boss/special event"). Shared by the boss bumper (BUMPER_CLUSTER[0]) and
// Saturn - both are narratively the same "boss/special event" tier (see their own comments:
// the boss bumper "is worth more and gets its own message/pitch", Saturn is "the single biggest
// non-mission scoring hit on the board... a standalone 'boss' bonus, same spirit as the bumper
// cluster's own boss bumper"), so they share one tunable magnitude via applyRadialKick() rather
// than two near-duplicate constants that could quietly drift apart.
//
// Before this pass, the boss bumper used the exact same BUMPER_KICK_SPEED_MS as every regular
// bumper (physics identical, only the score differed) and Saturn had NO active kick at all -
// purely Havok's own restitution bounce (0.85), so its resulting speed scaled with whatever the
// ball's incoming speed happened to be instead of guaranteeing a "big hit" feel the way a real
// boss feature should.
//
// Measured directly (Playwright, driving real Havok steps alongside the actual updateBallPhysics/
// updateHitCooldowns/handlePhysicalHit code paths via the ?dev=1 __flipperDebug hook, a
// standardized 0.5 m/s approach shot at each obstacle, peak speed measured in a short window
// anchored to the real contact frame - i.e. the frame a mesh first appears in the game's own
// hitCooldowns map, not a guessed frame): a normal bumper consistently measured ~0.47 m/s across
// repeated trials. Before this constant existed, the boss bumper and Saturn (restitution-only)
// would have measured the same ballpark - not distinctly the top of the hierarchy. With
// SPECIAL_EVENT_KICK_SPEED_MS applied, both the boss bumper and Saturn measured ~0.55-0.88 m/s
// across repeated trials - consistently at or above the normal bumper's ~0.47 and never below it,
// though this sandbox's own run-to-run Havok/swiftshader noise (observed and documented
// throughout this pass's testing) means the exact number varies trial to trial; what's reliable is
// the direction, not a precise single figure. Comfortably inside MAX_BALL_SPEED_MS for a typical
// approach either way - a very fast incoming ball combined with this kick can still reach the
// ceiling, which is expected and safe (still passes through the same clampBodySpeed() every other
// kick does).
export const SPECIAL_EVENT_KICK_SPEED_MS = 900 * PX_TO_M; // ~0.850 m/s - boss bumper + Saturn's shared "boss/special event" tier

export const TARGET_RADIUS_M = 0.014;
// SHOT-CORRIDOR REFACTOR: the bank moved inboard and down-table, out of the top-left corner and
// into the LEFT CORRIDOR - the lane between the left orbit rail and Saturn's shoulder. It was
// reached by 10% of measured shots and hit first by 2%; the old outermost target at x=-0.20 left
// only 12.7mm between its own edge and leftWall's inner face, so nothing could get behind it and
// the whole corner was dead space.
//
// Still colinear (buildObstacles()'s shared backboard spans first->last and assumes that), still
// angled, still ordered outermost-first so per-index colours/skins are unchanged. These meshes
// are TRIGGERS, not colliders (verified against the live scene), so the only clearance that
// matters here is decorative: each target's fixture is +/-0.020 wide, and the outermost one now
// clears the left orbit rail's inner face by 4.5mm instead of overlapping it.
// Trap-audit revision (qa/ball-trap-audit.js, run against the first placement): the bank and the
// Vision Gate cannot sit side by side in the left corridor - the corridor is ~120mm wide between
// the orbit rail's inner face and Saturn's shoulder, and two features that wide leave gaps in the
// 27-39mm trap band on both sides of the gate. They are stacked ALONG the corridor instead: bank
// low (the first thing a cross-table shot from the right flipper meets), gate above it.
// Spread widened after qa/skin-mission-targets.js flagged targets 0 and 1 as reading upside-down:
// they were not: at 20mm of X spread over 80mm of Z the three plates stack almost vertically in
// screen space from this game's fixed low camera, so the nearer plate overlaps the further one and
// the suite's per-target quadrant sampling was reading two plates as one. That is a real
// readability problem before it is a test problem - a drop-target bank whose plates hide each
// other is not a bank a player can aim at. 40mm of X spread was not enough - the suite still read
// each plate's bottom-right quadrant as its neighbour's top-left, which is the signature of two
// plates overlapping on screen rather than of a flipped UV (the other three quadrants were right
// on every plate, so the mapping was never wrong).
//
// Each plate's fixture is 40mm wide, so adjacent plates need 40mm of X between their centres to
// stop overlapping at all; across three plates that is an 80mm spread, which is what this is:
// -0.135 -> -0.055 over z 0.290 -> 0.110, still colinear (buildObstacles()'s shared backboard
// spans first->last and assumes that), and still inside the left corridor - the top plate's
// fixture clears the orbit rail's inner face by 1.5mm and the bumper above it by 6mm.
//
// BANK-AS-A-SHOT PASS. The layout above solved the readability problem (three plates that no
// longer hide each other) but it was still not a bank, and the reason is measurable. Its line ran
// (-0.135, 0.290) -> (-0.055, 0.110), i.e. direction (0.41, -0.91). A fan off both flipper tips
// (qa-style probe, 174 shots, recording heading the first time the ball enters the left corridor
// travelling up-table) puts the median approach at -15.6 degrees from up-table off the RIGHT
// flipper and -12.2 off the left. The old bank line sat almost exactly ANTIPARALLEL to that: a
// shot ran ALONG the bank's own axis rather than across its face, sweeping through all three
// trigger volumes in a line. That is also why the cluster-exit probe found the bank was the most-
// reached feature on the board - not because it was well aimed at, but because it was a corridor
// anything descending the left side passed down.
//
// A real drop-target bank is mounted ACROSS the shot. This one now is: the three plates sit on one
// line at 50mm pitch running right-and-up at 15.6 degrees, so the bank's face normal points
// down-table and slightly right - square to the measured right-flipper approach, and 12 degrees
// off the left flipper's, which still reads as a solid hit rather than a graze. The RIGHT flipper
// is the primary, which is also the convention for a left-side bank.
//
// buildObstacles() derives the plates' rotation from these endpoints with the same
// atan2(-dz, dx) the header rail already used, so the plates, their fixtures and the rail cannot
// drift out of alignment with each other - and the whole bank re-aims by editing these three
// positions alone.
//
// Kept: 3 entries, index order outermost-first (index 0 is still the plate nearest the left orbit
// rail), colinear (buildObstacles()'s shared backboard spans first->last and assumes that), and
// still triggers rather than colliders.
//
// Placement, all measured against the live collider dump rather than estimated:
//   pitch 50.0mm            The floor is 40mm (the fixture width, below which plates overlap on
//                             screen - the readability property the previous pass bought with
//                             197mm of spread and this one gets in 140mm). The 10mm above that
//                             floor is bought deliberately: a 27mm ball centred anywhere in the
//                             (55 - pitch) mm band between two plates overlaps BOTH trigger
//                             volumes at once and drops two of them off one hit. At 44.6mm that
//                             band is 10.4mm of every 44.6 and a 174-shot fan straddled 4 times;
//                             at 50mm it is 5mm of every 50, and the same fan straddles once or
//                             twice across runs (~1%). 55mm would close it completely but does not
//                             fit between the orbit rail and Saturn at any angle. Mission
//                             SELECTION is unaffected either way - startMission() only runs when
//                             mission.state is idle, so a straddle is one selection and two drops.
//   z 0.107 - 0.133         near the camera instead of running back to 0.290, where the top plate
//                             sat behind the bumper row and the orbit rail
//   plate 0 outer corner    (-0.1575, 0.1012), 6.2mm off the left orbit rail's inner face
//   plate 2 outer corner    (-0.0225, 0.1388), 10.1mm off Saturn's collider surface
//   both gaps are under the 18mm floor of the trap band, so neither can catch a 27mm ball even
//   though this hardware is decorative
//
// KNOWN, AND NOT FIXABLE BY MOVING THIS BANK: plate 2's trigger reaches into Saturn's drop shadow.
// Saturn is a 90mm collider centred on x 0 and gravity here is straight down-table, so any plate
// whose catch zone (trigger box + the ball's own 13.5mm radius) overlaps x -0.045..+0.045 collects
// balls rebounding off its underside. A ball staged into Saturn by qa/end-of-ball.js comes off its
// lower-left and reaches x -0.041, which this plate 2 clips. Two constraints have to hold at once -
// plate 0's fixture must clear the orbit rail's inner face at x -0.1637, and plate 2's catch zone
// must clear x -0.0545 - and summing them over the bank's own line bounds the pitch:
//   at 15.6 deg  pitch <= 39.1mm       at 25 deg  pitch <= 42.3mm
//   at 20 deg    pitch <= 40.4mm       at 30 deg  pitch <= 44.9mm
// Every one of those is at or under the 40mm floor where the plates start overlapping on screen,
// or far enough under 50mm to make straddling common - and a 30-degree bank was measured straddling
// 8 times in 174 rather than once. So three plates cannot clear both the rail and Saturn's rebound
// cone in this corridor at any angle, and the layout above takes the shot geometry instead. The
// PREVIOUS bank had the same exposure and more of it: its plate 2 sat 17.5mm inside the shadow
// against this one's 10mm.
export const MISSION_TARGET_BANK = [
    { x: -0.1382, z: 0.1066 },
    { x: -0.0900, z: 0.1200 },
    { x: -0.0418, z: 0.1334 }
]; // 3 targets in an angled left-corridor bank, matching CONFIG.missionTargetCount

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
// SHOT-CORRIDOR REFACTOR: down-table from z=0.32 to z=0.205. Two reasons, both measured. (1) At
// 0.32 its collider edge sat 19mm from the centre re-entry lane - under the ball's own 27mm
// diameter, so nothing could pass between them. (2) The apex reach of a real flipper shot: of the
// 174-shot fan, the median mid-power shot died at z=-0.011 and only near-tip shots cleared z=0.30,
// so anything above z~0.30 was a top-power-only feature. At 0.205 Saturn is the far end of an open
// centre channel instead of the lid on a blocked one, and it now clears the bumper row above it by
// 53.2mm and the Vision Gate beside it by 25.0mm (sealed - see VISION_GATE_POS).
export const SATURN_POS = { x: 0, z: 0.190 };

// SATURN AS A PREMIUM SHOT. Saturn's position is unchanged and deliberately so: a grid scan of the
// centre/upper board for the spot giving a 45mm-radius disc the most surface-to-surface clearance
// from every other collider puts (0, 0.190) FIRST, at 43mm - nowhere else on the board is better,
// and the runners-up are all within 5mm of it. Saturn was never in the wrong place. It was
// unframed, and the numbers said so:
//
//   174-shot flipper fan  ->  reached Saturn cleanly (no bumper/comet contact first):  6  (3.4%)
//   144 seeded cluster exits -> reached Saturn:                                       52  (36%)
//   near misses (within 45mm of the surface, travelling up-table):  4, and all 4 drained
//
// So bumper spill hit the board's biggest scoring object nine times more often than a clean shot
// did, which is the opposite of a premium shot. What makes it fixable is that the two populations
// land on DIFFERENT ARCS of Saturn's surface. Measuring the bearing of each contact point (0 =
// crown / up-table side, +/-180 = underside):
//
//   cluster spill      -90..-60:5  -60..-30:15  -30..0:8  0..30:12  30..60:5  60..90:5  90..120:2
//   clean flipper hits           -150..-120:2  -90..-60:1  60..90:1  120..150:2
//
// Spill arrives on the crown and upper flanks; a clean shot arrives underneath. So the canopy
// below covers the crown arc and stops there, leaving the underside - the shot arc - wide open.
//
// CANOPY. A steep, narrow tent over Saturn's crown. Two things fix its shape, and the first
// version got both wrong - qa/ball-trap-audit.js found 24 balls wedged in one spot and 11 in
// another, so this is the corrected geometry and the reasoning that produced it.
//
// (1) SLOPE. The canopy is a wall that gravity presses balls against, so each arm has to be steep
// enough that a ball on it slides off sideways instead of sitting there. On this playfield that
// threshold is tan(angle) > friction, and these rails use friction 0.5, so anything shallower than
// 26.6 degrees from horizontal holds a ball. The first version's arms were 10.5, 11.3, 20.4 and
// 23.6 degrees - all under it, and balls duly parked against all four. These are 33.7 degrees.
//
// (2) WHERE THE ARMS END. Saturn's side gaps are narrow: 43mm to bumper1 on the left and 46mm to
// the comet on the right, against a 27mm ball. An arm ending INSIDE one of those gaps turns it
// into a pocket - the arm funnels balls down-outboard into the corner where it meets the bumper,
// and they cannot get out past it. That is exactly what the 24-ball cluster at (-0.074, 0.258) and
// the 11-ball one at (0.098, 0.247) were. So the tent now stops well short of both neighbours and
// its arms discharge into open playfield instead.
//
// Clearances, against the ball's 27mm diameter:
//   ( 0.000, 0.256) apex   13.5mm over Saturn's crown - sealed, nothing gets under it
//   (+/-0.042, 0.228) ends  4.1mm off Saturn's surface - sealed
//   left end to bumper1    33.9mm - passable, so a ball shed leftward carries on down the
//                           Saturn/bumper1 channel rather than jamming against the bumper
//   right end to the comet 39.7mm - passable, same on that side
//
// What this deliberately does NOT do is seal Saturn completely. The tent spans +/-42mm, so it
// covers contact bearings inside about +/-69 degrees and leaves the flanks beyond that open. A
// version that ran the full width and anchored on both neighbours took cluster spill from 52 hits
// to 0, but it was the version with the pockets: sealing Saturn and keeping its side channels
// clear are the same 43mm of space, and they cannot both have it.
export const SATURN_CANOPY = [
    { x: -0.042, z: 0.228 },
    { x: 0, z: 0.256 },
    { x: 0.042, z: 0.228 }
];

// The mouth's right-hand jaw. Saturn's lower LEFT is already framed - the mission target bank's
// inner plate fixture sits 12.7mm off Saturn's surface there, too tight for a ball - so the shot
// only needed its other cheek. Upper end is 9.9mm off Saturn's surface (sealed, so it is a real
// jaw rather than a rail with a gap behind it) and it runs down-outboard from there, which is the
// direction that sends a ball missing to the right on toward the comet and the right orbit instead
// of straight back down the middle.
export const SATURN_JAW = { from: { x: 0.036, z: 0.139 }, to: { x: 0.068, z: 0.104 } };

// Floor tint marking the mouth, on the corridor between the Vision Gate's upper post and Saturn's
// underside. Same lane-tint idiom the orbits and the target bank use. Kept short and clear of the
// gate's own hardware, which carries its own visual identity right below this.
export const SATURN_APPROACH_TINT = { x: 0.010, z: 0.113, width: 0.055, length: 0.065 };

// --- COMET SHOT PATH -------------------------------------------------------------------------
// The comet's corridor already existed physically; nothing on the board said so. Firing the LEFT
// flipper across the cross-table band and recording the first SOLID thing each shot touches:
//
//    6-10 deg  visionGatePost0/1     12-14 deg  saturnJaw
//      16 deg  THE COMET             18-30 deg  the right orbit rail
//
// So there is exactly one heading whose first contact is the comet, bounded below by the Vision
// Gate's posts and above by the right orbit lane's inner rail - a real lane between two real walls,
// 16 degrees off up-table from the left flipper. That is the cross-table shot this pass makes
// legible. (Shots at 10-14 and 18-26 degrees still reach the comet, but only after bouncing off
// the jaw or the orbit rail first, which is why the fan's contact headings scattered from -31 to
// +20 and the comet read as something you arrive at rather than aim for.)
//
// RETURN RAIL. A short, steep rail hugging the comet's lower-left, which does three jobs at once:
// it is the lane's left wall in the stretch where Saturn would otherwise be it, it holds the comet
// and Saturn apart, and it catches rebounds coming off the comet's underside heading down-left -
// 4 of 18 measured strikes previously rebounded straight into Saturn - and turns them back down
// the lane toward the right inlane.
//
// Clearances, against the ball's 27mm diameter and the 18/42mm gap rule:
//   upper end (0.092, 0.186)  4.6mm off the comet's surface - sealed, so it is a wall rather than
//                              a rail with a gap behind it
//   lower end (0.082, 0.152)  32.8mm off the Saturn jaw's upper end - deliberately PASSABLE, so
//                              the Saturn and comet corridors stay connected instead of the gap
//                              between two rail ends becoming a pocket
//   lower end to Saturn      38.0mm - passable
//   slope 73.6 degrees, far above the 26.6 needed for a ball to shed off it rather than park
//
// At full power the 16-degree shot reaches the comet by touching THIS RAIL first and the comet
// immediately after - it banks off the lane wall rather than arriving dead on the nose. Pulling
// the rail 3mm back out of the line was measured and does give the direct contact back, at the
// cost of the rebounds it exists for: drains after a comet strike go from 0 back to 2 and Saturn
// returns from 2 to 3. A ball riding a corridor wall into the target at the end of it is the
// corridor working, so the rebounds win and the rail stays where it is.
export const COMET_RETURN_RAIL = { from: { x: 0.082, z: 0.152 }, to: { x: 0.092, z: 0.186 } };

// Floor tint up the lane, laid along the 16-degree line itself rather than along the board's axis,
// so the corridor is drawn where the shot actually goes. Same lane-tint idiom as the orbits, the
// target bank and Saturn's approach.
export const COMET_APPROACH_TINT = { x: 0.095, z: 0.120, width: 0.045, length: 0.090, angleRad: 16 * Math.PI / 180 };

// NOT DONE, and measured rather than skipped: the comet takes 24% of seeded cluster exits, and
// like Saturn they land on its crown (bearings -90..+30 hold 31 of 35). Saturn's answer was a
// canopy, and the comet has nowhere to put one. It has 39.7mm to Saturn's canopy on its left and
// 31.7mm to the right orbit rail on its right; a tent wide enough to cover the crown arc of a
// 22mm-radius body ends 24mm from one and 16mm from the other, which seals both channels and puts
// a downward-narrowing notch at each end - the exact shape that trapped 35 balls when Saturn's
// first canopy did it. The comet sits in a 71mm-wide slot and a shield does not fit in it.

// The old "satellite" object, re-themed as a comet now that Saturn itself is a real dedicated
// piece (having both would be a confusing "two Saturns") - same role/size/position family,
// just reskinned (new icy-cyan identity, see HEX_COMET) and nudged slightly right/down from
// its old (0.16, 0.36) spot to sit clear of Saturn's new footprint and rings.
export const COMET_RADIUS_M = 0.022;
// SHOT-CORRIDOR REFACTOR: (0.17, 0.29) -> (0.098, 0.150), into the RIGHT CORRIDOR. At x=0.17 the
// comet was jammed against the right wall (4% of shots reached it, 3% hit it first, and 100% of
// those drained afterwards) with a 34.7mm channel outboard - inside the trap band. It now sits in
// the open right lane with 42.5mm to the right orbit rail's inner face and 45.4mm to Saturn's
// edge: two real passages either side of it rather than one unusable one.
// Trap-audit revision: at (0.098, 0.150) the comet sat mid-corridor and its uphill crease - the
// wedge between a floor-resting sphere and the playfield - became the board's worst single
// attractor, 10 of 242 seeded balls coming to rest at (0.098, 0.184). Saturn has the identical
// crease and does not trap, because handlePhysicalHit()'s 'saturn' branch fires a radial kick on
// contact and the comet's branch does not; rather than give the comet a kick it never had (that
// would be a physics change), it moved off the corridor's middle.
//
// Fourth pass (see VISION_GATE_POS for the full reasoning): parking it against the right orbit
// rail traded one trap for another - a round body alongside a long straight rail face makes a V
// that always passes through the ball's diameter somewhere, and it caught 7 of 249 seeded balls.
// Fifth pass: "against Saturn's shoulder" was wrong for the same reason the gate's was - two round
// bodies 10mm apart are the tightest possible V, and that placement was the 22-ball cluster. The
// comet now sits alone in the upper right corridor with every neighbour at least 40mm away:
// Saturn 50.8mm, the right rail's inner face 40.2mm, both nearest pop bumpers 48.9mm. Solved as a
// pair of inequalities rather than nudged - clearing Saturn's centre by 107mm and the rail's face
// by 62mm leaves a window only about 8mm wide in x and 17mm in z, and this sits inside it.
//
// The residual, stated because it is the one thing the audit still sees: a lone sphere resting on
// the playfield has an uphill crease, and a ball can balance in it. The comet is the board's only
// round obstacle WITHOUT a kick on contact (Saturn and the bumpers all throw a resting ball off),
// so its crease is the one that holds. At 253 seeded starts it catches 2, recovered by the shipped
// anti-stuck in 0.58s. Giving the comet a kick would fix it outright and is a physics change, so
// it is left alone and recorded here instead.
// UPPER-TABLE CIRCULATION: down-table from 0.266 to 0.215. At 0.266 the comet sat inside the
// staggered nest's footprint (36mm from the nearest pop, inside the 40mm any two round bodies need
// between them) and, more to the point, it was BEHIND the nest from every approach - a ball coming
// down the right side met a bumper first every time. At 0.215 it sits in the open right field just
// below the nest, on the path a ball takes coming down from the top corridor or out of the right
// orbit, which is what "approach the comet" needs to mean. Clearances: Saturn 45.8mm, nearest pop
// 67.8mm, right orbit rail 46.7mm.
export const COMET_POS = { x: 0.110, z: 0.215 };

// Score-multiplier power-up orb (board redesign) - appears periodically in the open lane
// between the bumper cluster and Saturn (naturally in the ball's travel path when it rolls
// up-table), despawns if not hit in time. See updatePowerUp() in main()'s render loop.
export const POWERUP_RADIUS_M = 0.016;
// SHOT-CORRIDOR REFACTOR: (0, 0.22) -> (0.075, 0.080). On the centre line it was sealed against
// the old bumper at (0,0.16) by 24mm and against the Vision Gate by 0mm - three features stacked
// on one column, and the measured consequence was that the power-up was reached 0 times in 174
// shots. This constant's own comment always described the intent correctly ("naturally in the
// ball's travel path"); the position just never matched it. It now sits low in the right corridor,
// on the way to the comet and the right orbit, which IS a travelled path. It is a TRIGGER, not a
// collider, so it blocks nothing.
export const POWERUP_POS = { x: 0.075, z: 0.080 };
export const POWERUP_SPAWN_INTERVAL_MS = 20000; // how long it stays hidden before reappearing
export const POWERUP_ACTIVE_DURATION_MS = 7000; // how long it stays visible/hittable before despawning unhit
export const POWERUP_MULTIPLIER = 2;
export const POWERUP_MULTIPLIER_DURATION_MS = 12000; // how long the 2x window lasts once collected

export const SLINGSHOT_SIZE_M = 0.05;
export const SLINGSHOTS = [
    { x: -0.13, z: -0.30, mirror: 1 },
    { x: 0.13, z: -0.30, mirror: -1 }
]; // directly above/outside each flipper, like real slingshot kickers

// Active slingshot kick: like the bumpers' applyRadialKick(), a real slingshot kicker
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
//
// Active-obstacle power-hierarchy normalization (user-requested - "sling < normal pop bumper").
// Both values lowered from the original 520/600, in two rounds:
//
// Round 1 (kick only, to ~54% of original): a standardized-approach playtest found the original
// magnitudes put the slingshot's resulting speed measurably ABOVE a normal bumper's, backwards
// from the intended hierarchy. Barely moved the result on its own, though (see
// SLINGSHOT_RESTITUTION's own comment for why - restitution, not the kick, turned out to be the
// dominant contributor).
//
// Round 2 (kick reduced further, restitution also lowered - see SLINGSHOT_RESTITUTION): even
// after round 1, repeated measurement kept showing the slingshot's resulting speed at or above a
// normal bumper's, which turned out to be a measurement-harness bug, not a real physics
// discrepancy - the "peak speed" window was anchored to launch time rather than to the actual
// contact frame, so for a bumper reached after some travel distance the reading was dominated by
// the ball's own pre-contact gravity/tilt acceleration on the way in, not the post-hit response.
// Anchoring the window to the real contact frame (the frame a mesh first appears in the game's
// own hitCooldowns map - handlePhysicalHit()'s own signal, not a guessed one) fixed this: with
// the corrected methodology the slingshot measured clearly below the normal bumper across repeated
// trials (median ~0.33-0.36 m/s vs. the bumper's consistent ~0.47), matching the ordering both
// constants already guaranteed on paper (0.170 kick vs. 0.453, 0.45 restitution vs. 0.85). Both
// values are left at their round-2, comfortably-below-bumper magnitudes rather than walked back up
// closer to the original - this sandbox's Havok/swiftshader run-to-run noise (still present even
// with the corrected window) means a wide margin is worth more than a value tuned to sit just
// barely under the bumper's. The BIAS > KICK ratio (~1.17x) from the comment above is preserved so
// the "never feeds toward the drain" guarantee still holds.
export const SLINGSHOT_KICK_SPEED_MS = 180 * PX_TO_M; // ~0.170 m/s, away-from-face lateral push - clearly below BUMPER_KICK_SPEED_MS (0.453) on its own
export const SLINGSHOT_KICK_UPTABLE_BIAS_MS = 210 * PX_TO_M; // ~0.198 m/s, unconditional +Z addition - larger than SLINGSHOT_KICK_SPEED_MS by design, see comment above

// Also part of the same power-hierarchy normalization as the two kick constants directly above.
// Root cause of why round 1 (kick-only) barely moved the result: the slingshot previously shared
// the bumper's own restitution (0.85), and Havok's own passive bounce - not the added kick -
// turned out to be the dominant contributor to the slingshot's total resulting speed (its flat
// angled face apparently transfers a more direct, fuller restitution bounce than a bumper's
// curved sphere does at a comparable approach). Lowered separately from bumpers' own restitution
// (bumpers don't have their own named constant yet - see buildObstacles()'s own literal, 0.85) so
// the slingshot's passive bounce alone is clearly below a bumper's, not just competitive with it,
// while staying well above a plain wall's (0.3) - a slingshot should still read as genuinely
// springy, just the tier below a bumper, not tier-for-tier identical to one.
export const SLINGSHOT_RESTITUTION = 0.45;

export const REENTRY_LANE_RADIUS_M = 0.016;
// SHOT-CORRIDOR REFACTOR: respaced from +/-0.14 to +/-0.115 so the two outer lanes sit between the
// bumper row's outer pops and the orbit lanes' top exits rather than directly in line with the
// rails. Z is unchanged (0.40); these are triggers with decorative flanking rails, so nothing here
// is a collider and their mission-tied scoring is untouched.
// UPPER-TABLE CIRCULATION: the three rollovers are no longer on one Z line. A ball released by an
// orbit's top arc at z=0.409 crosses the board sideways and SAGS as it goes - 0.717 m/s^2 of
// downhill gravity over a 0.2-0.4s crossing - so a flat row at 0.40 was only ever crossed at its
// near end. Traced on a completed loop: the ball was at z=0.406 leaving the arc and z=0.305 by the
// time it reached x=+0.044. Dropping the middle rollover 14mm into a shallow V follows that sag
// from either direction, which is the only symmetric shape that can (the sag is monotonic in the
// direction of travel, so it mirrors when the loop runs the other way).
export const REENTRY_LANES = [
    { x: -0.115, z: 0.398 },
    { x: 0, z: 0.384 },
    { x: 0.115, z: 0.398 }
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
//   to -0.125 - see INLANE_GUIDE_TOP_X_M/INLANE_GUIDE_BOTTOM_X_M's own comment for why that's
//   -0.125 and not the -0.06 this paragraph originally described) -- open onto the flipper's
//   own approach beyond that.
// Z runs from LANE_Z_TOP_M (just clear of the slingshot's own footprint) to LANE_Z_BOTTOM_M
// (within the flipper's operating Z range - the divider stays clear at a fixed 0.145 throughout,
// but the guide's own clearance from the flipper's real swept footprint is a live geometric
// constraint, not a fixed number here - see INLANE_GUIDE_BOTTOM_X_M's own comment for the actual
// current clearance value and how it's verified). Below LANE_Z_BOTTOM_M, both lanes
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
// LOWER-FLOW PASS: -0.365 -> -0.342. A rollover has to sit UP-LANE of the flipper so it fires when
// a ball arrives, not while one rests on the bat. -0.365 is inside the flipper's own z span
// (-0.4128..-0.3537), so once INLANE_TRIGGER_X_M moved onto the real return path the trigger ended
// up underneath the resting ball and fired on 174 of 174 fan shots - a "there is a ball" sensor,
// not a lane. -0.342 is above the bat's top edge and still below the divider's top at -0.33, so it
// is a rollover the returning ball crosses on its way down.
export const LANE_TRIGGER_Z_M = -0.342; // up-lane of the flipper's top edge, below the divider's top
// LOWER-FLOW PASS: 0.095 -> 0.068. The inlane rollover was outboard of the path balls actually
// take. 132 seeded descents put every returning ball across the flipper line between x -0.08 and
// +0.08 - a 20mm histogram peaks at -0.02 (26 balls), +0.04 (22) and 0.00 (17) with NOTHING between
// -0.08 and -0.22 - while this trigger's own span was 0.080..0.110. It sat just outboard of the
// traffic and caught 6 of the 42 balls that crossed on its side.
//
// This board does not deliver an inlane ball down a channel and it structurally cannot: the config
// block below records that the flipper-pivot-to-divider space is 28mm and any rail inside it
// pinches the ball, which is why INLANE_GUIDE_BOTTOM_Z_M stops the guide above the pinch and the
// ball drops onto the bat instead. So the rollover belongs where the ball crosses, which is over
// the bat, not in a lane that cannot be built.
export const INLANE_TRIGGER_X_M = 0.068; // mirrored - on the measured return path, over the flipper bat
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
// flipper's own resting reach - so a ball riding this rail down arrives close enough for the
// flipper to actually reach it, matching how a real inlane guide is shaped, not just labeled.
//
// Physics QA fix (flipper collision audit): INLANE_GUIDE_BOTTOM_X_M was 0.06, calibrated
// against this file's now-superseded flipper geometry (see FLIPPER_LEFT_REST_RAD's own
// comment for the full pivot/angle history) whose swept footprint stayed much closer to its
// pivot. The current, corrected flipper geometry sweeps a genuinely real down-and-outward
// REST to up-and-inward ACTIVE stroke, and its paddle's own outward reach (a box, not a point -
// its long axis plus half its own thickness) extends out to roughly x=-0.12 at points along that
// stroke - well past the old 0.06 guide endpoint (mirrored -0.06). Left unfixed, the guide rail
// and the flipper paddle genuinely overlap in 3D space for most of the stroke (confirmed via
// Babylon's own precise mesh-intersection test, swept in 1-degree steps across the full rest-
// to-active range: 43 of 67 sampled angles intersected at the old 0.06) - two solid static
// colliders occupying the same space, which produced a real, reproducible bug: a ball merely
// resting on or gently dropped onto the flipper could get trapped in the unstable double-contact
// where the two overlapping colliders meet, and be flung off the table at several m/s (confirmed
// via real Havok collision events - the ball's first contact was with this guide, not the
// flipper, exactly where their volumes overlap). Raised to 0.125 (0.115 is the exact geometric
// clearance threshold from the same sweep test, swept in fine 0.002 steps: 0.113 still
// intersects, 0.115 is clean - 0.125 keeps 10mm of headroom above that threshold rather than
// sitting right on it) - re-verified with the same 1-degree sweep: zero intersecting angles
// across the full stroke, both flippers (right is an exact mirror). This does shrink the guide's
// taper (it now stays closer to flush with the divider than to the flipper) - an unavoidable
// consequence of the corrected flipper's genuinely larger real-pinball-scale reach, not a design
// preference.
export const INLANE_GUIDE_TOP_X_M = 0.14; // mirrored - almost flush with LANE_DIVIDER_X_M (0.145)
export const INLANE_GUIDE_BOTTOM_X_M = 0.125; // mirrored - tapers toward the flipper, clearing its full swept footprint (see this constant's own comment)

// Where the guide STOPS in Z. Previously it ran the divider's full span (LANE_Z_BOTTOM_M, -0.40),
// which carried it down past the flipper's pivot at z=-0.36 and produced a hard geometric pinch -
// a ball rolling the inlane was funnelled into a corridor narrower than itself and wedged there,
// dead, until the anti-stuck kick fired ~1.6s later. The player could not recover it: measured,
// a full flipper stroke does not reach that pocket.
//
// Measured corridor between inlaneGuide and the RESTING flipper, ball diameter 0.027m:
//   z=-0.355  0.0230   z=-0.360  0.0196   z=-0.365  0.0163  <- minimum   z=-0.370  0.0224
//
// The X axis cannot fix this. INLANE_GUIDE_BOTTOM_X_M is already pinned by the flipper-overlap
// audit above (0.115 is the intersection threshold, 0.125 the shipped value), and opening the
// corridor to a ball's width would need the guide out past 0.149 - through LANE_DIVIDER_X_M at
// 0.145. The whole flipper-pivot-to-divider space is only 0.028m wide; ANY rail inside it pinches.
// So the guide ends above the pinch instead, at -0.35, and the ball drops onto the bat the way a
// real inlane delivers it. The full 0.14 -> 0.125 taper is preserved over the shorter span, so the
// rail still steers inward (it is now steeper - the "improve rail angle" lever, applied for free).
//
// Verified against everything the old geometry guaranteed:
//   flipper/guide mesh intersection, 1-degree sweep across the full stroke, both flippers:
//     0 of 66 angles intersect at -0.40 AND at -0.35 (the constraint that pinned BOTTOM_X holds)
//   trapped starts across both side lanes, 25 -> 8, with all 15 guide/flipper wedges eliminated
//   inlane -> flipper delivery: 5 of 6 approach lines still land on the bat (unchanged)
//   qa/circulation-suite.js: identical on every metric, so no new drain path was opened
//
// Deliberately NOT LANE_Z_BOTTOM_M: the divider rail and its posts still run to -0.40, because
// separating the inlane from the outlane is their job and they are not what pinches the ball.
export const INLANE_GUIDE_BOTTOM_Z_M = -0.35;
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
// ORBIT GEOMETRY, rebuilt as a real arc (user-requested: "recognizable repeatable shots rather
// than generic side paths"). Everything below describes ONE side; the other is an exact mirror
// through x=0, so left flipper -> right orbit and right flipper -> left orbit are the same shot.
//
// WHY AN ARC. The straight-rail version was measured, not guessed: 174 flipper shots produced 6
// lane entries and 2 completions, and tracing single shots showed the ball entering the channel
// and dying at z=+0.125. The cause is the entry angle. A shot that reaches the far wall arrives
// at 33-40 degrees to it; a straight wall turns that into one hard impact (restitution 0.3 on the
// perpendicular component) and then a second off the inner rail, and the ball ping-pongs its speed
// away before it has climbed 200mm. Nothing about rail POSITION fixes that - only rail SHAPE does.
//
// THE SHAPE. The lane's outer guide is a circular arc TANGENT TO THE SIDE WALL at
// ORBIT_ARC_TANGENT_Z_M, curving down and inboard from there through ORBIT_ARC_SWEEP_RAD. Tangency
// is the whole point: at the top the guide IS the wall (no seam, no step for a ball riding it),
// and at its lower end its surface runs at ORBIT_ARC_SWEEP_RAD from vertical - which is the angle
// the incoming shot arrives at. A 38-degree shot meets a 38-degree surface at roughly zero
// incidence and keeps its speed instead of spending it. The inner guide is CONCENTRIC with the
// outer one, so the lane is a constant ORBIT_LANE_WIDTH_M wide the whole way round - it cannot
// pinch, and there is no point along it where the ball is squeezed.
//
// THE MOUTH. The inner guide stops short of the outer one (ORBIT_INNER_SWEEP_RAD vs
// ORBIT_ARC_SWEEP_RAD), so the lane opens out into a flare at the bottom rather than presenting a
// slot the ball has to thread. Geometrically the entry window is the span of flipper angles that
// clear the inner guide's lower tip but still meet the outer arc above its own lower end: about
// 32-45 degrees, i.e. ~13 degrees wide. The straight-rail version's window was under 3.
//
// THE WEDGE BEHIND THE OUTER GUIDE narrows as it rises (76mm at the guide's lower tip, zero at the
// tangency point). That orientation is deliberate and is the difference between a safe pocket and
// a trap: gravity pulls a ball in this wedge DOWN, into the widening part, and out. The traps this
// board's audit has caught were all the other way up - gaps that narrow downward, where gravity
// holds the ball in.
export const ORBIT_WALL_FACE_X_M = 0.2267; // leftWall/rightWall inner face, read off the live scene
export const ORBIT_ARC_RADIUS_M = 0.36; // outer guide's face radius - see the block comment above
export const ORBIT_LANE_WIDTH_M = 0.048; // 1.78 ball diameters, constant all the way round
export const ORBIT_ARC_TANGENT_Z_M = 0.06; // where the outer guide meets the side wall, tangentially
export const ORBIT_ARC_SWEEP_RAD = 38 * Math.PI / 180; // outer guide's sweep below tangency
// Inner guide's sweep, measured rather than picked. At 30 degrees its lower tip reached
// (-0.137, -0.096) - far enough inboard and low enough to stand in the middle of the board - and
// the 174-shot fan showed the cost immediately: Saturn's hits fell 32 -> 13, the target bank's
// 26 -> 20 and the median shot apex dropped from z=-0.036 to -0.149, because the guide was
// intercepting centre-corridor shots on their way up. At 20 degrees the tip sits at
// (-0.160, -0.047), out of that traffic. It also WIDENS the entry window rather than narrowing it:
// the shot has 49mm more table to get outboard in before it has to clear the tip, so the minimum
// entry angle drops from 32 to 31 degrees.
export const ORBIT_INNER_SWEEP_RAD = 20 * Math.PI / 180; // inner guide stops here, leaving a flared mouth
export const ORBIT_ENTRANCE_SWEEP_RAD = 34 * Math.PI / 180; // entrance rollover, on the lane's centre line
// A GAP in the outer guide, sized and positioned from the shooter lane's own exit path.
//
// The shooter lane exits into the RIGHT-hand wall channel - the ball rests at x=0.1955 and rides
// the wall up - and that channel is the same space the outer guide's wedge occupies. Measured, a
// launch drove into the closing part of that wedge and stalled at z=-0.122 against z=+0.041 before
// this pass, and the launch's region coverage fell from 6 of 9 to 2.
//
// A deflector across the wedge was tried first and was worse (z=-0.156): it turns the ball inboard
// correctly, straight into the corner where it meets the guide, which is a V the ball then rattles
// around in. The geometry does not admit a deflector - anything that closes the channel stops the
// ball and anything that does not, pinches it.
//
// What does work is letting the ball THROUGH. The launched ball's centre crosses the outer guide's
// face at sweep 24 degrees (cos = (0.1955 + 0.1333)/0.36), so the guide is built in two pieces with
// a gap straddling that crossing. 8 degrees of arc is 50mm - comfortably more than the ball's 27mm
// - and it costs the flipper shot nothing: the catching flank below the gap still does the initial
// turn from 38 to 28 degrees, and the ball re-meets the guide above the gap at 8 degrees of
// incidence, which is gentler than anything it met before this pass.
export const ORBIT_OUTER_GAP_FROM_RAD = 17 * Math.PI / 180;
export const ORBIT_OUTER_GAP_TO_RAD = 33 * Math.PI / 180;
// ...and on the RIGHT the catching flank below that gap is omitted entirely, which is the one
// asymmetry on this board and is forced by hardware, not chosen. The flank lives between z=-0.140
// and -0.166 - exactly where the shooter lane's inner wall ends and where a launched ball is still
// riding the side wall - and everything else was tried first, measured, and was worse:
//   * flank present, no gap:      launch stalls at z=-0.106 (baseline reaches -0.036)
//   * a deflector across the wedge: z=-0.156, worse - it turns the ball correctly and then into
//                                   the corner where the deflector meets the guide
//   * gap only (17-33 degrees):    z=-0.081, and 3 of 4 suite launches never clear the lane
//   * gap plus a 30mm longer shooter lane: no better, and it spends the launch's own clearance
//                                   margin (see LANE_WALL_Z_TOP_PX)
// The right orbit keeps the arc, the constant-width lane, the flared mouth, the vertical section
// and both rollovers; what it loses is the tangent flank, so its entry is a wall contact like the
// pre-arc geometry rather than a glancing one. It is the same SHOT - the same lane, entered from
// the left flipper at the same angles - taken at a slightly higher price.
export const ORBIT_OUTER_FLANK_SIDES = ['left'];

// Inner lip on the LOWER half of each orbit's top turn.
//
// Measured with a cluster-exit probe: 144 seeded exits (4 bumpers x 12 incoming directions x 3
// speeds), each classified by the first scoring feature the ball reached afterwards. 24 of them
// left the cluster sideways into the TOP of an orbit lane and rode it back down the outside of the
// board - the one exit direction that reaches nothing on the way, because the lane is sealed from
// the playfield along its whole length. The cause is structural: the top turn has an outer wall
// (the top arc) but no inner one, so beside the cluster it is a 125mm-wide open mouth pointing
// straight down the lane.
//
// The lip gives that mouth an inner edge for its lower half only. Above `toZ` the turn stays open
// exactly as before, which is what preserves the "leave the turn early into the bumper nest"
// behaviour the top arc was built outer-only for; this closes the part of the opening that faces
// the cluster, not the part that faces the upper table.
//
// `inboard` leans the lip toward the middle of the board, turning the mouth into a lane instead of
// just a wall. Only the right side can take that lean - on the left, bumper3 sits IN the turn at
// z 0.321-0.361 (x -0.162..-0.122) and already walls it from there up, so the left lip only has to
// close the 22mm slot between the vertical rail's top and the bumper's lower surface. A leaning
// left lip would run through the bumper.
//
// Clearances, both against the ball's 27mm diameter and the 18/42mm gap rule (a gap to a flat face
// is safe below 18mm or above 42mm; in between the ball half-enters and jams):
//   right lip at z 0.360: face x 0.1575, top arc's inner face x ~0.207  -> 49mm of lane
//   right lip at z 0.298: face x 0.1787, top arc's inner face x  0.2252 -> 47mm of lane
//   right lip to bumper2 (0.073, 0.326, r 0.020):                          57mm  (>42, safe)
//   left  lip top (-0.1712, 0.324) to bumper3's surface:                   14mm  (<18, safe)
// Both lips start 2mm below ORBIT_RAIL_TOP_Z_M so they overlap the vertical section rather than
// butting against it - a butt joint there would leave the same catchable seam the arcs avoid.
export const ORBIT_TOP_LIPS = [
    { side: 'left', toZ: 0.324, inboard: 0 },
    { side: 'right', toZ: 0.360, inboard: 0.021 }
];
export const ORBIT_ARC_SEGMENTS = 6; // straight boxes per arc; the chord-to-arc error at 38/6 degrees is 0.3mm
export const ORBIT_RAIL_TOP_Z_M = 0.30; // the vertical section's top - where the top arc takes over

// UPPER-TABLE CIRCULATION: the orbit's TOP ARC, and the piece that turns the upper board from a
// dead end into a loop.
//
// Before this, each lane ended at ORBIT_RAIL_TOP_Z_M and the ball ran on up the wall into topWall,
// bounced, and came back down the lane it arrived in. Measured on the 174-shot fan, the re-entry
// lanes - three scoring rollovers - were crossed 3 times, because nothing ever travelled across the
// top of the board.
//
// The arc is TANGENT TO THE SIDE WALL where the vertical section ends, so a ball riding the lane
// meets it at zero incidence, and it sweeps inboard through ORBIT_TOP_ARC_SWEEP_RAD - turning the
// ball from straight up-table to mostly sideways and releasing it across the top at z~0.41. From
// there its own momentum decides what happens, which is the point:
//   * fast    - it crosses the whole top, over all three re-entry rollovers, meets the OPPOSITE
//               arc's inboard face and is turned down the opposite lane. A completed loop.
//   * medium  - it drops as it crosses (0.717 m/s^2 downhill; a 0.35s crossing falls 44mm) and
//               lands in the bumper nest below.
//   * slow    - it never clears the nest at all and rattles there.
// One shot, three outcomes, chosen by how hard it was hit rather than by a branch in the geometry.
//
// This is an OUTER guide only - there is deliberately no inner rail on the turn. An inner rail
// would make the arc a closed channel, which would both force the single "cross the top" outcome
// and collide with the bumper nest (checked: at the radius that turns the ball usefully, an inner
// rail passes within 5mm of two of the pops). Leaving the inboard side open is what lets a ball
// leave the turn early into the nest.
//
// The void between the arc and the side wall is bounded by the arc, the wall and topWall, and its
// only opening is the 15.7mm between the arc's upper end and topWall's inner face - under the
// ball's 27mm diameter, so it is sealed and nothing can get in.
export const ORBIT_TOP_ARC_RADIUS_M = 0.115;
export const ORBIT_TOP_ARC_SWEEP_RAD = 72 * Math.PI / 180;
export const ORBIT_TOP_ARC_SEGMENTS = 8; // 9 degrees per segment - 0.35mm of chord error
// SHOT-FAN REVISION: the entrance rollover moved DOWN to z=0.06, into the wall channel below the
// rail's bottom tip, because 0.17 sat above where a real shot can reach in that lane. Traced: a
// 35deg shot enters the channel and peaks at (-0.205, +0.125) before rolling back - it was
// genuinely IN the lane and still never crossed a trigger at 0.17. Entering an orbit should be the
// easy half and completing it the skill; putting the entrance at the lane's mouth and leaving the
// completion at 0.33 is what makes that split real rather than nominal.
// Entrance/completion Z are derived from the arc rather than declared, so they cannot drift out of
// the lane when the arc is retuned. See orbitArcPoint().
// Completion sits in the vertical section, on the lane's centre line. It was pulled down to 0.24
// while the straight rails were in place, because measured, no shot reached higher than z=+0.275
// inside that lane and half of them died by +0.102 - the entry impact had already taken the speed.
// With the arc entry preserving it instead, this goes back up to a real loop length.
export const ORBIT_COMPLETION_Z_M = 0.26; // in the vertical section, below the rail's top at 0.30
export const ORBIT_TRIGGER_WIDTH_M = 0.03;
export const ORBIT_TRIGGER_DEPTH_M = 0.025;
// How long a completion trigger has to fire after its matching entrance before the shot is
// considered stale (a ball that entered, stalled, and rolled back down shouldn't silently
// score if it happens to clip the completion trigger much later on some unrelated pass).
export const ORBIT_COMPLETION_WINDOW_MS = 4000;
//
// Ball-flow geometry pass (user-requested, measured): the right rail moved INBOARD ~13mm, from
// 0.09/0.10 to 0.077/0.082, so it now very nearly mirrors the left one. The two rails had never
// been mirrored while leftGuide/rightGuide (which they meet) always were, and the consequence was
// only visible once the real colliders were measured: the gap a ball must thread to get from the
// centre channel out into its orbit lane was 38.1mm (1.41 ball diameters) on the LEFT and 23.4mm
// (0.87) on the RIGHT - i.e. the right orbit had no ball-sized entrance from mid-table at all,
// reachable only over the top arc. It is now ~35mm (1.30) against the left's ~36.5mm (1.35).
// Deliberately 2mm short of an exact mirror: a perfect mirror puts the rail's own edge 0.3mm from
// visionGatePost1, which would read as an intersecting mesh; 0.077/0.082 keeps 2.3mm of daylight
// there while still opening the entrance. Everything downstream follows the rail automatically -
// its end post, bevel cap, floor tint, and the entrance/completion rollovers (moved with it so
// they stay in the lane they mark). No scoring value, trigger size, or Z position changed.
//
// Side effect, checked and wanted: this also makes the four upper-table corridors symmetric -
// Saturn's shoulders become 39.5mm/39.4mm (was 58.4/39.4), the boss-bumper lanes 43mm/43.3mm
// (was 59.0/43.3), and the comet channel widens from 45.4mm to ~64mm.
// SUPERSEDED, kept as the record of why the shape changed twice. The block above was written when
// the target bank reached x=-0.214 and the comet x=0.192, and concluded a wall-hugging orbit did
// not fit AT THOSE POSITIONS; both moved inboard in the shot-corridor pass, which freed the wall
// channel. That pass then ran both rails straight and vertical at |x|=0.170 and measured 6 lane
// entries and 2 completions across 174 flipper shots - better placed than the 75-94mm inboard
// "orbits" it replaced, but still not a shot. The orbit-geometry pass above replaced the straight
// rails with the tangent arc, which is what finally made them repeatable: 38 entries and 7
// completions on the identical fan.
//
// Per-side identity only. Every coordinate is derived from the arc constants above via
// orbitArcPoint(), mirrored by `mirror`, so the two orbits are guaranteed to be exact mirrors of
// each other - which is what makes "left flipper -> right orbit, right flipper -> left orbit" the
// same shot twice rather than two shots that happen to look alike.
//
// KNOWN SIDE EFFECT, called out rather than hidden: the shooter lane exits into the right-hand
// channel (the ball rests at x=0.1955 and rides the wall up), so a strong launch can run the right
// orbit lane and score a right orbit off the plunger. Nothing about the orbit's scoring rule
// changed - the geometry put the plunger's exit path into the lane. The skill-shot lanes are
// untouched at z=0.02, well below the outer guide's lower tip.
export const ORBITS = [
    { side: 'left', mirror: -1 },
    { side: 'right', mirror: 1 }
];

// A point on one orbit's arc, for a given face/centre radius and sweep angle. sweep=0 is the
// tangency point on the side wall; sweep grows downward and inboard. Larger radius = further
// OUTBOARD (toward the wall), because the construction centre sits inboard of the whole arc - so
// the outer guide's radius is the largest, the lane's centre line is one half-width inside it, and
// the inner guide is a full lane-width inside it.
export function orbitArcPoint(mirror, radius, sweepRad) {
    const centerX = mirror * (ORBIT_WALL_FACE_X_M - ORBIT_ARC_RADIUS_M);
    return {
        x: centerX + mirror * radius * Math.cos(sweepRad),
        z: ORBIT_ARC_TANGENT_Z_M - radius * Math.sin(sweepRad)
    };
}

// The same construction for the TOP arc: sweep=0 is the tangency point on the side wall at the
// vertical section's top, and sweep grows inboard and UP-table (the entry arc's grows downward).
export function orbitTopArcPoint(mirror, radius, sweepRad) {
    const centerX = mirror * (ORBIT_WALL_FACE_X_M - ORBIT_TOP_ARC_RADIUS_M);
    return {
        x: centerX + mirror * radius * Math.cos(sweepRad),
        z: ORBIT_RAIL_TOP_Z_M + radius * Math.sin(sweepRad)
    };
}

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
// Ball-trap fix (measured, user-authorised): x 0.045 -> 0.027, an 18mm INBOARD move.
//
// A ball rolling down the right orbit lane came to a genuine dead stop at (0.059, 0.266) - still
// a DYNAMIC body, so not the gate's own capture mechanic - in 24 of 30 legal rolls, and the
// anti-stuck kick needed 2.58s to free it (the worst on the table, and past the 2.5s bound
// qa/ball-trap-audit.js asserts).
//
// The blocker is this gate's RIGHT guard post cutting across the lane's downhill exit, with the
// orbit rail capping the outboard way around it. That matters because it rules out the two
// obvious fixes, both measured and both useless on their own:
//   moving the gate DOWN-TABLE (-Z):        24/30 still rested - the obstruction is an X extent,
//                                           so sliding it along Z cannot open the exit
//   moving the rail outboard alone (+24mm): 23/30 still rested - widening the lane does not help
//                                           while a post still blocks the way out of it
//   widening the gate<->rail gap to 34mm:   still rested - that gap was never the pinch
// Only moving BOTH works, because the ball needs a gap between the post and the rail that it can
// actually pass through:
//   rail +12mm, gate -15mm:  5/30    rail +20mm, gate -15mm:  3/30
//   rail +12mm, gate -18mm:  2/30 <- shipped, recovery 2.58s -> 1.03s
//
// Shrinking VISION_GATE_COLLAR_RADIUS_M instead was considered and rejected: at a radius small
// enough to clear the lane, the gate's own mouth (2*radius - post diameter) drops under the
// ball's 27mm and the scoop stops being able to accept a ball at all.
//
// This is ONE number. If the gate's new position reads wrong in playtest, move it back toward
// 0.045 and re-run qa/ball-trap-audit.js - the trade is trap rate against gate placement, and
// the table above is the exchange rate.
// SHOT-CORRIDOR REFACTOR: (0.027, 0.235) -> (-0.082, 0.242). The gate's edge-to-edge gap to the
// power-up orb was 0mm and to Saturn 29mm; it was reached 0 times in the 174-shot fan. Moving it
// off the centre column and onto Saturn's left shoulder gives it its own approach - the left-of-
// centre lane - while keeping it a genuinely tight shot. Clearances: 25.0mm to Saturn (sealed, no
// ball fits between them, so no pocket), 40.9mm to the boss bumper and 56mm to the left orbit
// rail's inner face (both real lanes). Capture radius, collar radius, guard posts, sequence
// timing and eject speed are all unchanged - only the position moves.
// Trap-audit revision: at (-0.082, 0.242) the gate sat directly in the boss bumper's fall line
// (boss at x=-0.045) with open board on both sides of its 3-post collar, and the outside V's
// between adjacent posts - a pre-existing feature of any 3-post horseshoe, and the baseline
// board's own worst cluster too - caught 7 seeded balls across three adjacent spots. Moved
// outboard so the rail's inner face closes the uphill V on that side and the collar is no longer
// under a bumper.
//
// Second trap-audit pass: -0.112 left a 26mm slot between the collar's outboard guard post and the
// rail, and 26mm against a 27mm ball is the WORST case, not a safe one - the ball half-enters,
// the solver lets it penetrate the last millimetre, and it jams. 5 of 258 seeds rested there. The
// working rule this board needs is a margin, not a hair: every gap either <=18mm (the ball cannot
// begin to enter) or >=42mm (a real lane).
//
// Third pass: -0.120 cleared that slot but left the collar's INBOARD guard post standing in
// Saturn's deflection shadow - balls rolling down the left corridor glance off Saturn's upper-left
// shoulder, fan out to the left, and 7 of 262 came to rest touching that post's uphill pole. A
// lone post on a tilted plane always has that crease (the comet's is the same effect, and the
// pre-refactor board caught balls on this gate's own post the same way); what decides whether it
// matters is how much traffic crosses it. -0.132 tucks the whole collar against the orbit rail,
// out of the deflection fan, and the cluster goes to zero. Remaining clearances: 6mm outboard to
// the rail (sealed), 67.2mm inboard to Saturn's edge (the corridor's through-route).
// Fourth trap-audit pass, after the rails were re-cut with a taper. A tapered rail's inner face is
// a long straight wall, and a long straight wall alongside a round obstacle is the most effective
// ball catcher on a board: the gap between them necessarily passes through the ball's own diameter
// somewhere, and the ball parks at that point. At x=-0.104 the collar's outboard guard post made
// exactly that V with the rail and caught 8 of 249 seeded balls at (-0.134, 0.240); the comet made
// the mirror of it on the right (7 balls).
//
// The fix is the same on both sides and follows from the arithmetic rather than from nudging: the
// left corridor is 97.6mm wide at this Z (rail inner face to Saturn's edge) and the collar is 49mm
// of that, so the 48.6mm left over can be split 24/24 - two trap-band gaps - or pushed to one side
// as 42/6. Pushed. The collar sits against Saturn's shoulder (25.2mm, sealed - nothing fits) with a
// 42.3mm lane outboard of it, which is the corridor's own through-route.
// Fifth trap-audit pass, and the one that resolved it by changing the arrangement rather than the
// numbers. Two rules came out of the four passes before it, and they conflict inside the left
// corridor:
//   * a gap to a long straight wall (an orbit rail's inner face) must be <=18mm or >=42mm
//   * a gap between two ROUND bodies must be >=40mm, full stop - "sealed" does not exist between
//     two convex surfaces, because the gap opens away from the closest point and necessarily
//     passes through the ball's diameter somewhere. Tucking the collar 10mm from Saturn produced
//     the worst cluster of the whole exercise: 22 of 229 seeded balls in one V.
// At z=0.225 the collar cannot satisfy both: clearing Saturn by 40mm needs x <= -0.102, clearing
// the rail by 42mm needs x >= -0.078.
//
// So the gate moved to the CENTRE channel instead, which is where the shot-corridor brief wanted
// it anyway ("CENTER: bumper cluster / Saturn / Vision Gate"). On the spine at z=0.060 its only
// neighbour is Saturn, 45.5mm above the far guard post, and the centre corridor is now a genuine
// two-outcome shot: the collar's mouth faces the flippers, so an accurate centre shot is captured
// and a fast one threads past the 15mm throat and carries on to Saturn. It is also the most
// reachable spot on the board, which the old (0.027, 0.235) position emphatically was not.
export const VISION_GATE_POS = { x: 0, z: 0.060 };
// SCOOP PASS. 0.015 -> 0.011. This is the capture trigger's own radius; the ball adds its 13.5mm
// to it, so the zone that actually captures was 28.5mm - LARGER than the 20mm collar the three
// guard posts stand on. A ball passing BESIDE the mouth at (+/-0.020, 0.040) is 28.3mm from the
// trigger's centre and was captured without ever entering the scoop, which is why a 210-shot
// angle/speed sweep found captures with the ball crossing the mouth at 0.16 m/s - a dribble paid
// the same 4000 as a struck shot. At 0.011 the catch zone is 24.5mm, inside the collar, so the
// ball has to be in the mouth rather than near it.
//
// Shrunk rather than moved: the gate's position has been through five trap-audit revisions (see
// VISION_GATE_POS above) and is not worth disturbing. Not shrunk further, either - a small trigger
// and a fast ball is how tunnelling starts, and qa/regression-suite.js's capture check plus the
// board's own CCD test are what bound this.
export const VISION_GATE_RADIUS_M = 0.011; // the actual capture trigger

// NO PHYSICAL COLLAR CHEEKS, and this is a measured decision rather than an omission. Three
// placements of a pair of flanking rails were built and swept:
//
//   below the mouth, flaring down/out   near misses reaching an inlane 14/34 -> 5/30
//   above the mouth, short              whole-sweep drains 64% -> 70%
//   above the mouth, long               captures 27 -> 29 (full-power row 7 -> 10), drains 76%
//
// None of them rejected a miss and one of them made the shot easier. The reason is structural:
// this gate sits on the board's centre spine directly above the drain gap, so a miss returns down
// the SAME line the shot went up. Any rail that channels one channels the other, and a channelled
// return goes straight down the middle where a ball scattered off the bare round guard posts
// sometimes reaches an inlane instead. The classic fix for a centre shot that drains - a post in
// the flipper gap - is a change to how every shot on the board drains, not to this approach.
//
// What the gate keeps instead is its three round guard posts, which scatter rather than channel,
// and the trigger change above, which is what makes a weak shot stop paying.

// The approach itself, painted. The gate's own hardware (collar, throat, halo, beacon, callout)
// all sits AT the mouth and says "there is a thing here"; nothing said where to shoot it from.
// This is the lane, on the centre spine, running up to the mouth - the same floor-tint idiom the
// orbits, the target bank, Saturn and the comet all use, so the board's five aimable shots are
// marked the same way. Narrow on purpose: 38mm keeps it clear of skillShotLane0's insert at
// x 0.020, and a wide bright strip on the centre line would read as an invitation to a shot whose
// capture band is 4-8 degrees. Decorative only, height 0.001 at y 0.0012.
export const VISION_GATE_APPROACH_TINT = { x: 0, z: 0.019, width: 0.038, length: 0.047 };
export const VISION_GATE_COLLAR_RADIUS_M = 0.02; // ring radius the 3 guard posts sit on
// Awarded once per successful capture - deliberately the single biggest configurable bonus on
// the board (bigger than Saturn's 3000, just under a mission completion's 5000), matching a
// signature feature's weight. Kept as its own named constant, not folded into MISSION_
// COMPLETE_BONUS or SCORE_SATURN, specifically so it stays independently tunable.
export const SCORE_VISION_GATE = 4000;
// Total capture->eject duration. Short enough to stay "a beat," not a cutscene - about 3x a
// mission-complete's own camera beat (500ms), the biggest existing moment on the board, since
// this is meant to read as bigger still without genuinely interrupting pinball flow.
// Vision Gate idle presentation (gate-polish pass, user-requested - "subtle rotating/spectral
// energy if cheap", "visually special while idle but dramatically brighter only during capture").
// Slower than SATURN_SPIN_RATE_RAD_MS: the halo sits inches from the boss bumper's own glare and a
// brisk spin there reads as a flicker rather than as calm energy. One full turn takes ~7s.
export const VISION_GATE_HALO_SPIN_RAD_MS = 0.0009;
// Radians per ms fed to a sine for the halo's spectral drift - one full breath every ~8.4s.
// Deliberately far below any flicker threshold; this is meant to be noticed only if watched for.
export const VISION_GATE_HALO_DRIFT_RATE = 0.00075;
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
// Ball-flow geometry pass (user-requested, measured): 470 -> 477. This is the axis the plunger
// rod, the resting ball, and the shooter-lane dressing all share, and at 470 it sat 17mm inboard
// of the launch lane's own centre line - hard against the lane's inner wall once the ball settled.
// Measured consequence: a ball launched from x=0.1785 tops out at z=-0.034 every time (it is aimed
// straight into rightGuide's lower end cap and thrown back), while the identical launch from the
// lane's centre reaches z=+0.30 to +0.41. 477 puts the rod on the lane's centre line, so a launch
// goes UP the lane instead of into its inner wall. LANE_INNER_WALL_X_PX still tracks it, keeping
// the same 30px ball-clearance invariant that constant's own comment describes. (rightGuide, named
// above, was removed by the orbit-geometry pass - see ORBIT_ARC_RADIUS_M - but the reasoning holds
// and this value is now what keeps the launch inboard of the right orbit's upper guide section.)
export const BALL_REST_X_PX = 477; // was 470, ported from resetBall()'s (CONFIG.width-70, CONFIG.height-220)
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
export const LANE_INNER_WALL_WIDTH_PX = 8; // launchLaneWall's own thickness, shared with buildLaunchLane()
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
//
// PLAYTEST BUG FIX, second half (user-reported: "hold the plunger and release and it wouldn't
// hit the ball with enough force, and it would constantly be stuck in a draining loop"). The
// primary cause of that report was createPlunger()'s prestep setting - see its own comment -
// but with that fixed the launch still never gave the player a ball to hit, and this is why.
//
// The cause is geometric, not a matter of force. rightGuide's lower end (a rotated bar; its two
// lower vertices measure to ~(0.186, -0.020) and ~(0.173, -0.025)) sat directly above the shooter
// lane's exit, and the ball leaves that lane at x=0.196 with a 0.0135 radius. At the old
// -(0.1417 + power*0.08) the ball drifted inboard just far enough to clip that end, rode its
// inboard face back OUTBOARD, and then ran the wall-hugging channel between the guide and
// rightWall up to about z=0.10 and straight back down into the right outlane.
//
// rightGuide itself no longer exists - the orbit-geometry pass replaced both mid-table guides with
// the orbit lanes' own inner guides (see ORBIT_ARC_RADIUS_M) - and the same pass deliberately omits
// the right lane's outer catching flank precisely because this exit path runs through it. The
// horizontal values below are still the measured ones and still matter: they are what puts the
// launched ball inboard of the orbit's upper guide section rather than into the wedge behind it,
// and the launch now runs the right lane to z=+0.297 instead of dying at z=-0.036.
//
// Measured on the real build, real Space hold-and-release, flipper reach taken from the bats'
// own meshes at runtime (x +-0.150, z -0.433..-0.334), n=5-6 per cell. "reach" is the only
// metric the player actually feels: did the ball ever come down somewhere a flipper could hit it?
//
//   base/ratio      tap (250-400ms)     mid (1200-1400ms)      full (2400ms)
//   150 / 0.08          0/6                   0/6                  0/6      flat 500 pts every time
//   106 / 0.05          0/6                   6/6                  6/6      3917 pts mid, 800 full
//   118 / 0.05          0/5                   1/5                  0/5
//     0 / 0             0/6                   0/6                   -
//
// The old values put the ball in front of a flipper 0 times out of 18, at every charge level -
// which is both halves of the report at once: nothing to hit ("not enough force") and an
// unreachable outlane drain on every single launch ("draining loop"). Charge length made no
// difference to the outcome, which is exactly why holding longer felt like it did nothing.
//
// Backing the kick off to 106/0.05 keeps the ball clear of that guide end, so it carries on
// inboard and fans into the playfield. Note that removing the kick entirely is NOT the fix: at
// 0/0 the ball runs the same outboard channel all the way to the comet (z=0.26-0.33, 1500 pts a
// launch) and then returns down the shooter lane into that same unreachable outlane, 0/12.
//
// This is a narrow empirical pocket, not a smooth optimum - 118 with the same ratio collapses
// back to 1/20. Do not nudge either constant without re-running that reach measurement. The
// formula's shape is unchanged; both constants keep their original meaning, just gentler.
export const PLUNGER_HORIZONTAL_BASE_MS = 106 * PX_TO_M; // was 150 - see the block comment above
export const PLUNGER_HORIZONTAL_RATIO = 0.05; // was 0.08

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
// How long the completed total holds on screen after the final tick, before the end-of-ball
// sequence moves on. Was a hardcoded 500 inside updateBonusCount(), and it held the words
// 'BONUS AWARDED' rather than the number: the count-up spent 15 ticks climbing toward a total
// the player then never actually saw, because the tick that landed it replaced the digits with
// a label. The final tick now holds the total itself, so this is genuinely "read the number"
// time and can be shorter than the label version needed.
export const BONUS_COUNT_HOLD_MS = 420;
// Reduced motion: skip the tick sequence entirely and award the whole bonus in one step -
// this is just how long the single resulting message stays legible before continuing.
// 150 -> 600. Reduced motion means less MOTION, not less information, and 150ms is under a
// third of the ~500ms it takes to read a five-digit number off the panel - the one beat the
// animated path spends a full second on was the one this path made unreadable. Still well
// under the animated path's own ~1.1s, so the sequence stays shorter here, as intended.
export const BONUS_COUNT_REDUCED_MOTION_MS = 600;

// ===================================
// End-of-ball sequence (user-requested). A drain used to communicate one thing - 'DRAINED!' -
// and then, after a silent delay, either paid a bonus or did not, and put the ball back with no
// announcement at all. Four beats now carry the four things a player actually needs at a ball
// change: the ball is gone, here is what the bonus paid, here is where the run stands, here is
// the next ball.
//
// Every duration below is spent by a render-loop-driven step machine (endOfBall in
// babylon-game.js), NOT by setTimeout, so the whole sequence freezes with a pause the way the
// bonus count it wraps already did - and so mobile and desktop spend the same beats, since
// nothing here is tied to input method, pointer type, or frame rate.
//
// The budget is deliberately tighter than what it replaces. Time from drain to a launchable
// ball: 800 + ~1140 (bonus) + 820 = ~2760ms with a bonus to pay, ~2000ms without, against the
// old path's fixed 2720ms - so the flow gained two beats of real information without costing
// the player a slower ball change. NEXT BALL is a message rather than a step, and the ball is
// already back at the plunger while it shows, so it holds nothing up.
// ===================================
export const END_OF_BALL_LOST_MS = 800;
// Only reached when this ball earned no bonus at all. Short on purpose - "you scored nothing
// here" is worth stating once so the beat is never silently missing, but it is not worth a
// full beat of the player's time.
export const END_OF_BALL_NO_BONUS_MS = 380;
// STATE + vision progress. The longest beat after the bonus: it is the only one carrying two
// facts, and it is the only place either of them is legible during a ball change - a backglass
// message covers the panel's own STATE row and VISION window outright (see redraw()'s early
// return), so these readouts are hidden for the whole sequence unless a beat states them.
export const END_OF_BALL_STATE_MS = 820;
// NEXT BALL. Not a step in the machine - the sequence ends as this is posted, with the ball
// already returned, so the player can launch straight through it.
export const END_OF_BALL_NEXT_BALL_MS = 900;

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

// Rank ladder (user-requested retheme). Was the naval ladder ported from "3D Pinball for
// Windows - Space Cadet" ('Cadet' ... 'Fleet Admiral'), which this table's layout is still
// modeled on (see buildObstacles()'s "authentic Space-Cadet-inspired" comment) - the ranks
// themselves now follow the game's own DMT-vision-quest theme instead. archive/KNOWN_ISSUES.md
// item 3's "LT Commander -> Fleet Admiral" refers to the old naval names at indices 4-8.
//
// PURELY THE DISPLAYED STRINGS. Index order, length (10), and therefore every consumer of it is
// unchanged: missionRequiredCount(rank) still scales 3+rank, completeMission()'s
// Math.min(rank + 1, RANK_NAMES.length - 1) still caps at index 9, and nothing persists a rank
// (localStorage holds only spiritball-highscore and spiritball-muted), so no saved state can
// carry an old name forward.
//
// Length matters here, not just wording: the backglass draws the rank with a shrink-to-fit loop
// that bottoms out at 45px (see the rank row in babylon-game.js), and a name still too wide at
// that floor runs under the multiplier/bonus badges. Measured by replaying that row's own layout
// maths against a 1024px canvas with the same font stack, in the monospace fallback (the widest
// case - a machine with Bahnschrift/DIN Condensed renders narrower):
//
// RE-MEASURED after the terminology pass renamed that row's legend from RANK to STATE. That is
// not cosmetic for this table: drawLegend() returns where it stopped and the value starts 22px
// after it, so the wider legend moved the value's left edge 196 -> 221 and took 25px off every
// figure in the right-hand column below.
//
//   badges showing   old ladder + RANK     this ladder + RANK    this ladder + STATE (shipping)
//   none             all fit (610/760)     all fit (517/760)     all fit (517/735)
//   multiplier only  all fit (564/577)     all fit (517/552)     all fit (517/552)
//   BOTH badges      4/10 over, max 100px  4/10 over, max 46px   6/10 over, max 70px
//                    ('Lieutenant JG',     ('DREAMWALKER',       (adds 'VISIONARY' and
//                    'Lt. Commander',      'COSMIC SELF' 46px,   'ASCENDANT' at 16px each;
//                    'Fleet Admiral')      'PSYCHONAUT',         'DREAMWALKER'/'COSMIC SELF'
//                                          'GATEKEEPER' 18px)    70px, the other two 43px)
//
// So: the both-badges overflow is a PRE-EXISTING limit of that row's 45px floor - the old naval
// ladder overflowed further than anything here does - but the STATE legend genuinely made it
// worse, 4 of 10 to 6 of 10. It only shows while the 2X score power-up and a bonus multiplier
// above 1X are BOTH lit, which is an uncommon state, and it is a layout problem rather than a
// content one, so it is recorded rather than worked around by picking shorter words. The lever,
// if it is ever worth pulling, is that 45px floor (or letting the value wrap) in the rank row
// itself - not these strings and not the legend.
export const RANK_NAMES = [
    'INITIATE', 'SEEKER', 'DREAMER', 'WITNESS', 'DREAMWALKER',
    'VISIONARY', 'PSYCHONAUT', 'GATEKEEPER', 'ASCENDANT', 'COSMIC SELF'
];

// One colour per state index, parallel to RANK_NAMES above - the single source of truth for
// "what colour is this state", so a future edit cannot leave two lists disagreeing. Indexed the
// same way (STATE_COLORS[mission.rank]); the length is asserted against RANK_NAMES below rather
// than trusted.
//
// The arc the user asked for: cool cyan -> violet (early), violet -> magenta -> amber (middle),
// gold -> near-white -> spectral (late). Index 0 is deliberately the exact colour the state row
// used before this existed (#7dffe0), so a fresh game looks untouched and the progression is
// something the player discovers by earning it rather than a restyle they notice on load.
//
// Designed on SATURATION and HUE, not brightness. The obvious way to write "ascending" is to
// make later states brighter, and that is the version that would have turned a quiet panel into
// a beacon by COSMIC SELF; the late states desaturate toward white instead, so the ladder reads
// as "cooling into light" rather than "getting louder".
//
// Brightness is NOT flat across the ladder, and an earlier draft of this comment wrongly claimed
// it was. Measured WCAG relative luminance runs 0.813 at INITIATE down to 0.470 around
// DREAMWALKER/VISIONARY and back up to 0.791 at COSMIC SELF - a 1.73x spread. That dip is a
// property of the hues themselves: a saturated violet simply cannot reach the luminance of a
// saturated cyan-mint, and forcing it to would mean desaturating it until it stopped being
// violet. What IS held, and what qa/state-palette.js pins, is the part that actually protects the
// panel:
//   - nothing exceeds index 0's brightness, so no state is ever louder than this row already was
//     before the palette existed (ASCENDANT and COSMIC SELF were pulled down from #ffe7b4 and
//     #eff6ff, which both broke that ceiling, to the values below);
//   - no adjacent pair jumps more than ~0.12 of luminance, which is what keeps the progression
//     GRADUAL rather than a set of unrelated colours;
//   - all ten clear 7:1 contrast against the panel's own face, sampled from the real texture
//     (measured range 10.1:1 to 18.7:1).
//
// Used in exactly two places, both on the backglass: the STATE row's value, and the ASCENSION
// message that announces a new state. Nothing on the playfield, nothing near the ball, and the
// backglass mesh is already excluded from the GlowLayer (see its addExcludedMesh call), so none
// of these can bloom into the scene or compete with the ball no matter how pale they get.
export const STATE_COLORS = [
    '#7dffe0', // 0 INITIATE     cyan-mint - the pre-existing state colour, unchanged
    '#7be9ff', // 1 SEEKER       cool cyan
    '#97ceff', // 2 DREAMER      cyan drifting blue
    '#b7b4ff', // 3 WITNESS      blue-violet
    '#cfa4ff', // 4 DREAMWALKER  violet
    '#f09bea', // 5 VISIONARY    violet-magenta
    '#ffae93', // 6 PSYCHONAUT   magenta warming toward amber
    '#ffc96b', // 7 GATEKEEPER   gold
    '#ffdc9e', // 8 ASCENDANT    near-white gold
    '#d5e8ff'  // 9 COSMIC SELF  spectral - desaturated back to a cool white, past colour
];
// A mismatch here would silently hand STATE_COLORS[rank] === undefined to a canvas fillStyle,
// which paints BLACK on a black panel rather than throwing - i.e. an invisible state row, found
// only by looking. Cheap to assert at module load instead.
if (STATE_COLORS.length !== RANK_NAMES.length) {
    throw new Error('STATE_COLORS must have one entry per RANK_NAMES entry');
}

// One mission slot per mission-target index (0-2, see MISSION_TARGET_BANK), each tied to a
// distinct scoring category so progress can only come from deliberate play toward the
// selected mission, not incidental hits of other types - the spirit of the original
// CONFIG.missions[rank][index] table (archive/KNOWN_ISSUES.md items 3 and 5) without its
// separate launch-ramp "start" step, which has no equivalent object in this 3D build (a
// mission-target hit selects AND starts in one action here - a deliberate simplification,
// not an oversight).
//
// Mission NAMES rethemed (user-requested) to match the game's own vision-quest register, the
// same pass that rethemed RANK_NAMES above. `type` is the mechanic and is UNTOUCHED: it is what
// progressMission() matches against ('bumper'/'comet'/'lane', see its own comment), what the
// bumper/comet/re-entry-lane hit handlers pass in, and the array ORDER is what binds each entry
// to its mission target, since startMission() is called with the struck target's own index. Only
// the display strings below moved:
//   bumper -> was 'BUMPER RUN'        (and 'satellite'/'SATELLITE SWEEP' before the comet reskin)
//   comet  -> was 'COMET CHASE'
//   lane   -> was 'RE-ENTRY CIRCUIT'
//
// Both surfaces that show a mission name were measured against the new strings rather than
// assumed - see the fit note at RANK_NAMES for why that matters here:
//   - backglass MISSION window: shrink-to-fit from 84px, floor 52px, 920px of room. All three
//     names fit at the full 84px with no shrinking, same as the old ones (widest 809px, in the
//     monospace fallback, which is the widest the stack can render).
//   - #mission-hud (index.html): a 150px cap with text-overflow:ellipsis. 'CHAKRA AWAKENING'
//     fits at the 12px desktop size and is ellipsised at the 11px <=480px size - which is
//     exactly what 'RE-ENTRY CIRCUIT' (also 16 chars) already did, so phone behaviour is
//     unchanged. See that rule's own comment for the numbers.
//
// `objective` (user-requested) is a SHORT player-facing "what do I actually shoot" line. Pure
// display data - nothing reads it but the activation message in startMission(). It is not a
// second mechanic: progress still comes from `type` alone.
//
// It is shown at ONE surface, and that was decided by measuring the three places a vision name
// reaches the player rather than by taste:
//
//   activation message plate   ~294px tall, wraps to two lines, shrinks 150 -> 48px.  SHOWN
//                              'VISION: <name>: <objective>' lands at 58/62/54px with the wrap
//                              breaking exactly between name and objective for all three. No
//                              overflow, comfortably above the 48px floor.
//   steady VISION window       NOT SHOWN. There is no room at all: the 84px name ends at y=412
//                              and the progress bar starts at y=414 - a 2px gap - inside a
//                              window whose bottom edge is y=466.
//   #mission-hud (index.html)  NOT SHOWN. Two of the three objectives already ellipsise at the
//                              DESKTOP width ('HIT THE POP BUMPERS' 137px into 123px,
//                              'COMPLETE THE RE-ENTRY LANES' 194px into 123px), before the
//                              narrower <=480px size is even reached.
//
// Cost worth knowing about, since it is the reason this is a judgement call and not a free win:
// carrying the objective drops the activation flash from 106px to 54-62px, i.e. roughly 26 to
// 17 CSS px on screen. drawMessage()'s own comment sets this plate's bar at "about 34 CSS px on
// screen, against the 18 the old treatment managed" - so the combined line sits at the bottom of
// that range. Showing the objective ALONE would hold ~106px (the name is still carried by the
// VISION window and #mission-hud the moment the flash clears); that is a one-line change here if
// the bigger flash is worth more than naming the vision twice.
//
// Keep these short. The plate is the constraint: 27 characters ('COMPLETE THE RE-ENTRY LANES')
// is what pins the size to 54px, and anything longer will shrink it further.
// Vision-selection feedback (user-requested). How long the objective's own playfield elements
// stay lit after a vision is selected, and how long the name+objective message dwells. The cue is
// deliberately shorter than the message: the text is what the player reads, the cue is what makes
// them look at the table, and a cue still burning after the message has gone reads as a state
// change rather than as an answer to it.
export const MISSION_CUE_MS = 620;
export const MISSION_SELECT_MESSAGE_MS = 1400;
export const MISSION_DEFS = [
    { type: 'bumper', name: 'CHAKRA AWAKENING', objective: 'HIT THE POP BUMPERS' },
    { type: 'comet', name: 'ASTRAL PURSUIT', objective: 'STRIKE THE COMET' },
    { type: 'lane', name: 'RETURN TO BODY', objective: 'COMPLETE THE RE-ENTRY LANES' }
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
// '#rrggbb' -> [r, g, b] bytes. Distinct from hexToColor3() below, which takes a NUMERIC hex
// and returns a BABYLON.Color3: STATE_COLORS are CSS strings (canvas fillStyle takes those
// directly), and two consumers now need to take them apart - the backglass message halo and the
// ASCENSION screen flash. One parser rather than one per call site.
export function hexStringToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

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
// (green), so the inlane/outlane lamps read as their own thing, not a re-skin of the reentry
// lanes' mission-tied "lit" state (a genuinely different mechanic, see SIDE_LANES' block
// comment). Visual-polish pass (user-requested - "clear visual separation between inlanes/
// outlanes/orbits"): this identity now belongs to the INLANE specifically - see
// HEX_OUTLANE_LAMP directly below for why the outlane split off its own color instead of
// continuing to share this one.
export const HEX_LANE_LAMP = 0xffaa00;
// Outlanes previously shared HEX_LANE_LAMP with inlanes - visually identical despite being the
// "safe return" vs. "likely drain" halves of the same rollover pair, exactly the ambiguity a
// player relies on lane color to resolve at a glance on a real machine. A saturated warning red,
// picked to sit clearly apart from every other warm color already on the board (HEX_KICKBACK_LAMP
// 0xff5500's orange, HEX_SKILL_SHOT_LAMP 0xff3366's pink-red) - important since the kickback lamp
// physically sits on this same outlane, further down toward the drain, and the two must still
// read as separate signals when both are visible together.
export const HEX_OUTLANE_LAMP = 0xff1a33;
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
