// SPIRITBALL BALL CIRCULATION regression suite.
//
// Guards the one property no other QA file covers: that the ball still gets AROUND the table.
// Table geometry is easy to break by accident - a guide rail lengthened by a few millimetres, a
// rail moved, a wall re-centred - and the failure mode is silent. Nothing throws, no test goes
// red, the game just quietly becomes "launch, rattle in the lower third, drain" forever. This
// file exists to make that loud.
//
// Scope, deliberately narrow:
//   - NO scoring assertions. Points, combos, missions and multipliers belong in the gameplay/
//     scoring tests; this file only ever looks at where the ball physically went and what it
//     physically touched. A scoring change must never turn this file red.
//   - NO trajectory reproduction. Havok is not deterministic enough for that across machines or
//     even across runs, and demanding it would make this file a maintenance tax rather than a
//     safety net. Every assertion below is an AGGREGATE over a fixed sample, with a threshold
//     set far enough from the measured value that ordinary run-to-run variation cannot reach it.
//     The thresholds are tripwires for "circulation collapsed", not tuning targets - if a real
//     tuning change moves a number a little, this file should stay green.
//   - NO game-code changes. Uses the same permanent window.__flipperDebug hook (?dev=1) as
//     qa/flipper-geometry.js and qa/regression-suite.js.
//
// Three populations, each answering a different question:
//   A. PLUNGER LAUNCHES - can a ball still get out of the shooter lane and onto the board at all?
//      Fired from wherever the ball actually comes to rest at boot (read, not hardcoded, so this
//      keeps working if the lane/plunger geometry is ever retuned).
//   B. FLIPPER STRIKES - does the real paddle still put the ball back up-table? Drives the real
//      updateFlipperMotor() against a real approaching ball, so it covers the whole flipper ->
//      ball path, not just the board.
//   C. UP-TABLE SHOTS - do routes to the middle and upper board still exist? A fan of lanes
//      across the full table width, each given a realistic post-flipper exit speed. This is the
//      population that actually probes the board's corridors, and it is where the "ball never
//      reaches the upper board again" tripwire lives: A and B are dominated by flipper contact
//      energy and rarely reach the top even on a healthy board, so asserting on them would
//      measure the wrong thing.
//
// Metrics tracked per ball: max Z, whether it entered the middle board, whether it entered the
// upper board, how many distinct regions it visited, and how many physical obstacle contacts it
// made. Regions are a coarse 3x3 grid (table thirds by Z, thirds by X) derived from
// TABLE_LENGTH_M/TABLE_WIDTH_M - deliberately geometry-agnostic, so re-shaping a rail changes
// how many regions get visited without changing what a region IS.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/circulation-suite.js
//   PORT=8971 node qa/circulation-suite.js  (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8971;
const BASE = `http://localhost:${PORT}/index.html?dev=1`;
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond, detail });
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
}

// =======================================================================================
// Runs entirely in the page: one browser round-trip for the whole sample, so this file stays
// cheap enough to run on every change (a few seconds, not a gameplay session).
// =======================================================================================
const COLLECT = async () => {
  const cfg = await import('../js/config.js');
  const dbg = window.__flipperDebug;
  const ball = dbg.mainBall;
  const engine = dbg.scene.getPhysicsEngine();
  const body = ball.aggregate.body;
  const V = (x, y, z) => new BABYLON.Vector3(x, y, z);

  // Board thirds, from the table's own dimensions rather than magic numbers.
  const Z_MID = cfg.TABLE_LENGTH_M / 6;   // +-0.151: lower | middle | upper
  const X_COL = cfg.TABLE_WIDTH_M / 6;    // +-0.085: left  | centre | right
  const DRAIN_Z = -(cfg.TABLE_LENGTH_M / 2) - 0.01;
  const STEP_MS = 16;
  const MAX_STEPS = 420;   // ~6.7s of simulated ball time - long enough to complete a full circuit
  const TAIL_STEPS = 120;  // ~1.9s window used for the wedge check below
  const WEDGE_SPREAD_M = 3 * cfg.BALL_DIAMETER_M; // a ball that covers less than this in 1.9s is stuck

  // The ball's real resting spot at boot. Read rather than hardcoded so a future launch-lane
  // change moves the sample with it instead of silently firing from inside a wall.
  const rest = { x: ball.mesh.position.x, y: ball.mesh.position.y, z: ball.mesh.position.z };

  // Physical obstacle contacts. Trigger volumes (rollovers, lane switches, the Vision Gate's
  // capture sphere) do not raise COLLISION_STARTED, so this counts real colliders only.
  const contacts = [];
  body.setCollisionCallbackEnabled(true);
  const obs = body.getCollisionObservable();
  const ref = obs.add((ev) => {
    if (ev.type !== 'COLLISION_STARTED') return;
    const m = ev.collidedAgainst && ev.collidedAgainst.transformNode;
    if (m) contacts.push(m.name);
  });

  function settleFlippers() {
    dbg.leftFlipper.active = false;
    dbg.rightFlipper.active = false;
    for (let i = 0; i < 25; i++) {
      dbg.updateFlipperMotor(dbg.leftFlipper, STEP_MS);
      dbg.updateFlipperMotor(dbg.rightFlipper, STEP_MS);
    }
  }

  // One ball. `place` seeds position/velocity; `fire` optionally pops a flipper mid-flight.
  function runBall(place, fire) {
    settleFlippers();
    contacts.length = 0;
    ball.stuckKickStreak = 0;
    ball.stuckTimeMs = 0;
    place();
    const regions = new Set();
    const tail = []; // positions over the final stretch, for the wedge check below
    let maxZ = -Infinity;
    let steps = 0;
    let drained = false;
    for (let i = 0; i < MAX_STEPS; i++) {
      if (fire && i === 6) fire.active = true;
      if (fire && i === 18) fire.active = false;
      dbg.updateFlipperMotor(dbg.leftFlipper, STEP_MS);
      dbg.updateFlipperMotor(dbg.rightFlipper, STEP_MS);
      dbg.updateHitCooldowns(STEP_MS);
      dbg.updateBallPhysics(ball, STEP_MS);
      engine._step(STEP_MS / 1000);
      steps++;
      const p = ball.mesh.position;
      if (p.z > maxZ) maxZ = p.z;
      const band = p.z >= Z_MID ? 'U' : p.z >= -Z_MID ? 'M' : 'L';
      const col = p.x >= X_COL ? 'R' : p.x >= -X_COL ? 'C' : 'L';
      regions.add(band + col);
      tail.push(p.x, p.z);
      if (tail.length > 2 * TAIL_STEPS) tail.splice(0, 2);
      if (p.z < DRAIN_Z) { drained = true; break; }
    }
    if (fire) fire.active = false;
    // Wedge detection by TRAVEL, not by speed. A ball parked in a dead pocket is not still - the
    // anti-stuck kick keeps bouncing it around inside the pocket, so its instantaneous speed
    // stays well above any sensible threshold while it goes nowhere at all. What actually
    // separates "wedged" from "in play" is how far it moved: over the last TAIL_STEPS it either
    // covers ground or it is rattling in a hole a few ball-widths wide.
    let spread = Infinity;
    if (!drained && tail.length >= 4) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < tail.length; i += 2) {
        if (tail[i] < x0) x0 = tail[i];
        if (tail[i] > x1) x1 = tail[i];
        if (tail[i + 1] < z0) z0 = tail[i + 1];
        if (tail[i + 1] > z1) z1 = tail[i + 1];
      }
      spread = Math.max(x1 - x0, z1 - z0);
    }
    return {
      maxZ,
      reachedMiddle: maxZ >= -Z_MID,
      reachedUpper: maxZ >= Z_MID,
      regions: regions.size,
      contacts: contacts.length,
      steps,
      drained,
      spread,
      // Resolved = drained, or still genuinely travelling. Anything else is stuck in a pocket -
      // the exact shape of the shooter-lane trap this suite was written after.
      resolved: drained || spread >= WEDGE_SPREAD_M
    };
  }

  // --- A. plunger launches, across the real power range -------------------------------------
  const plunger = [];
  for (const t of [0, 0.34, 0.67, 1]) {
    const power = cfg.PLUNGER_MIN_POWER_MS + (cfg.PLUNGER_MAX_POWER_MS - cfg.PLUNGER_MIN_POWER_MS) * t;
    const vx = -(cfg.PLUNGER_HORIZONTAL_BASE_MS + power * cfg.PLUNGER_HORIZONTAL_RATIO);
    plunger.push(runBall(() => {
      ball.mesh.position.set(rest.x, rest.y, rest.z);
      body.setLinearVelocity(V(vx, 0, power));
      body.setAngularVelocity(BABYLON.Vector3.Zero());
    }, null));
  }

  // --- B. real flipper strikes, both bats, four contact points along each ---------------------
  const flipper = [];
  for (const side of ['left', 'right']) {
    for (const frac of [0.4, 0.6, 0.75, 0.9]) {
      const f = side === 'left' ? dbg.leftFlipper : dbg.rightFlipper;
      flipper.push(runBall(() => {
        const pv = dbg.pivotWorldPosition(f);
        const tp = dbg.tipWorldPosition(f);
        ball.mesh.position.set(pv.x + (tp.x - pv.x) * frac, rest.y, pv.z + (tp.z - pv.z) * frac + 0.02);
        body.setLinearVelocity(V(0, 0, -0.3));
        body.setAngularVelocity(BABYLON.Vector3.Zero());
      }, f));
    }
  }

  // --- C. up-table shots: a fan of lanes at post-flipper exit speed ---------------------------
  // Evenly spaced across the playable width rather than aimed at known-good corridors: an even
  // fan measures how much of the board is reachable, a cherry-picked one only measures whether
  // three specific gaps are still open.
  const upTable = [];
  const halfPlayable = cfg.TABLE_WIDTH_M / 2 - 0.04;
  const FAN_LANES = 13; // ~36mm apart across the playable width - fine enough to resolve the
                        // board's individual corridors, coarse enough to stay a few seconds
  for (let i = 0; i < FAN_LANES; i++) {
    const x = -halfPlayable + (2 * halfPlayable * i) / (FAN_LANES - 1);
    upTable.push(runBall(() => {
      ball.mesh.position.set(x, rest.y, -0.20);
      body.setLinearVelocity(V(0, 0, 1.5));
      body.setAngularVelocity(BABYLON.Vector3.Zero());
    }, null));
  }

  obs.remove(ref);

  const summarise = (rows) => ({
    n: rows.length,
    pctMiddle: Math.round((100 * rows.filter((r) => r.reachedMiddle).length) / rows.length),
    pctUpper: Math.round((100 * rows.filter((r) => r.reachedUpper).length) / rows.length),
    bestMaxZ: +Math.max(...rows.map((r) => r.maxZ)).toFixed(3),
    meanMaxZ: +(rows.reduce((a, r) => a + r.maxZ, 0) / rows.length).toFixed(3),
    maxRegions: Math.max(...rows.map((r) => r.regions)),
    meanRegions: +(rows.reduce((a, r) => a + r.regions, 0) / rows.length).toFixed(1),
    meanContacts: +(rows.reduce((a, r) => a + r.contacts, 0) / rows.length).toFixed(1),
    minContacts: Math.min(...rows.map((r) => r.contacts)),
    pctResolved: Math.round((100 * rows.filter((r) => r.resolved).length) / rows.length),
    wedged: rows.filter((r) => !r.resolved).length
  });

  const all = plunger.concat(flipper, upTable);
  return {
    zMid: +Z_MID.toFixed(4),
    plunger: summarise(plunger),
    flipper: summarise(flipper),
    upTable: summarise(upTable),
    all: summarise(all)
  };
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.mouse.click(195, 422); // dismiss the menu, start a game
  await page.waitForTimeout(400);

  const r = await page.evaluate(COLLECT);
  await page.close();
  await browser.close();

  const row = (label, s) =>
    console.log(
      `  ${label.padEnd(16)} n=${String(s.n).padStart(2)}  middle ${String(s.pctMiddle + '%').padStart(4)}` +
      `  upper ${String(s.pctUpper + '%').padStart(4)}  bestZ ${String(s.bestMaxZ).padStart(6)}` +
      `  meanZ ${String(s.meanMaxZ).padStart(6)}  regions ${s.maxRegions}/9 max ${String(s.meanRegions).padStart(4)} mean` +
      `  contacts ${String(s.meanContacts).padStart(5)} mean ${String(s.minContacts).padStart(2)} min  resolved ${s.pctResolved}% (${s.wedged} wedged)`
    );

  console.log(`\n=== MEASURED (board thirds at z=+-${r.zMid}) ===`);
  row('plunger', r.plunger);
  row('flipper strikes', r.flipper);
  row('up-table shots', r.upTable);
  row('ALL', r.all);

  // =====================================================================================
  // Tripwires. Every threshold sits well clear of the value measured on a healthy board (shown
  // in each check's detail) - they fire on collapse, not on drift.
  // =====================================================================================
  console.log('\n=== CIRCULATION TRIPWIRES ===');

  // `healthy` on each line is what this metric measured on a known-good board when the check was
  // written - it is documentation, not an assertion, so a maintainer can see at a glance how much
  // room a failing number actually lost.
  const t = (label, value, min, healthy) => check(label, value >= min, { value, min, healthy });

  // The headline one: routes to the upper third still exist at all. This is a COLLAPSE tripwire,
  // not a sensitivity meter, exactly as intended: 4 of 13 lanes get up there on a healthy board,
  // and the floor is 2 of 13, so it fires only when the upper board has effectively closed.
  // Checked against deliberately broken builds: sealing both side channels (guides lengthened
  // 157px -> 260px) still scores 2 of 13 through the centre and still passes - correct, that
  // board is degraded but not collapsed. Walling off the middle/upper boundary outright scores
  // 0 of 13 and fires this check together with the two below it.
  t('up-table shots still reach the UPPER board (%)', r.upTable.pctUpper, 10, 31);
  t('at least one shot gets deep into the upper board (max z)', r.upTable.bestMaxZ, 0.25, 0.412);

  // Middle board must stay routinely reachable from every population.
  t('up-table shots still reach the MIDDLE board (%)', r.upTable.pctMiddle, 60, 100);
  t('flipper strikes still reach the MIDDLE board (%)', r.flipper.pctMiddle, 50, 100);
  t('plunger launches still clear the shooter lane (% to middle)', r.plunger.pctMiddle, 50, 100);

  // Breadth: the ball must explore, not just shuttle up and down one column. A board where the
  // ball never leaves the lower third caps out at 3 regions, so 5 means "left it, and spread".
  // Measured 4 on the walled-off build above, so this is a third independent witness to the same
  // collapse rather than a restatement of the two checks before it.
  t('some ball visits at least 5 of the 9 board regions', r.all.maxRegions, 5, 6);
  t('an average ball visits several board regions', r.all.meanRegions, 2.5, 3.4);

  // Contact: a ball that touches almost nothing is either tunnelling or draining instantly.
  t('balls make real obstacle contact (mean per ball)', r.all.meanContacts, 3, 10.4);

  // No permanent wedges anywhere in the sample - the shape of the shooter-lane trap this file was
  // written after. Asserted as a COUNT, not a percentage: a wedged ball is never legitimate, so
  // the only tolerance here is one marginal ball out of the whole sample so a single unlucky
  // Havok resolution cannot turn this red on its own. Measured 0 of 25 on a healthy board, and 2
  // of 25 on the board that still had the shooter-lane trap - so this fires on the real thing.
  check('no ball ends up wedged (max 1 of the sample)', r.all.wedged <= 1, {
    wedged: r.all.wedged, max: 1, healthy: 0, sampleSize: r.all.n
  });

  check('no uncaught page errors', pageErrors.length === 0, pageErrors);

  console.log('\n=== SUMMARY ===');
  const totalPass = results.filter((x) => x.pass).length;
  const totalFail = results.filter((x) => !x.pass).length;
  console.log(`TOTAL: ${totalPass} passed, ${totalFail} failed`);
  process.exit(totalFail > 0 ? 1 : 0);
})();
