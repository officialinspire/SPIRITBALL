// SPIRITBALL skill-shot regression test.
//
// The skill shot is a charge-band mechanic: how long you hold the plunger picks one of three
// reward tiers, and the ball collects that tier by completing the right orbit. See
// SKILL_SHOT_TIERS' block comment in js/config.js for the mechanic and for why it replaced the
// three physical lanes that used to sit at z=0.02.
//
// This file exists because the old design failed silently and nothing caught it. Those lanes were
// walled off from the launch by the orbit rebuild, so the feature could not pay - and the board
// still said "SKILL SHOT READY" on every plunge. No test noticed, because every test that touched
// the skill shot drove its trigger volumes directly instead of launching a ball and asking whether
// a player could actually collect one. So that is the question here, end to end:
//
//   1. do the bands map charge to the tier the config says they do, at their edges
//   2. does a real plunge arm a tier, and say which one
//   3. does the ball actually collect it, for exactly the configured points
//   4. do the two ways of NOT collecting - the window timing out, and the ball reaching something
//      else first - close it silently and pay nothing
//
// Check 3 is the one that would have failed on the old build.
//
// Determinism: the game is frozen (scene.physicsEnabled = false, so the render loop stops stepping
// physics) and this rig drives scene.getPhysicsEngine()._step() itself at a fixed 1/60. Headless
// Chromium renders this scene at a few FPS, which is also why the charge in check 2 is read back
// from the game rather than dialled in by holding a key for a measured time - one headless frame
// can be half the charge window, so a real hold cannot target a band here. The bands themselves
// are covered exactly by check 1, against the real function the launch uses.
//
// Reads window.__flipperDebug - the permanent read-only ?dev=1 hook. Nothing to hand-patch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/skill-shot.js
//   PORT=8971 node qa/skill-shot.js        (override the default port)
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
  results.push({ label, pass: !!cond });
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}  ${detail === undefined ? '' : JSON.stringify(detail)}`);
}

// Steps physics until the ball crosses the right orbit's completion trigger, then STOPS.
//
// Stopping right there is the whole point, and getting it wrong is easy: the launched ball is
// still travelling, and the next thing it reaches is a re-entry lane worth SCORE_REENTRY_LANE.
// An earlier version of this rig ran twelve frames past the crossing "so the award lands" and
// measured 3500 points for a 1500-point tier - the skill shot plus a re-entry lane - and read
// RE-ENTRY! as the award message. The award needs no extra frames at all: handleTriggerHit()
// runs synchronously inside the _step() that produces the trigger event, so it has already
// landed by the time that call returns.
const RUN_TO_ORBIT = (secs) => {
  const d = window.__flipperDebug;
  const pe = d.scene.getPhysicsEngine();
  const mesh = d.mainBall.mesh;
  const bb = d.scene.getMeshByName('orbitCompletionright').getBoundingInfo().boundingBox;
  const score = () => parseInt(document.getElementById('hud-score').textContent, 10) || 0;
  const before = { score: score(), state: d.skillShot.state() };
  let crossedAt = null;
  for (let i = 0; i < 60 * secs; i++) {
    pe._step(1 / 60);
    const { x, y, z } = mesh.position;
    if (x > bb.minimumWorld.x && x < bb.maximumWorld.x
        && z > bb.minimumWorld.z && z < bb.maximumWorld.z) { crossedAt = +(i / 60).toFixed(2); break; }
    if (z < -0.46 || y < -0.05) break;
  }
  return { before, crossedAt, after: { score: score(), state: d.skillShot.state() },
           message: window.__backglassDebug.message };
};

async function boot(browser) {
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
  return { page, pageErrors };
}

// A real plunge through the real handlers, with physics frozen so the ball waits where the launch
// put it until this rig steps it.
async function plunge(page, holdMs) {
  await page.evaluate(() => { window.__flipperDebug.scene.physicsEnabled = false; });
  await page.keyboard.down('Space');
  await page.waitForTimeout(holdMs);
  await page.keyboard.up('Space');
  await page.waitForTimeout(120);
  return page.evaluate(() => ({
    state: window.__flipperDebug.skillShot.state(),
    message: window.__backglassDebug.message
  }));
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  // --- 1. bands ------------------------------------------------------------------------------
  console.log('\n=== CHARGE BANDS ===');
  const { page, pageErrors } = await boot(browser);
  const bands = await page.evaluate(() => {
    const ss = window.__flipperDebug.skillShot;
    const target = ss.targetCharge;
    const at = (c) => ss.tierForCharge(Math.min(Math.max(c, 0), 1));
    const inside = (band) => ({ lo: at(target - band * 0.9), hi: at(target + band * 0.9) });
    const outside = (band) => ({ lo: at(target - band * 1.1), hi: at(target + band * 1.1) });
    return {
      tiers: ss.tiers.map((t) => ({ label: t.label, points: t.points, band: t.band })),
      target,
      tapped: at(0), pinned: at(1), centre: at(target),
      super: { in: inside(ss.tiers[0].band), out: outside(ss.tiers[0].band) },
      mid: { in: inside(ss.tiers[1].band), out: outside(ss.tiers[1].band) }
    };
  });
  console.log('  tiers:', JSON.stringify(bands.tiers));
  check('a charge at the target centre buys the best tier', bands.centre === 0, bands);
  check('just inside the SUPER band, both sides, still buys SUPER',
    bands.super.in.lo === 0 && bands.super.in.hi === 0, bands.super.in);
  check('just outside the SUPER band, both sides, drops to the middle tier',
    bands.super.out.lo === 1 && bands.super.out.hi === 1, bands.super.out);
  check('just outside the middle band, both sides, drops to the safe tier',
    bands.mid.out.lo === 2 && bands.mid.out.hi === 2, bands.mid.out);
  // The original design's own requirement, kept: neither thing a player does by accident may be
  // the best reward.
  check('a bare tap is NOT the best tier', bands.tapped === bands.tiers.length - 1, { tapped: bands.tapped });
  check('holding until the meter pins is NOT the best tier', bands.pinned === bands.tiers.length - 1, { pinned: bands.pinned });

  // --- 2. the tier on offer is visible while the plunger is still down -------------------------
  //
  // Asserted on the lamp materials, not just on the state variable: this is the only thing that
  // tells a player where the SUPER band is before they commit, so "the insert is actually
  // brighter" is the claim worth testing. The lamp system writes brightness straight onto each
  // insert's emissiveColor (see applyBrightness() in babylon-game.js), so its magnitude is the
  // real, rendered answer.
  console.log('\n=== THE TIER ON OFFER IS LIT WHILE CHARGING ===');
  await page.evaluate(() => { window.__flipperDebug.scene.physicsEnabled = false; });
  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  const held = await page.evaluate(() => {
    const d = window.__flipperDebug;
    const lit = d.skillShot.tiers.map((_, i) => {
      const c = d.scene.getMeshByName('skillShotLamp' + i).material.emissiveColor;
      return +Math.hypot(c.r, c.g, c.b).toFixed(3);
    });
    return { state: d.skillShot.state(), lit };
  });
  await page.keyboard.up('Space');
  await page.waitForTimeout(150);
  console.log('  holding:', JSON.stringify(held));
  check('a tier is previewed while the plunger is held', held.state.previewIndex !== null, held.state);
  check('nothing is armed yet while the plunger is still down', held.state.active === false, held.state);
  {
    const idx = held.state.previewIndex;
    const others = held.lit.filter((_, i) => i !== idx);
    check('the previewed insert is the lit one, and the only lit one',
      idx !== null && others.every((v) => held.lit[idx] > v), { previewIndex: idx, brightness: held.lit });
  }
  // That hold also just launched the ball, so put it back before the collect test below.
  // Dispatched rather than page.click()ed: the dev panel's reset button sits below the fold in
  // this viewport, so a real click never resolves.
  await page.evaluate(() => {
    window.__flipperDebug.scene.physicsEnabled = true;
    document.getElementById('reset-plunger-btn').click();
  });
  await page.waitForTimeout(500);

  // --- 3 & 4. a real plunge arms a tier, and the ball collects it ------------------------------
  console.log('\n=== A REAL PLUNGE COLLECTS ITS TIER ===');
  const armed = await plunge(page, 500);
  console.log('  armed:', JSON.stringify(armed));
  check('a plunge arms a tier', armed.state.active === true && armed.state.tierIndex !== null, armed.state);
  const armedTier = bands.tiers[armed.state.tierIndex];
  check('the launch message names the tier that was armed',
    typeof armed.message === 'string' && armed.message.indexOf(armedTier.label) >= 0,
    { message: armed.message, tier: armedTier.label });
  check('arming clears the charge-time preview', armed.state.previewIndex === null, armed.state);

  const run = await page.evaluate(RUN_TO_ORBIT, 8);
  console.log('  run:', JSON.stringify({ crossedAt: run.crossedAt, gained: run.after.score - run.before.score, message: run.message }));
  check('the launched ball reaches the right orbit', run.crossedAt !== null, { crossedAt: run.crossedAt });
  check('the skill shot pays exactly its tier', run.after.score - run.before.score === armedTier.points,
    { gained: run.after.score - run.before.score, expected: armedTier.points, tier: armedTier.label });
  check('the award is counted once', run.after.state.awarded === run.before.state.awarded + 1,
    { before: run.before.state.awarded, after: run.after.state.awarded });
  check('collecting closes the window', run.after.state.active === false, run.after.state);
  check('the award message names the tier', run.message.indexOf(armedTier.label) >= 0,
    { message: run.message, tier: armedTier.label });
  check('no uncaught page errors (collect)', pageErrors.length === 0, pageErrors);
  await page.close();

  // --- 4a. the window times out unpaid ---------------------------------------------------------
  console.log('\n=== A PLUNGE THAT NEVER MAKES THE SHOT PAYS NOTHING ===');
  {
    const { page, pageErrors } = await boot(browser);
    const armed = await plunge(page, 500);
    check('armed before the timeout test', armed.state.active === true, armed.state);
    const scoreBefore = await page.evaluate(() => parseInt(document.getElementById('hud-score').textContent, 10) || 0);
    // Leave physics frozen so the ball never reaches anything, and let the real render loop burn
    // the window down. Generous wait: the window is SKILL_SHOT_WINDOW_MS and this sandbox's frames
    // are long, but it counts real deltaMs so it expires on time.
    await page.waitForTimeout(4500);
    const out = await page.evaluate(() => ({
      state: window.__flipperDebug.skillShot.state(),
      score: parseInt(document.getElementById('hud-score').textContent, 10) || 0
    }));
    check('the window expires on its own', out.state.active === false, out.state);
    check('an expired window pays nothing', out.score === scoreBefore, { before: scoreBefore, after: out.score });
    check('an expired window leaves no insert lit', out.state.previewIndex === null && out.state.tierIndex === null, out.state);
    check('no uncaught page errors (timeout)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // --- 4b. reaching something else first closes it unpaid --------------------------------------
  {
    const { page, pageErrors } = await boot(browser);
    const armed = await plunge(page, 500);
    check('armed before the wrong-target test', armed.state.active === true, armed.state);
    const out = await page.evaluate(() => {
      const d = window.__flipperDebug;
      const pe = d.scene.getPhysicsEngine();
      const body = d.mainBall.aggregate.body, mesh = d.mainBall.mesh;
      const score = () => parseInt(document.getElementById('hud-score').textContent, 10) || 0;
      const before = score();
      // Drop the ball straight onto a bumper instead of letting it run the orbit.
      const bumper = d.scene.getMeshByName('bumper0');
      mesh.position.set(bumper.position.x, mesh.position.y, bumper.position.z - 0.05);
      body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.8));
      body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
      const beforeAwarded = d.skillShot.state().awarded;
      for (let i = 0; i < 60; i++) pe._step(1 / 60);
      return { state: d.skillShot.state(), gained: score() - before, beforeAwarded };
    });
    check('reaching something else closes the window', out.state.active === false, out.state);
    // Asserted on the skill shot's own award counter, not on the score: the bumper this ball was
    // dropped onto scores plenty by itself (measured ~2700 over these frames), so "did the score
    // move" cannot tell a paid skill shot from an ordinary bumper rally.
    check('reaching something else pays no skill shot', out.state.awarded === out.beforeAwarded,
      { awarded: out.state.awarded, before: out.beforeAwarded, bumperPoints: out.gained });
    check('no uncaught page errors (wrong target)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  await browser.close();
  console.log('\n=== SUMMARY ===');
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
