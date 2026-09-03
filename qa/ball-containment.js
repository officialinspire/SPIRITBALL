// SPIRITBALL - ball containment and speed clamp
// =========================================================================================
// The one physics guarantee no other suite in qa/ actually asserts. This build's vendored Havok
// has no CCD (see MAX_BALL_SPEED_MS's own comment in js/config.js) - the speed clamp is the ONLY
// thing standing between a hard shot and a ball leaving the table through a 6mm wall. Every pass
// that touches flipper energy, restitution or kick strength is a chance to break it, and until
// this file existed nothing would have caught that.
//
// Two questions:
//   1. Is a ball ever allowed to exceed the clamp, however it got its velocity?
//   2. Driven at the clamp straight into every perimeter wall, does it stay inside the table?
//
// The two halves need different harnesses, and getting that wrong is easy:
//   - The CLAMP lives in updateBallPhysics(), which the RENDER LOOP calls. Stepping physics by
//     hand walks straight past it - an early version of this file did exactly that, measured a
//     ball at 7.6 m/s and would have reported a broken clamp that was never given a chance to
//     run. That half drives real rAF frames.
//   - CONTAINMENT is pure physics, so it steps manually (the technique ball-movement.js and
//     flipper-energy.js use) - and deliberately at 3.0 m/s, ABOVE the clamp the game would
//     enforce, so the walls are tested harder than play can ever push them.
//
//   python3 -m http.server 8971      (repo root)
//   PORT=8971 node qa/ball-containment.js
// =========================================================================================
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const PORT = process.env.PORT || '8971';

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
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 30000 });
  await page.mouse.click(400, 300);
  await page.waitForTimeout(1500);
  await page.keyboard.down('Space'); await page.waitForTimeout(600); await page.keyboard.up('Space');
  await page.waitForTimeout(1800);

  // --- clamp, on the real render loop ---
  // The clamp lives in updateBallPhysics(), which only governs a ball that is IN PLAY. A drained
  // ball is not clamped - it is falling out of the world, and its speed climbs without limit.
  // This loop used to sample 10 frames per velocity with no idea whether the ball was still in
  // play, and a headless frame here is 150-300ms, so the ball crosses the whole table between
  // samples and can drain inside the window. It passed anyway only because the board's old
  // bumper cluster sat at (0, 0.16), directly on the +Z line this fires along, and intercepted
  // the ball before it could get back down; once the shot-corridor refactor opened the centre
  // channel, all ten samples of the 12 m/s and 40 m/s runs were of a drained ball at z=-1.6m,
  // 1.2m PAST the drain, reporting 4.0 m/s and "failing" a clamp that was never asked to run.
  //
  // Two fixes, so this measures the clamp rather than the layout: re-launch a real ball before
  // each velocity, and tag every sample with isBallInPlay() so only in-play samples are asserted
  // on. A run that collects no in-play samples at all is itself a failure below - the check can
  // no longer pass by never observing the thing it claims to test.
  const clampOut = [];
  for (const v of [5, 12, 40]) {
    // Settle first: a ball that drained during the previous velocity's samples can still read as
    // in play for a moment while the drain sequence resolves, and checking too early skips the
    // re-launch and leaves the next velocity sampling a dead ball (0/10 in-play).
    await page.waitForTimeout(1600);
    const live = await page.evaluate(() => window.__flipperDebug.isBallInPlay());
    if (!live) {
      await page.keyboard.down('Space'); await page.waitForTimeout(600); await page.keyboard.up('Space');
      await page.waitForTimeout(1800);
    }
    clampOut.push(await page.evaluate(async (speedAsked) => {
      const d = window.__flipperDebug, V = BABYLON.Vector3;
      const body = d.mainBall.aggregate.body, mesh = d.mainBall.mesh;
      mesh.position.set(0, 0.0135, 0.05);
      body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
      body.setLinearVelocity(new V(0, 0, speedAsked));
      body.setAngularVelocity(new V(0, 0, 0));
      const samples = [];
      for (let f = 0; f < 10; f++) {
        await new Promise((r) => requestAnimationFrame(r));
        samples.push({ s: +body.getLinearVelocity().length().toFixed(3), inPlay: d.isBallInPlay() });
      }
      const inPlay = samples.filter((x) => x.inPlay).map((x) => x.s);
      return { asked: speedAsked, samples: samples.map((x) => (x.inPlay ? x.s : `${x.s}*`)),
               inPlayCount: inPlay.length, peak: inPlay.length ? Math.max(...inPlay) : null };
    }, v));
  }

  const out = await page.evaluate(() => {
    const d = window.__flipperDebug, s = d.scene, V = BABYLON.Vector3;
    const eng = s.getPhysicsEngine();
    s.physicsEnabled = false;                       // we drive the steps
    const body = d.mainBall.aggregate.body, mesh = d.mainBall.mesh;
    const speed = () => body.getLinearVelocity().length();

    // The table's own footprint, read off the perimeter walls rather than hardcoded.
    let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
    ['leftWall', 'rightWall', 'topWall'].forEach((n) => {
      const m = s.meshes.find((x) => x.name === n); m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      minX = Math.min(minX, bb.minimumWorld.x); maxX = Math.max(maxX, bb.maximumWorld.x);
      minZ = Math.min(minZ, bb.minimumWorld.z); maxZ = Math.max(maxZ, bb.maximumWorld.z);
    });

    // --- containment: fire at every wall from several angles ---
    const shots = [];
    const aims = [
      ['left wall', -0.05, 0.05, -1, 0], ['right wall', 0.05, 0.05, 1, 0],
      ['top wall', 0.00, 0.20, 0, 1], ['top-left corner', -0.05, 0.15, -1, 1],
      ['top-right corner', 0.05, 0.15, 1, 1], ['lower left', -0.05, -0.15, -1, -1],
      ['lower right', 0.05, -0.15, 1, -1], ['left guide', -0.02, 0.05, -1, 0.4],
      ['right guide', 0.02, 0.05, 1, 0.4]
    ];
    const CLAMP_SPEED = 3.0; // deliberately ABOVE the configured clamp, so the clamp has to do its job
    for (const [name, px, pz, dx, dz] of aims) {
      const L = Math.hypot(dx, dz);
      mesh.position.set(px, 0.0135, pz);
      body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
      body.setLinearVelocity(new V((dx / L) * CLAMP_SPEED, 0, (dz / L) * CLAMP_SPEED));
      body.setAngularVelocity(new V(0, 0, 0));
      let worst = 0, peak = 0, drained = false;
      for (let i = 0; i < 600; i++) {
        eng._step(1 / 240);
        peak = Math.max(peak, speed());
        const p = mesh.position;
        // Only the SEALED boundary counts: the two side walls and the top wall. The table's
        // down-table end is deliberately open - that is the drain - so a ball leaving past minZ
        // has done the one thing it is supposed to do there, not tunnelled. Measuring it as an
        // escape is what made this check report a 0.07m "tunnel" on one run and nothing on the
        // next, purely depending on whether the ball happened to drain inside the window.
        if (p.z < minZ) { drained = true; break; }
        const esc = Math.max(minX - p.x, p.x - maxX, p.z - maxZ);
        worst = Math.max(worst, esc);
      }
      shots.push({ name, escaped: +worst.toFixed(4), peak: +peak.toFixed(3), drained });
    }
    return { bounds: { minX: +minX.toFixed(3), maxX: +maxX.toFixed(3), minZ: +minZ.toFixed(3), maxZ: +maxZ.toFixed(3) }, shots };
  });

  console.log(`\n=== BALL CONTAINMENT ===`);
  console.log(`  wall footprint  x ${out.bounds.minX}..${out.bounds.maxX}   z ${out.bounds.minZ}..${out.bounds.maxZ}\n`);
  console.log('  speed clamp (real render loop; MAX_BALL_SPEED_MS is ~2.55 m/s):');
  console.log('  (a sample marked * is a drained ball - out of play, so not governed by the clamp)');
  for (const c of clampOut) console.log(`     asked ${String(c.asked).padStart(2)} m/s  ->  per-frame ${JSON.stringify(c.samples)}  in-play ${c.inPlayCount}/10`);
  const clampPeaks = clampOut.filter((c) => c.peak !== null).map((c) => c.peak);
  const observedInPlay = clampOut.reduce((n, c) => n + c.inPlayCount, 0);
  const worstClamp = clampPeaks.length ? Math.max(...clampPeaks) : null;
  check('the clamp was actually exercised on a ball in play', observedInPlay > 0, { observedInPlay });
  check('an absurd velocity is pulled back under the clamp', worstClamp !== null && worstClamp <= 2.8, { worstClamp, ceiling: 2.8 });
  // No "the clamp is not too tight" assertion here on purpose. A headless frame is ~200ms, so by
  // the first sample the ball has already crossed the table and bounced - the peak this harness
  // can see is a post-bounce speed, not the clamp value, and asserting on it would be measuring
  // the sandbox. qa/flipper-energy.js covers that side properly: its tip shot exits at 2.550 m/s,
  // which IS MAX_BALL_SPEED_MS, so the ceiling is demonstrably reachable by a real shot.

  console.log('\n  wall shots, stepped at 3.0 m/s - deliberately ABOVE the clamp, so this is harsher');
  console.log('  than anything real play can produce (the clamp does not run during manual steps).');
  console.log('  Escape is measured against the SEALED boundary only - the drain end is meant to be open:');
  for (const sh of out.shots) console.log(`     ${sh.name.padEnd(18)} escaped ${sh.escaped}m   peak ${sh.peak} m/s${sh.drained ? '   (drained, as expected)' : ''}`);
  const escaped = out.shots.filter((sh) => sh.escaped > 0.005);
  check('no shot tunnels out of the table, even above the clamp', escaped.length === 0, escaped.length ? escaped : { shots: out.shots.length });
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3));

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})();
