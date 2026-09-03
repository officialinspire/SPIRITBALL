// SPIRITBALL gameplay-QA regression suite.
//
// Adds permanent coverage for the areas exercised by a real-time gameplay QA pass (repeated
// 60-120s simulated games driving real input through the real render loop - see that session's
// own report for the full methodology and findings). This file focuses on what that pass could
// NOT already lean on qa/flipper-geometry.js for:
//   - flipper physical orientation, pivot stability, input-to-motion response: qa/flipper-
//     geometry.js already asserts all three exhaustively (rest/active tip position, pivot
//     displacement ~0, real ArrowLeft/ArrowRight -> the correct physical paddle only) - run it
//     alongside this file rather than duplicating those 26 assertions here.
//   - ball/flipper velocity response, anti-stuck false positives, duplicate collision scoring,
//     HUD overflow bounds: genuinely new coverage, added below.
//   - the one concrete bug the QA pass reproduced (launching during the drain-reset delay fires
//     a phantom, ineffective launch from the ball's mid-fall position) - reproduced below as a
//     regression test BEFORE any fix, so it is expected to currently FAIL.
//
// Same permanent window.__flipperDebug hook as qa/flipper-geometry.js (?dev=1) - nothing new
// exposed by the game itself, no game-code changes needed to add this coverage.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/regression-suite.js
//   PORT=8971 node qa/regression-suite.js   (override the default port)
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
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${!cond && detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.mouse.click(195, 422); // dismiss menu, starts the game
  await page.waitForTimeout(300);
  return { page, pageErrors };
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  // =====================================================================================
  // Ball/flipper velocity response: a ball rolling toward an ACTIVELY FIRING flipper must come
  // away measurably faster than the same approach against a PASSIVE (never-activated) flipper -
  // real kinetic transfer from the paddle's own motion, not just a restitution bounce. Purely
  // self-referential (active vs. passive, same approach, same run) - no hardcoded "should be X
  // m/s" guess about the current tuning, which stays free to keep changing.
  // =====================================================================================
  console.log('\n=== BALL/FLIPPER VELOCITY RESPONSE ===');
  {
    const { page, pageErrors } = await freshPage(browser);
    const r = await page.evaluate(async () => {
      const dbg = window.__flipperDebug;
      const ball = dbg.mainBall;
      const engine = dbg.scene.getPhysicsEngine();
      const pivot = dbg.pivotWorldPosition(dbg.leftFlipper);
      const tip = dbg.tipWorldPosition(dbg.leftFlipper);
      const midX = pivot.x + (tip.x - pivot.x) * 0.6;
      const midZ = pivot.z + (tip.z - pivot.z) * 0.6;

      function approachAndMeasure(fire) {
        // Rolls in from up-table toward the paddle's own resting height/mid-length, real moderate
        // incoming speed - the same "ball arrives while the flipper is already swinging" shot a
        // real catch-and-fire play produces.
        ball.mesh.position.set(midX, tip.y, midZ + 0.09);
        ball.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, -0.5));
        ball.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
        dbg.leftFlipper.active = fire;
        let peak = 0;
        let contactStep = -1;
        let prevVz = -0.5;
        for (let i = 0; i < 30; i++) {
          dbg.updateFlipperMotor(dbg.leftFlipper, 16);
          dbg.updateBallPhysics(ball, 16);
          engine._step(16 / 1000);
          const v = ball.aggregate.body.getLinearVelocity();
          const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
          // Contact = the approach velocity (steadily -Z) visibly reverses/brakes - the same
          // "compare against the last tick" signal used elsewhere in this codebase's own physics
          // QA scripts, not a cooldown/scoring hook (a vertical/glancing contact doesn't always
          // register one, but the physical bounce itself always shows up here).
          if (contactStep === -1 && v.z > prevVz + 0.15 && i > 1) contactStep = i;
          if (contactStep !== -1 && i < contactStep + 6 && speed > peak) peak = speed;
          prevVz = v.z;
        }
        dbg.leftFlipper.active = false;
        for (let i = 0; i < 30; i++) { dbg.updateFlipperMotor(dbg.leftFlipper, 16); engine._step(16 / 1000); } // let it return to rest before the next run
        return { peak: +peak.toFixed(4), contactStep };
      }

      const passive = approachAndMeasure(false);
      const active = approachAndMeasure(true);
      return { passive, active };
    });
    check('an actively firing flipper sends the ball away clearly faster than a passive one', r.active.peak > r.passive.peak * 2, r);
    check('no page errors (velocity response)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // =====================================================================================
  // Anti-stuck false positives: a ball sitting untouched on the plunger (ballInPlay === false,
  // real pre-launch state) must NOT accumulate stuck-time or fire an escape kick, no matter how
  // long it sits there. The real guard for this lives at updateBallPhysics()'s own call site in
  // the render loop (only invoked while ballInPlay, with stuckTimeMs force-zeroed otherwise) -
  // NOT inside updateBallPhysics() itself, so this deliberately runs real time through the real
  // render loop rather than calling updateBallPhysics() directly (confirmed by first getting this
  // wrong: calling it directly bypasses that guard entirely and reports a false failure - exactly
  // the "implementation details vs. observable behavior" trap this suite is meant to avoid).
  // =====================================================================================
  console.log('\n=== ANTI-STUCK FALSE POSITIVES ===');
  {
    const { page, pageErrors } = await freshPage(browser);
    const before = await page.evaluate(() => {
      const b = window.__flipperDebug.mainBall;
      return { streak: b.stuckKickStreak, pos: { x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z } };
    });
    // Untouched, real pre-launch idle, real wall-clock time through the real render loop - well
    // over 4x this game's own stuck-time threshold (450ms).
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => {
      const dbg = window.__flipperDebug;
      const b = dbg.mainBall;
      return { streak: b.stuckKickStreak, pos: { x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z }, ballInPlay: dbg.isBallInPlay() };
    });
    const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.y - before.pos.y, after.pos.z - before.pos.z);
    check('idle plunger ball never triggers an anti-stuck kick', after.ballInPlay === false && after.streak === before.streak, { before, after });
    check('idle plunger ball is not nudged/relocated', moved < 0.002, { moved, before: before.pos, after: after.pos });
    check('no page errors (anti-stuck)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // =====================================================================================
  // Duplicate collision scoring: hitting a bumper once must score once. Forces a SECOND real
  // contact on the same bumper while it is still on its own cooldown (well under
  // COOLDOWN_BUMPER_MS) and asserts the score does not move again - the physical bounce itself
  // (restitution) is independent of the cooldown, so this only isolates the scoring gate.
  // =====================================================================================
  console.log('\n=== DUPLICATE COLLISION SCORING ===');
  {
    const { page, pageErrors } = await freshPage(browser);
    await page.keyboard.down('Space');
    await page.waitForTimeout(80);
    await page.keyboard.up('Space');
    await page.waitForTimeout(150);
    const r = await page.evaluate(async () => {
      const dbg = window.__flipperDebug;
      const ball = dbg.mainBall;
      const engine = dbg.scene.getPhysicsEngine();
      const mesh = dbg.scene.getMeshByName('bumper1'); // a normal (non-boss) bumper
      const scoreEl = document.getElementById('hud-score');
      const readScore = () => parseInt(scoreEl.textContent, 10) || 0;

      // Read the approach off the bumper's own position rather than hardcoding it. This used to
      // be a literal (-0.08, 0.02) - bumper1's coordinates at the time - and when the shot-corridor
      // refactor moved the cluster to the upper board the ball was launched at empty playfield.
      // The suite still "passed" the first-contact check (the ball scored on something else on its
      // way past) and then failed the cooldown-window precondition, which is a much more confusing
      // way to report "the probe is aimed at nothing". Same geometry as before - 0.04m down-table
      // of the bumper's centre, driven straight at it - just anchored to the real mesh.
      mesh.computeWorldMatrix(true);
      const bumperX = mesh.position.x, bumperZ = mesh.position.z;
      // 0.028 down-table, not the original 0.04: the shot-corridor refactor put the mission target
      // bank's top plate 55mm below this bumper in the same corridor, and a ball staged 40mm below
      // the bumper overlaps that plate's trigger. It scored the target's 750 on the "second contact
      // within cooldown" leg and reported the bumper's cooldown as broken. 0.028 clears the plate
      // by 9.5mm and still leaves the ball 7.5mm from the bumper's surface - one step at 0.5 m/s.
      function approach() {
        ball.mesh.position.set(bumperX, 0.02, bumperZ - 0.028);
        ball.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.5));
        ball.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
      }

      const scoreStart = readScore();
      approach();
      let cumulativeMs = 0;
      let hitAt = null;
      for (let i = 0; i < 20 && hitAt === null; i++) {
        dbg.updateHitCooldowns(16);
        dbg.updateBallPhysics(ball, 16);
        engine._step(16 / 1000);
        cumulativeMs += 16;
        if (dbg.hitCooldowns.has(mesh)) hitAt = cumulativeMs;
      }
      const scoreAfterFirstHit = readScore();
      const vAfterFirst = ball.aggregate.body.getLinearVelocity();
      const speedAfterFirst = Math.sqrt(vAfterFirst.x ** 2 + vAfterFirst.y ** 2 + vAfterFirst.z ** 2);

      // Force a second real contact on the SAME bumper while still on cooldown (cumulativeMs is
      // still well under COOLDOWN_BUMPER_MS=300 at this point).
      approach();
      let secondBounceSpeed = 0;
      for (let i = 0; i < 12; i++) {
        // Re-staged every step, not launched once. A ball allowed to fly after the bumper's kick
        // travels ~100mm inside this 192ms window, and in the shot-corridor layout that carries it
        // into the mission target bank further down the same corridor - so the "did the bumper
        // score twice?" delta picked up the target's 750 and the cooldown looked broken. Pinning
        // the ball against the bumper keeps the second contact on the same feature, which is what
        // this leg is actually asserting about.
        approach();
        dbg.updateHitCooldowns(16);
        dbg.updateBallPhysics(ball, 16);
        engine._step(16 / 1000);
        cumulativeMs += 16;
        const v = ball.aggregate.body.getLinearVelocity();
        const speed = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
        if (speed > secondBounceSpeed) secondBounceSpeed = speed;
      }
      const scoreAfterSecondContact = readScore();

      return {
        scoreStart, scoreAfterFirstHit, scoreAfterSecondContact,
        firstHitCumulativeMs: hitAt, stillOnCooldownForSecondContact: cumulativeMs < 300,
        speedAfterFirst: +speedAfterFirst.toFixed(4), secondBounceSpeed: +secondBounceSpeed.toFixed(4),
      };
    });
    check('first contact scores', r.scoreAfterFirstHit > r.scoreStart, r);
    check('second contact happened while still on the same cooldown window', r.stillOnCooldownForSecondContact, r);
    check('second contact produced a real physical bounce (restitution still applies)', r.secondBounceSpeed > 0.05, r);
    check('second contact within cooldown does NOT score again', r.scoreAfterSecondContact === r.scoreAfterFirstHit, r);
    check('no page errors (duplicate scoring)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // =====================================================================================
  // HUD overflow/readability bounds (measurable via DOM geometry, narrowest supported viewport -
  // 320px, the tightest fit already established for this HUD). A large real score must stay
  // inside its own panel, and the panel must never overlap the pause button.
  // =====================================================================================
  console.log('\n=== HUD OVERFLOW/READABILITY BOUNDS ===');
  {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.mouse.click(160, 284);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      document.getElementById('hud-score').textContent = '00124500'; // realistic long-session score
      const hud = document.getElementById('player-hud').getBoundingClientRect();
      const score = document.getElementById('hud-score').getBoundingClientRect();
      const pause = document.getElementById('pause-btn').getBoundingClientRect();
      function overlaps(a, b) {
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      }
      return {
        scoreWithinHud: score.left >= hud.left - 0.5 && score.right <= hud.right + 0.5 && score.top >= hud.top - 0.5 && score.bottom <= hud.bottom + 0.5,
        hudOverlapsPause: overlaps(hud, pause),
        hud, score, pause,
      };
    });
    check('an 8-digit score stays within the HUD panel bounds (no overflow)', r.scoreWithinHud, r);
    check('HUD panel never overlaps the pause button at the narrowest supported width', !r.hudOverlapsPause, r);
    await page.close();
  }

  // =====================================================================================
  // Concrete bug from the gameplay QA pass, reproduced BEFORE any fix (expected to FAIL now):
  // pressing Launch while a real drain-reset is pending (phase === DRAIN_DELAY - the ball has
  // left play but resetBallToPlunger() hasn't run yet) fires handleLaunchRelease() from the
  // ball's CURRENT position, which is still mid-drain-fall (well below the table), not the
  // plunger. Desired behavior: a launch input during this window must not set ballInPlay=true
  // from a sub-table position - either it's ignored until the reset completes, or ballInPlay only
  // ever goes true once the ball is back at a sane on-table height.
  // =====================================================================================
  console.log('\n=== CONCRETE BUG: launch during pending drain-reset ===');
  {
    const { page, pageErrors } = await freshPage(browser);
    await page.keyboard.down('Space');
    await page.waitForTimeout(80);
    await page.keyboard.up('Space');
    await page.waitForTimeout(150);

    // Drive the ball into the real drain trigger with real velocity (manual stepping, so this
    // takes negligible real wall-clock time - the real setTimeout the drain schedules is
    // unaffected and still has its full real-time window ahead of it once this loop ends).
    await page.evaluate(async () => {
      const dbg = window.__flipperDebug;
      const ball = dbg.mainBall;
      const engine = dbg.scene.getPhysicsEngine();
      const drainMesh = dbg.scene.getMeshByName('drainZone');
      const bounds = drainMesh.getBoundingInfo().boundingBox;
      ball.mesh.position.set(drainMesh.position.x, drainMesh.position.y, bounds.minimumWorld.z - 0.03);
      ball.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.5));
      ball.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
      for (let i = 0; i < 30 && dbg.isBallInPlay(); i++) {
        dbg.updateHitCooldowns(16);
        dbg.updateBallPhysics(ball, 16);
        engine._step(16 / 1000);
      }
    });

    // Real time now - the drain's own real setTimeout (>= 700ms) is pending. Press Space
    // immediately, well inside that window.
    await page.keyboard.down('Space');
    await page.waitForTimeout(30);
    await page.keyboard.up('Space');

    const r = await page.evaluate(() => {
      const dbg = window.__flipperDebug;
      return { ballInPlay: dbg.isBallInPlay(), y: dbg.mainBall.mesh.position.y };
    });
    check(
      'launch during pending drain-reset does not fire from a sub-table position',
      !(r.ballInPlay === true && r.y < -0.02),
      r
    );
    check('no page errors (drain-delay launch)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  await browser.close();

  console.log('\n=== SUMMARY ===');
  const totalPass = results.filter((r) => r.pass).length;
  const totalFail = results.filter((r) => !r.pass).length;
  console.log(`TOTAL: ${totalPass} passed, ${totalFail} failed`);
  process.exit(totalFail > 0 ? 1 : 0);
})();
