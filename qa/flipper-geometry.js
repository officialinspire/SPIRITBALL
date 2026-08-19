// SPIRITBALL flipper-geometry regression test.
//
// Focused, lightweight companion to qa/stabilization-suite.js. That suite's own INPUT/GAMEPLAY
// sections already check flipper.active booleans (does activateFlipper() flip a flag, does a
// keypress flip it) - this one instead checks the flippers' actual WORLD-SPACE geometry (pivot/
// tip positions in 3D), which a booleans-only check can't see at all. That distinction is not
// hypothetical: a real flipper QA pass on this exact codebase needed pivot/tip world positions,
// not .active, to confirm the pivot-hierarchy rewrite actually keeps the hinge fixed and swings
// the tip the correct direction - see this file's own assertions below for the same checks made
// permanent and automated.
//
// Reusability, by design: unlike qa/stabilization-suite.js's window.__qaHook (deliberately broad,
// meant to be hand-patched into babylon-game.js right before a run and removed after), this test
// reads window.__flipperDebug - a small, PERMANENT, read-only hook already shipped in
// babylon-game.js behind the exact same ?dev=1 gate as the pre-existing window.__triggerDebug
// (see its own declaration, right next to __triggerDebug's, in main()). Nothing to patch by hand:
// serve the repo and run this file.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/flipper-geometry.js             (assertions only)
//   node qa/flipper-geometry.js --screenshots   (also writes qa/output/flipper-*.png)
//   PORT=8971 node qa/flipper-geometry.js   (override the default port)
//
// qa/output/ is gitignored - screenshots are a human-inspection aid, regenerated per run, never
// committed.
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8971;
const BASE = `http://localhost:${PORT}/index.html?dev=1`;
const WANT_SCREENSHOTS = process.argv.includes('--screenshots');
const OUTPUT_DIR = path.join(__dirname, 'output');

const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

// Tolerances - this is a deterministic kinematic system (setFlipperAngle() sets an exact
// rotationQuaternion, no physics-solver noise), so these stay tight. EPS_M is generous next to
// float32 GPU transform precision; EPS_DEG covers the motor's own hard-clamp-to-exact-target
// behavior (see updateFlipperMotor()'s comment in babylon-game.js) once fully settled.
const EPS_M = 0.0003; // 0.3mm
const EPS_DEG = 1.0;

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond, detail });
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${!cond && detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function toDeg(rad) {
  return rad * 180 / Math.PI;
}

// Reads pivot/tip world positions for both flippers at the current instant, via
// window.__flipperDebug (see its own declaration in babylon-game.js for what it exposes and why).
async function readGeometry(page) {
  return page.evaluate(async () => {
    const h = window.__flipperDebug;
    // Real constant, dynamically imported from the game's own config module - NOT
    // mesh.getBoundingInfo().boundingSphere, which reads ~2.5x too large here (the same inflated-
    // bounding-sphere trap documented in this repo's obstacle-power-hierarchy tuning notes) and
    // silently turned the drain-gap assertion below into nonsense on its first run.
    const cfg = await import('../js/config.js');
    function snapshot(flipper) {
      const pivot = h.pivotWorldPosition(flipper);
      const tip = h.tipWorldPosition(flipper);
      return {
        active: flipper.active,
        currentAngleRad: flipper.currentAngleRad,
        restAngleRad: flipper.restAngleRad,
        pivot: { x: pivot.x, y: pivot.y, z: pivot.z },
        tip: { x: tip.x, y: tip.y, z: tip.z }
      };
    }
    return {
      FLIPPER_SWEEP_RAD: h.FLIPPER_SWEEP_RAD,
      ballDiameterM: cfg.BALL_DIAMETER_M,
      left: snapshot(h.leftFlipper),
      right: snapshot(h.rightFlipper)
    };
  });
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(BASE);
  await page.waitForTimeout(1800);

  const hookPresent = await page.evaluate(() => !!window.__flipperDebug);
  check('window.__flipperDebug is present under ?dev=1', hookPresent);
  if (!hookPresent) {
    console.log('\nCannot continue without the debug hook - is babylon-game.js up to date?');
    await browser.close();
    process.exit(1);
  }

  await page.mouse.click(450, 650); // dismiss the menu (also starts the game)
  await page.waitForTimeout(300);

  console.log('\n=== FLIPPER GEOMETRY ===');

  if (WANT_SCREENSHOTS) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    // The ?dev=1 tuning/debug HUD (#status-panel) this hook rides along with covers most of the
    // table - useful for the numeric cross-check below, not for a human screenshot. Hiding it is
    // a pure external DOM visibility toggle from the test harness, not a game-code change (the
    // panel, and __flipperDebug, are both still fully live underneath).
    await page.evaluate(() => {
      const panel = document.getElementById('status-panel');
      if (panel) panel.style.display = 'none';
    });
  }

  // --- REST ---
  const rest = await readGeometry(page);
  if (WANT_SCREENSHOTS) {
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'flipper-rest.png') });
  }

  // --- LEFT fired (real ArrowLeft keypress - exercises the actual input path, not a direct
  // function call, so this also proves the key mapping itself, not just the flipper object) ---
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(300); // comfortably past the ~115ms full-sweep time, settled at the clamp
  const leftFired = await readGeometry(page);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(400); // let it fully return before the next capture

  // --- RIGHT fired (real ArrowRight keypress) ---
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  const rightFired = await readGeometry(page);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(400);

  if (WANT_SCREENSHOTS) {
    // Both fired together - the classic "V" barrier shot, most legible single frame for a human
    // to eyeball.
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'flipper-active.png') });
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);
  }

  await browser.close();

  // =====================================================================================
  // Assertions
  // =====================================================================================

  // --- pivot displacement ~= 0 (the pivot-hierarchy's core guarantee: the hinge never moves,
  // only rotates) - checked across every captured instant, both sides. ---
  const pivotDriftLeft = Math.max(
    dist(rest.left.pivot, leftFired.left.pivot),
    dist(rest.left.pivot, rightFired.left.pivot)
  );
  const pivotDriftRight = Math.max(
    dist(rest.right.pivot, leftFired.right.pivot),
    dist(rest.right.pivot, rightFired.right.pivot)
  );
  check('left pivot displacement ~= 0 across rest/left-fired/right-fired', pivotDriftLeft < EPS_M, { pivotDriftLeft, EPS_M });
  check('right pivot displacement ~= 0 across rest/left-fired/right-fired', pivotDriftRight < EPS_M, { pivotDriftRight, EPS_M });

  // --- left/right REST geometry mirrors (mirrored across the table's own X=0 centerline) ---
  check('rest: pivots mirror in X (left.x ~= -right.x)', Math.abs(rest.left.pivot.x + rest.right.pivot.x) < EPS_M,
    { leftX: rest.left.pivot.x, rightX: rest.right.pivot.x });
  check('rest: pivots agree in Y/Z', Math.abs(rest.left.pivot.y - rest.right.pivot.y) < EPS_M && Math.abs(rest.left.pivot.z - rest.right.pivot.z) < EPS_M,
    { left: rest.left.pivot, right: rest.right.pivot });
  check('rest: tips mirror in X (left.x ~= -right.x)', Math.abs(rest.left.tip.x + rest.right.tip.x) < EPS_M,
    { leftX: rest.left.tip.x, rightX: rest.right.tip.x });
  check('rest: tips agree in Y/Z', Math.abs(rest.left.tip.y - rest.right.tip.y) < EPS_M && Math.abs(rest.left.tip.z - rest.right.tip.z) < EPS_M,
    { left: rest.left.tip, right: rest.right.tip });

  // --- left/right ACTIVE geometry mirrors (each side's own fired tip, compared to the other
  // side's own fired tip - captured in separate single-side activations so neither can
  // contaminate the other) ---
  check('active: fired tips mirror in X (left.x ~= -right.x)',
    Math.abs(leftFired.left.tip.x + rightFired.right.tip.x) < EPS_M,
    { leftTipX: leftFired.left.tip.x, rightTipX: rightFired.right.tip.x });
  check('active: fired tips agree in Y/Z',
    Math.abs(leftFired.left.tip.y - rightFired.right.tip.y) < EPS_M && Math.abs(leftFired.left.tip.z - rightFired.right.tip.z) < EPS_M,
    { leftTip: leftFired.left.tip, rightTip: rightFired.right.tip });

  // --- rest tips are down/inward. "Down" here means toward the camera/drain end of the table
  // (smaller world Z - see FLIPPER_Z_M's own comment: negative Z is the near-camera end), NOT
  // world-vertical Y (a flipper's Y never changes at all - see the pivot-displacement check
  // above - rotation is purely about the Y axis). "Inward" means the tip sits closer to the
  // table's centerline (X=0) than its own hinge does - the real-machine mounting (see
  // FLIPPER_PIVOT_X_M's "MOUNTING LAYOUT" comment in config.js) hinges each bat at the OUTER end
  // with the bat reaching in toward center, so a correct rest pose is inboard-and-down. The two
  // tips stop short of the centerline, leaving the classic center drain gap - that gap's width is
  // asserted separately below. ---
  check('rest: LEFT tip is inboard of its own hinge (closer to centerline)', rest.left.tip.x > rest.left.pivot.x + EPS_M,
    { tipX: rest.left.tip.x, pivotX: rest.left.pivot.x });
  check('rest: RIGHT tip is inboard of its own hinge (closer to centerline)', rest.right.tip.x < rest.right.pivot.x - EPS_M,
    { tipX: rest.right.tip.x, pivotX: rest.right.pivot.x });
  // --- Real-machine mounting invariants: hinges outboard of the tips (a bat reaching IN, not
  // OUT - the exact thing that was mirrored before and made the flippers read as "backwards"),
  // and a center drain gap wide enough for the ball to pass between two idle flippers, which is
  // what makes flipping matter at all. ---
  check('mounting: LEFT hinge is outboard of its own tip', Math.abs(rest.left.pivot.x) > Math.abs(rest.left.tip.x) + EPS_M,
    { pivotX: rest.left.pivot.x, tipX: rest.left.tip.x });
  check('mounting: RIGHT hinge is outboard of its own tip', Math.abs(rest.right.pivot.x) > Math.abs(rest.right.tip.x) + EPS_M,
    { pivotX: rest.right.pivot.x, tipX: rest.right.tip.x });
  const restGapM = rest.right.tip.x - rest.left.tip.x;
  const ballD = rest.ballDiameterM;
  check('mounting: idle flippers leave a ball-sized center drain gap (1-2 ball diameters)',
    restGapM > ballD && restGapM < ballD * 2,
    { restGapM, ballDiameterM: ballD, ballDiameters: restGapM / ballD });
  check('rest: LEFT tip is toward the camera/drain end (smaller Z than its pivot)', rest.left.tip.z < rest.left.pivot.z - EPS_M,
    { tipZ: rest.left.tip.z, pivotZ: rest.left.pivot.z });
  check('rest: RIGHT tip is toward the camera/drain end (smaller Z than its pivot)', rest.right.tip.z < rest.right.pivot.z - EPS_M,
    { tipZ: rest.right.tip.z, pivotZ: rest.right.pivot.z });

  // --- active tips move up/inward relative to their own rest position. "Up" = larger Z (further
  // from the camera/drain end, up-table). "Inward" = closer to the table centerline than rest. ---
  const leftInwardRest = Math.abs(rest.left.tip.x - rest.left.pivot.x);
  const leftInwardActive = Math.abs(leftFired.left.tip.x - leftFired.left.pivot.x);
  check('active: LEFT tip moves up (larger Z than its own rest tip)', leftFired.left.tip.z > rest.left.tip.z + EPS_M,
    { restZ: rest.left.tip.z, activeZ: leftFired.left.tip.z });
  check('active: LEFT tip moves inward (closer to centerline than its own rest tip)', leftInwardActive < leftInwardRest - EPS_M,
    { leftInwardRest, leftInwardActive });

  const rightInwardRest = Math.abs(rest.right.tip.x - rest.right.pivot.x);
  const rightInwardActive = Math.abs(rightFired.right.tip.x - rightFired.right.pivot.x);
  check('active: RIGHT tip moves up (larger Z than its own rest tip)', rightFired.right.tip.z > rest.right.tip.z + EPS_M,
    { restZ: rest.right.tip.z, activeZ: rightFired.right.tip.z });
  check('active: RIGHT tip moves inward (closer to centerline than its own rest tip)', rightInwardActive < rightInwardRest - EPS_M,
    { rightInwardRest, rightInwardActive });

  // --- stroke magnitude matches FLIPPER_SWEEP_RAD - checked TWO independent ways, required to
  // agree with each other AND with the config constant, so this catches a bug in either the
  // angle-stepping motor OR the pivot/tip position math alone: ---
  //   1. angleStroke: directly from the flipper's own currentAngleRad vs restAngleRad.
  //   2. geometricStroke: purely from world-space tip positions (the angle between the rest-tip
  //      and active-tip vectors, both relative to the pivot) - deliberately never reads
  //      currentAngleRad/restAngleRad, so it can't pass merely because the motor's own bookkeeping
  //      says it should have.
  function geometricStrokeDeg(pivot, tipA, tipB) {
    const vA = { x: tipA.x - pivot.x, z: tipA.z - pivot.z };
    const vB = { x: tipB.x - pivot.x, z: tipB.z - pivot.z };
    const magA = Math.hypot(vA.x, vA.z), magB = Math.hypot(vB.x, vB.z);
    const dot = (vA.x * vB.x + vA.z * vB.z) / (magA * magB);
    return toDeg(Math.acos(Math.max(-1, Math.min(1, dot))));
  }
  const sweepDeg = toDeg(rest.FLIPPER_SWEEP_RAD);

  const leftAngleStrokeDeg = toDeg(Math.abs(leftFired.left.currentAngleRad - leftFired.left.restAngleRad));
  const leftGeometricStrokeDeg = geometricStrokeDeg(rest.left.pivot, rest.left.tip, leftFired.left.tip);
  check('LEFT angle-based stroke matches FLIPPER_SWEEP_RAD', Math.abs(leftAngleStrokeDeg - sweepDeg) < EPS_DEG,
    { leftAngleStrokeDeg, sweepDeg });
  check('LEFT geometric (position-only) stroke matches FLIPPER_SWEEP_RAD', Math.abs(leftGeometricStrokeDeg - sweepDeg) < EPS_DEG,
    { leftGeometricStrokeDeg, sweepDeg });

  const rightAngleStrokeDeg = toDeg(Math.abs(rightFired.right.currentAngleRad - rightFired.right.restAngleRad));
  const rightGeometricStrokeDeg = geometricStrokeDeg(rest.right.pivot, rest.right.tip, rightFired.right.tip);
  check('RIGHT angle-based stroke matches FLIPPER_SWEEP_RAD', Math.abs(rightAngleStrokeDeg - sweepDeg) < EPS_DEG,
    { rightAngleStrokeDeg, sweepDeg });
  check('RIGHT geometric (position-only) stroke matches FLIPPER_SWEEP_RAD', Math.abs(rightGeometricStrokeDeg - sweepDeg) < EPS_DEG,
    { rightGeometricStrokeDeg, sweepDeg });

  // --- ArrowLeft affects the physical LEFT paddle (and only it); ArrowRight affects the
  // physical RIGHT paddle (and only it). Driven through the real keyboard event path above (not
  // a direct activateFlipper() call), so this proves the actual key mapping, not just the
  // flipper objects' own geometry in isolation. ---
  const leftMovedOnArrowLeft = dist(rest.left.tip, leftFired.left.tip);
  const rightStayedOnArrowLeft = dist(rest.right.tip, leftFired.right.tip);
  check('ArrowLeft moves the physical LEFT paddle', leftMovedOnArrowLeft > 0.01, { leftMovedOnArrowLeft });
  check('ArrowLeft leaves the physical RIGHT paddle untouched', rightStayedOnArrowLeft < EPS_M, { rightStayedOnArrowLeft, EPS_M });

  const rightMovedOnArrowRight = dist(rest.right.tip, rightFired.right.tip);
  const leftStayedOnArrowRight = dist(rest.left.tip, rightFired.left.tip);
  check('ArrowRight moves the physical RIGHT paddle', rightMovedOnArrowRight > 0.01, { rightMovedOnArrowRight });
  check('ArrowRight leaves the physical LEFT paddle untouched', leftStayedOnArrowRight < EPS_M, { leftStayedOnArrowRight, EPS_M });

  check('no uncaught page errors', pageErrors.length === 0, pageErrors);

  if (WANT_SCREENSHOTS) {
    console.log(`\nScreenshots written to ${OUTPUT_DIR}/ (flipper-rest.png, flipper-active.png)`);
  }

  console.log('\n=== SUMMARY ===');
  const totalPass = results.filter((r) => r.pass).length;
  const totalFail = results.filter((r) => !r.pass).length;
  console.log(`TOTAL: ${totalPass} passed, ${totalFail} failed`);
  process.exit(totalFail > 0 ? 1 : 0);
})();
