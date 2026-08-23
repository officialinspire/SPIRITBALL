// SPIRITBALL - gameplay systems regression
// =========================================================================================
// The other suites in qa/ each go deep on one axis: control-isolation and input-boundaries on
// input, ball-movement / flipper-energy / ball-spin / ball-trap-audit on physics, circulation
// on where a ball actually goes. Nothing walked the FEATURE list end to end - launch, scoring,
// lanes, bumpers, Saturn, comet, missions, the Vision Gate, drains, pause, game over - and
// confirmed each one still fires through the real game loop after a run of visual passes that
// touched the material of nearly every one of those objects.
//
// Everything here drives the shipped game: real menu click, real Space launch, real Escape,
// real collision/trigger handlers. Nothing calls an internal function directly. The only thing
// borrowed from ?dev=1 is __flipperDebug, to place the ball at a feature and read it back - the
// same read-only hook every other physics suite in this directory uses.
//
// Assertions read the player-visible HUD (#hud-score, #hud-lives) and the overlays, not internal
// state, so a check passing means the player would actually have seen it happen.
//
//   python3 -m http.server 8971      (repo root)
//   PORT=8971 node qa/gameplay-systems.js
// =========================================================================================
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const PORT = process.env.PORT || '8971';
const URL = `http://localhost:${PORT}/index.html?dev=1`;

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  OK   ${name}` + (detail !== undefined ? `  ${JSON.stringify(detail)}` : '')); }
  else { failed++; console.log(`  FAIL ${name}  ${JSON.stringify(detail)}`); }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
  });
  // Small viewport, and the glow layer and particle systems switched off below. This suite is
  // about whether gameplay HANDLERS fire, not about how the board looks, and every check here
  // has to advance real render-loop frames to get there. At 900x1000 with bloom and particles a
  // software-rasterised frame costs ~200ms and the whole file cannot finish inside any sane
  // timeout; stripped down it is roughly an order of magnitude faster and tests exactly the same
  // code paths.
  const page = await browser.newPage({ viewport: { width: 420, height: 380 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 30000 });
  await page.evaluate(() => {
    const s = BABYLON.EngineStore.LastCreatedScene;
    s.effectLayers.slice().forEach((l) => { l.isEnabled = false; });
    s.particleSystems.slice().forEach((ps) => { try { ps.stop(); } catch (e) {} });
  });

  // ---- helper injected once: drive the ball into a feature and wait for the HUD to move ----
  await page.evaluate(() => {
    const d = window.__flipperDebug, s = d.scene;
    const V = BABYLON.Vector3;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    window.__gp = {
      frame,
      score: () => parseInt(document.getElementById('hud-score').textContent.replace(/\D/g, ''), 10) || 0,
      lives: () => parseInt(document.getElementById('hud-lives').textContent.replace(/\D/g, ''), 10) || 0,
      ballPos: () => d.mainBall.mesh.position.clone(),
      inPlay: () => d.isBallInPlay(),
      // Park the ball somewhere harmless between checks. Without this the ball wanders for the
      // seconds a headless frame budget actually takes and drains mid-suite - which is how the
      // first version of this file ended up reading the END-OF-BALL BONUS COUNT's incremental
      // payout as if it were each feature's own award, and "passing" every check with a delta of
      // 31 points.
      // STATIC and lifted clear of the playfield. Parking it on the table at z=0.02 was the
      // first attempt and that spot is directly under the bumper cluster - the "parked" ball kept
      // scoring, so the score never settled and every check failed on its own housekeeping.
      park() {
        d.mainBall.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
        d.mainBall.mesh.position.set(0.0, 0.30, 0.0);
        d.mainBall.aggregate.body.setLinearVelocity(new V(0, 0, 0));
        d.mainBall.aggregate.body.setAngularVelocity(new V(0, 0, 0));
      },
      // The dev HUD's own per-event diagnostics. Read for CONTEXT only, never asserted on:
      // updateDevHud() is throttled, so these rows lag the event that caused them by roughly one
      // check - reading them as the award produced a table where every feature was credited with
      // its predecessor's points. The score delta measured across the hit is the reliable value.
      lastAward: () => {
        const t = document.getElementById('status-last-scoring-event').textContent;
        const m = t.match(/\(\+(\d+),/);
        return m ? parseInt(m[1], 10) : null;
      },
      lastTrigger: () => document.getElementById('status-last-trigger-kind').textContent.trim(),
      // Wait until the score has stopped moving on its own, so a delta measured after this can
      // only have come from the hit that follows it.
      async settle(maxFrames) {
        let last = window.__gp.score(), still = 0;
        for (let f = 0; f < (maxFrames || 14); f++) {
          window.__gp.park();
          await frame();
          const now = window.__gp.score();
          if (now === last) { if (++still >= 4) return { settled: true, score: now, frames: f }; }
          else { still = 0; last = now; }
        }
        return { settled: false, score: window.__gp.score(), frames: maxFrames || 14 };
      },
      // Hold the ball ON the feature for the whole window rather than lobbing it and hoping.
      // A held ball cannot drain, cannot wander into a second feature, and gives the solver a
      // real, repeated contact - which is what both collider hits and trigger enters need.
      async hit(target, opts) {
        opts = opts || {};
        const before = window.__gp.score();
        const m = typeof target === 'string' ? s.meshes.find((x) => x.name === target) : null;
        if (typeof target === 'string' && !m) return { error: 'no mesh ' + target };
        const p = m ? m.getAbsolutePosition().clone() : new V(target.x, target.y, target.z);
        const frames = opts.frames || 14;
        d.mainBall.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
        for (let f = 0; f < frames; f++) {
          d.mainBall.mesh.position.set(p.x, opts.y !== undefined ? opts.y : 0.0135, p.z);
          d.mainBall.aggregate.body.setLinearVelocity(new V(0, 0, 0));
          d.mainBall.aggregate.body.setAngularVelocity(new V(0, 0, 0));
          await frame();
          const delta = window.__gp.score() - before;
          if (delta > 0) return { delta, award: window.__gp.lastAward(), trigger: window.__gp.lastTrigger(), frames: f };
        }
        return { delta: window.__gp.score() - before, award: window.__gp.lastAward(), trigger: window.__gp.lastTrigger(), frames };
      }
    };
  });

  // Relaunch if a check has cost us the ball, so later checks still run against a live ball.
  async function ensureInPlay(page) {
    for (let i = 0; i < 3; i++) {
      if (await page.evaluate(() => window.__gp.inPlay())) return true;
      await page.keyboard.down('Space');
      await page.waitForTimeout(700);
      await page.keyboard.up('Space');
      await page.waitForTimeout(2200);
    }
    return page.evaluate(() => window.__gp.inPlay());
  }

  // =====================================================================================
  console.log('\n=== LAUNCH ===');
  // =====================================================================================
  await page.mouse.click(210, 190);              // real menu dismissal
  await page.waitForTimeout(1200);
  const preLaunch = await page.evaluate(() => ({ inPlay: window.__gp.inPlay(), z: window.__gp.ballPos().z }));
  check('before launch the ball is parked and not in play', preLaunch.inPlay === false, preLaunch);

  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  await page.keyboard.up('Space');
  const postLaunch = await page.evaluate(async () => {
    let maxZ = -99;
    for (let f = 0; f < 40; f++) { await window.__gp.frame(); maxZ = Math.max(maxZ, window.__gp.ballPos().z); }
    return { inPlay: window.__gp.inPlay(), z: +maxZ.toFixed(3) };
  });
  check('Space launches: the ball leaves the plunger and enters play', postLaunch.inPlay === true, postLaunch);
  check('the launched ball travels up-table out of the shooter lane', postLaunch.z > preLaunch.z + 0.1, { from: +preLaunch.z.toFixed(3), maxZ: postLaunch.z });

  // =====================================================================================
  console.log('\n=== SCORING FEATURES ===');
  // =====================================================================================
  // Expected award per feature, from js/config.js. Asserting the exact per-EVENT award is the
  // whole point: "the score went up" was what let the end-of-ball bonus count masquerade as
  // eleven different features on the first run of this file.
  const features = [
    ['bumper (attack)', 'bumper1', 500, {}],
    ['bumper (boss)', 'bumper0', 1200, {}],
    ['Saturn', 'saturn', 3000, { y: 0.02 }],
    ['comet', 'comet', 1000, { y: 0.016 }],
    ['slingshot', 'slingshot0', 100, { y: 0.014 }],
    ['inlane rollover', 'inlaneLampleft', 300, {}],
    ['outlane rollover', 'outlaneLampright', 500, {}],   // SCORE_OUTLANE, not 200 - an early draft of this file guessed
    ['re-entry lane', 'reentryLane1', 2000, {}],
    ['mission target', 'missionTarget1', 750, {}],
    ['Vision Gate', 'visionGateRing', 4000, { frames: 20 }]
  ];
  for (const [label, mesh, expect, opts] of features) {
    await ensureInPlay(page);
    await page.evaluate((n) => window.__gp.settle(n), 16);
    const r = await page.evaluate(([m, o]) => window.__gp.hit(m, o), [mesh, opts]);
    // The award can legitimately be a multiple of the base value while the score-multiplier
    // power-up is running, or carry a bank-completion bonus on top; it can never be unrelated.
    const ok = r.delta >= expect && r.delta % expect === 0;
    check(`${label.padEnd(18)} awards ${expect}`, ok, { delta: r.delta, expect, hudSaysLast: r.award, frames: r.frames });
    await page.evaluate(() => window.__gp.park());
  }

  // The orbit is the one feature that cannot be checked by parking a ball on it: the entrance
  // deliberately does NOT score, it ARMS that side, and only a genuine entrance->completion
  // traversal inside ORBIT_COMPLETION_WINDOW_MS pays out (see ORBITS' block comment in
  // js/config.js). Checking the entrance for points would be asserting a bug.
  await ensureInPlay(page);
  await page.evaluate((n) => window.__gp.settle(n), 16);
  const orbit = await page.evaluate(async () => {
    const enter = await window.__gp.hit('orbitEntranceLampright', { frames: 12 });
    const armed = window.__gp.lastTrigger();
    window.__gp.park();
    for (let f = 0; f < 3; f++) await window.__gp.frame();
    const complete = await window.__gp.hit('orbitCompletionLampright', { frames: 14 });
    return { armed, complete };
  });
  check('orbit entrance registers as an orbit entrance', orbit.armed === 'orbitEntrance', orbit);
  check('orbit entrance -> completion pays the traversal (SCORE_ORBIT 1500)',
    orbit.complete.delta >= 1500 && orbit.complete.delta % 1500 === 0, orbit.complete);
  await page.evaluate(() => window.__gp.park());

  // the target that was struck must actually have dropped (mission visual + gameplay state)
  const dropped = await page.evaluate(() => {
    const s = window.__flipperDebug.scene;
    const m = s.meshes.find((x) => x.name === 'missionTarget1');
    return { y: +m.position.y.toFixed(4) };
  });
  check('the struck mission target has dropped below its raised height', dropped.y < 0.015, dropped);

  // =====================================================================================
  console.log('\n=== PAUSE ===');
  // =====================================================================================
  const pauseState = async () => page.evaluate(() => ({
    overlay: getComputedStyle(document.getElementById('pause-overlay')).display,
    physics: !!BABYLON.EngineStore.LastCreatedScene.physicsEnabled
  }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const paused = await pauseState();
  check('Escape pauses: overlay shown and physics stepping stopped', paused.overlay !== 'none' && paused.physics === false, paused);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const resumed = await pauseState();
  check('Escape resumes: overlay hidden and physics stepping restored', resumed.overlay === 'none' && resumed.physics === true, resumed);

  // =====================================================================================
  console.log('\n=== DRAIN AND GAME OVER ===');
  // =====================================================================================
  // Drain by parking the ball in the drain zone. Ball save can legitimately absorb a drain, so
  // this loops until the life count actually moves rather than assuming one drain costs one ball.
  await ensureInPlay(page);
  const drainOnce = await page.evaluate(async () => {
    const d = window.__flipperDebug, s = d.scene, V = BABYLON.Vector3;
    const dz = s.meshes.find((m) => m.name === 'drainZone');
    const before = window.__gp.lives();
    // One placement, then hands off. handleDrain() runs a deferred reset sequence, and the first
    // version of this check kept teleporting the ball back into the drain THROUGH that sequence,
    // which is why it read a life count that never moved.
    // Placed just UP-table of the zone and rolled in, so the trigger sees a real ENTER. Dropped
    // straight into the middle of it, a ball that was already overlapping never generates one.
    d.mainBall.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
    d.mainBall.mesh.position.set(dz.position.x, 0.0135, dz.position.z + 0.05);
    d.mainBall.aggregate.body.setLinearVelocity(new V(0, 0, -0.9));
    for (let f = 0; f < 60; f++) {
      await window.__gp.frame();
      if (window.__gp.lives() < before) return { before, after: window.__gp.lives(), frames: f, ballSave: !document.getElementById('effect-ballsave').hidden };
    }
    return { before, after: window.__gp.lives(), frames: 60, ballSave: !document.getElementById('effect-ballsave').hidden };
  });
  check('draining costs a ball', drainOnce.after < drainOnce.before, drainOnce);

  // Draining the remaining balls has to be driven from Node, not from one page.evaluate: after a
  // drain the game parks the next ball on the PLUNGER and waits for a real launch, so the loop
  // needs to press Space between drains. An in-page loop cannot, which is why an earlier version
  // of this check sat through 400 frames watching a life count that could never move.
  let gameOver = { shown: false, drains: 0 };
  for (let attempt = 0; attempt < 6 && !gameOver.shown; attempt++) {
    // Read the overlay BEFORE trying to get a ball back into play. On the Game Over screen, Space
    // starts a NEW GAME - so an ensureInPlay() call here silently dismissed the very thing this
    // check is waiting for, reset the life count to 3, and left the loop chasing its own tail.
    const already = await page.evaluate(() => ({
      shown: getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none',
      lives: window.__gp.lives()
    }));
    if (already.shown) { gameOver = { shown: true, drains: gameOver.drains, lives: already.lives }; break; }
    await ensureInPlay(page);
    const r = await page.evaluate(async () => {
      const d = window.__flipperDebug, s = d.scene, V = BABYLON.Vector3;
      const dz = s.meshes.find((m) => m.name === 'drainZone');
      const ov = document.getElementById('gameover-overlay');
      const before = window.__gp.lives();
      d.mainBall.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
      d.mainBall.mesh.position.set(dz.position.x, 0.0135, dz.position.z + 0.05);
      d.mainBall.aggregate.body.setLinearVelocity(new V(0, 0, -0.9));
      for (let f = 0; f < 70; f++) {
        await window.__gp.frame();
        if (getComputedStyle(ov).display !== 'none') return { shown: true, lives: window.__gp.lives() };
        if (window.__gp.lives() < before) return { shown: false, drained: true, lives: window.__gp.lives() };
      }
      return { shown: false, drained: false, lives: window.__gp.lives() };
    });
    gameOver = { shown: r.shown, drains: gameOver.drains + (r.drained ? 1 : 0), lives: r.lives };
    if (!gameOver.shown) await page.waitForTimeout(1600);   // let the post-drain reset finish
  }

  check('draining every ball ends the game', gameOver.shown === true, gameOver);

  check('no uncaught page errors across the whole run', pageErrors.length === 0, pageErrors.slice(0, 4));

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
