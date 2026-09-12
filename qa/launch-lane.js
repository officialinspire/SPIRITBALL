// SPIRITBALL launch-lane regression test.
//
// One question, measured rather than eyeballed: does a plunge put the ball into play?
//
// Written after a playtest bug that made the game unplayable on every device - "the ball never
// leaves the lane and always drains/falls back". The shooter lane feeds the RIGHT ORBIT on this
// board (the orbit-geometry pass put the orbit's mouth directly above the lane's exit), so a
// launched ball has to climb the entire orbit before it can rejoin the playfield. The shipped
// plunger power had been tuned against an older board where the lane emptied into open
// playfield, so the ball stalled half way up the orbit and rolled straight back onto the
// plunger, every single launch. See PLUNGER_MIN_POWER_MS/PLUNGER_HORIZONTAL_BASE_MS in
// js/config.js for the full investigation and the measurements that fixed it.
//
// Why this exists next to qa/circulation-suite.js, which also fires plunger launches: that
// suite's plunger tripwire asks whether the ball reaches the board's MIDDLE third, and a ball
// stalling in the orbit lane crosses that line before rolling back, so the suite passed at 100%
// throughout the bug (its regions/meanZ columns did show it - 4/9 regions and meanZ 0.197
// broken, 8/9 and 0.399 fixed - but nothing failed). This test asks the only question a player
// cares about instead: did the ball end up somewhere a flipper could hit it?
//
// Determinism: the game is frozen (scene.physicsEnabled = false, so the render loop stops
// stepping physics) and this rig drives scene.getPhysicsEngine()._step() itself at a fixed 1/60.
// Headless Chromium renders this scene at a few FPS, so anything measured off the live render
// loop measures the sandbox rather than the physics.
//
// Faithful to the real launch in the two ways that decide the outcome:
//   1. Velocities come from the real constants via the same expression handleLaunchRelease()
//      uses, so retuning config.js retunes this test and the two cannot drift apart.
//   2. LINEAR velocity only, angular velocity zeroed - a plunger imparts pure translation. This
//      is not a detail: a rig that launches with a matching no-slip spin skips the slide-to-roll
//      transition and lands ~29% faster than the game, which is enough to clear the orbit on
//      power settings that cannot clear it in play. That is how the bug shipped.
//
// Reads window.__flipperDebug - the permanent read-only ?dev=1 hook. Nothing to hand-patch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/launch-lane.js
//   PORT=8971 node qa/launch-lane.js       (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8971;
const BASE = `http://localhost:${PORT}/index.html?dev=1`;
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

// Charge levels sampled across the real 0..100% window, including both ends: a bare tap is the
// realistic worst case (it is what a player does before they know the plunger charges at all)
// and full charge is the other end of the range the player can select.
const CHARGE_LEVELS = [0, 0.25, 0.5, 0.75, 1];
// Starting offsets across the lane's width, in metres from the ball's rest X. The lane is ~56mm
// wide and the ball is 27mm, so +-5mm covers where a ball can actually come to rest in it. This
// is the sample that matters: a launch tuned from one exact start position can look fine and
// still fail for a ball sitting a few millimetres off.
const START_OFFSETS_M = [-0.005, -0.0025, 0, 0.0025, 0.005];
// Enough simulated time for a ball to climb the orbit, come round the top and return down the
// board - a full trip measured at ~3s, so this is not a tight budget.
const FLIGHT_SECONDS = 13;

// A launch "reaches play" when the ball leaves the shooter lane inboard AND later comes down
// into the band the flippers sweep. Both halves matter: leaving the lane without ever coming
// back down in reach is the outlane death the same bug produced at other power settings.
const SHOT = (p) => {
  const d = window.__flipperDebug;
  const pe = d.scene.getPhysicsEngine();
  const body = d.mainBall.aggregate.body;
  const mesh = d.mainBall.mesh;
  const DT = 1 / 60;

  // Park the ball at its real rest spot, offset across the lane, and let one step settle it.
  body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
  body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
  mesh.position.set(p.restX + p.offset, p.restY, p.restZ);
  body.disablePreStep = false;
  pe._step(DT);
  body.disablePreStep = true;

  // The launch itself - exactly what handleLaunchRelease() does.
  body.setLinearVelocity(new BABYLON.Vector3(p.vx, 0, p.vz));
  body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));

  let maxZ = -99;
  let leftLane = false;
  let reached = false;
  for (let i = 0; i < 60 * p.seconds; i++) {
    pe._step(DT);
    const { x, y, z } = mesh.position;
    if (z > maxZ) maxZ = z;
    // Inboard of launchLaneWall's inner face. Inside the lane that wall makes this
    // impossible, so crossing it IS leaving the lane - no z window needed.
    if (!leftLane && x < p.laneInnerX) leftLane = true;
    if (leftLane && !reached && z < p.flipperZTop && z > p.flipperZBottom && Math.abs(x) <= p.flipperReachX) reached = true;
    if (z < p.drainZ || y < -0.05) break;
  }
  return { reached, leftLane, maxZ: +maxZ.toFixed(3) };
};

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond });
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}  ${detail === undefined ? '' : JSON.stringify(detail)}`);
}

(async () => {
  const cfg = await import('../js/config.js');
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.click('#startup-gate-btn').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#intro-skip-btn').catch(() => {});
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const menu = document.getElementById('menu-overlay');
    if (menu && getComputedStyle(menu).display !== 'none') menu.click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => { window.__flipperDebug.scene.physicsEnabled = false; });

  // The ball's own resting transform, read rather than restated - resetBallToPlunger() is the
  // authority on where a ball waits for its launch.
  const rest = await page.evaluate(() => {
    const m = window.__flipperDebug.mainBall.mesh;
    return { x: m.position.x, y: m.position.y, z: m.position.z };
  });
  // The flippers' own bats decide what "a flipper could have hit it" means, at runtime, so a
  // future flipper move cannot silently invalidate this test's idea of reach.
  const bats = await page.evaluate(() => {
    const d = window.__flipperDebug;
    const box = (f) => f.mesh.getBoundingInfo().boundingBox;
    const l = box(d.leftFlipper), r = box(d.rightFlipper);
    return {
      zTop: Math.max(l.maximumWorld.z, r.maximumWorld.z),
      zBottom: Math.min(l.minimumWorld.z, r.minimumWorld.z),
      reachX: Math.max(Math.abs(l.minimumWorld.x), Math.abs(r.maximumWorld.x))
    };
  });

  const geom = {
    restX: rest.x, restY: rest.y, restZ: rest.z,
    // Inboard face of launchLaneWall - past it is out of the shooter lane.
    laneInnerX: cfg.toWorldX(cfg.LANE_INNER_WALL_X_PX) - (cfg.LANE_INNER_WALL_WIDTH_PX * cfg.PX_TO_M) / 2,
    flipperZTop: bats.zTop + 0.02,
    flipperZBottom: bats.zBottom - 0.03,
    flipperReachX: bats.reachX + 0.01,
    drainZ: -(cfg.TABLE_LENGTH_M / 2) - 0.01,
    seconds: FLIGHT_SECONDS
  };

  console.log('\n=== LAUNCHES ===');
  const perCharge = [];
  for (const t of CHARGE_LEVELS) {
    const power = cfg.PLUNGER_MIN_POWER_MS + (cfg.PLUNGER_MAX_POWER_MS - cfg.PLUNGER_MIN_POWER_MS) * t;
    // Same expression as handleLaunchRelease(), so the two cannot drift apart.
    const vx = -(cfg.PLUNGER_HORIZONTAL_BASE_MS + power * cfg.PLUNGER_HORIZONTAL_RATIO);
    let reached = 0, left = 0, bestZ = -99;
    for (const offset of START_OFFSETS_M) {
      const r = await page.evaluate(SHOT, { ...geom, offset, vx, vz: power });
      if (r.reached) reached++;
      if (r.leftLane) left++;
      if (r.maxZ > bestZ) bestZ = r.maxZ;
    }
    perCharge.push({ charge: `${Math.round(t * 100)}%`, speed: +power.toFixed(2), reached, left, bestZ: +bestZ.toFixed(3), n: START_OFFSETS_M.length });
    console.log(`  charge ${String(Math.round(t * 100)).padStart(3)}%  ${power.toFixed(2)} m/s  leaves lane ${left}/${START_OFFSETS_M.length}  reaches play ${reached}/${START_OFFSETS_M.length}  maxZ ${bestZ.toFixed(3)}`);
  }

  console.log('\n=== TRIPWIRES ===');
  // Every charge level must leave the lane every time. This is the bug's own signature and it
  // has no tolerance: a plunge that cannot clear the lane is not a weak shot, it is a dead game.
  for (const c of perCharge) {
    check(`charge ${c.charge} always leaves the shooter lane`, c.left === c.n, c);
  }
  // Reaching a flipper is allowed to be imperfect - a ball can legitimately go down an outlane
  // or get caught up-table - but a charge level that mostly fails to give the player a ball to
  // hit is the second half of the same report ("always drains"), so each one must be a majority.
  for (const c of perCharge) {
    check(`charge ${c.charge} mostly gives the player a ball to hit`, c.reached > c.n / 2, c);
  }
  // The weakest plunge is the one a player makes by accident, and the one the bug was worst for.
  const tap = perCharge[0];
  check('a bare tap (minimum charge) reaches play every time', tap.reached === tap.n, tap);
  // Full charge must not be worse than a tap - the failure at the top of the range is real (the
  // ball comes off the orbit's top arc hard enough to be thrown back down it), just above where
  // the shipped range stops. See PLUNGER_MAX_POWER_MS's comment.
  const full = perCharge[perCharge.length - 1];
  check('full charge is not worse than a bare tap', full.reached >= tap.reached - 1, { tap: tap.reached, full: full.reached });
  // Launch speed must stay under the anti-tunneling ceiling every other mechanic respects.
  check('full charge stays under MAX_BALL_SPEED_MS', cfg.PLUNGER_MAX_POWER_MS < cfg.MAX_BALL_SPEED_MS,
    { max: +cfg.PLUNGER_MAX_POWER_MS.toFixed(2), ceiling: +cfg.MAX_BALL_SPEED_MS.toFixed(2) });

  check('no uncaught page errors', pageErrors.length === 0, pageErrors);

  await browser.close();
  console.log('\n=== SUMMARY ===');
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
