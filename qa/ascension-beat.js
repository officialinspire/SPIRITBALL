// SPIRITBALL ASCENSION-beat guard.
//
// The rank-up moment is deliberately the biggest feedback in the game, which makes it the one
// most able to go wrong: it fires MID-PLAY, with the ball still live and travelling. Two things
// must stay true no matter how the beat is tuned later, and neither is visible in a diff:
//
//   1. it is a beat, not a cutscene - physics keeps stepping, the ball keeps moving, and the
//      visual part is over inside ~1s;
//   2. it never whites out a live ball - the screen flash is a wash, not the drain's whiteout.
//
// Plus the reduced-motion contract: no flash, no extra particle burst, but still a real
// acknowledgement (the tinted backglass message and the sound).
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/ascension-beat.js
//   PORT=8971 node qa/ascension-beat.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8971;
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

let passed = 0, failed = 0;
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  OK   ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
  else { failed++; console.log('  FAIL ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
}

// Drive one real ascension and record, every frame, what the beat is doing.
async function runAscension(reducedMotion) {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const context = await browser.newContext({
    viewport: { width: 620, height: 520 },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });

  await page.evaluate(() => {
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const dbg = window.__flipperDebug;
    scene.getEngine().setHardwareScalingLevel(6);
    scene.effectLayers.slice().forEach((l) => { l.isEnabled = false; });
    window.__row = (label) => { let v = null;
      document.querySelectorAll('#status-panel .row').forEach((r) => { const sp = r.querySelectorAll('span');
        if (sp.length >= 2 && sp[0].textContent.trim() === label) v = sp[1].textContent.trim(); });
      return v; };
    // Per-frame recorder. Started just before the completing hit and read afterwards, because a
    // round trip cannot keep up with a 260ms flash.
    window.__rec = null;
    const flash = document.getElementById('flash-overlay');
    const tick = () => {
      const r = window.__rec;
      if (r) {
        const t = performance.now() - r.t0;
        const op = parseFloat(getComputedStyle(flash).opacity) || 0;
        if (op > r.peakFlash) { r.peakFlash = op; r.peakAt = t; }
        if (op > 0.01) r.lastFlashAt = t;
        // 'ascensionBurst', not 'hitBurst': the bumper hits that drive the vision to completion
        // spawn ordinary bursts in these same frames, so counting those cannot answer whether the
        // ASCENSION burst specifically fired or was correctly suppressed.
        const bursts = scene.particleSystems.filter((ps) => ps.name === 'ascensionBurst').length;
        if (bursts > r.maxBursts) r.maxBursts = bursts;
        if (bursts > 0) r.lastBurstAt = t;
        r.physicsSamples.push(scene.physicsEnabled ? 1 : 0);
        r.ballPos.push([+dbg.mainBall.mesh.position.x.toFixed(3), +dbg.mainBall.mesh.position.z.toFixed(3)]);
        r.frames++;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__arm = () => { window.__rec = { t0: performance.now(), peakFlash: 0, peakAt: -1,
      lastFlashAt: -1, maxBursts: 0, lastBurstAt: -1, physicsSamples: [], ballPos: [], frames: 0 }; };
    window.__hold = async (name, frames) => {
      const m = scene.meshes.find((x) => x.name === name); if (!m) return;
      dbg.mainBall.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
      for (let i = 0; i < (frames || 14); i++) {
        const q = m.getAbsolutePosition();
        dbg.mainBall.mesh.position.set(q.x, 0.0135, q.z);
        dbg.mainBall.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
        await new Promise((r) => requestAnimationFrame(r));
      }
      // Left DYNAMIC on purpose: the ball must be genuinely live across the beat, which is the
      // thing being asserted. Nudged clear of the bumper so it does not just re-score.
      dbg.mainBall.mesh.position.set(0, 0.0135, -0.12);
      dbg.mainBall.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0.35, 0, -0.35));
    };
  });

  await page.mouse.click(310, 260); await page.waitForTimeout(1500);
  await page.keyboard.down('Space'); await page.waitForTimeout(1300); await page.keyboard.up('Space');
  await page.waitForTimeout(1800);

  const row = () => page.evaluate(() => window.__row('Mission:'));
  for (let t = 0; t < 6 && (await row()) === 'none'; t++) await page.evaluate(() => window.__hold('missionTarget0'));
  const vision = await row();
  // Feed to one hit short of completion, arm the recorder, then land the completing hit.
  let guard = 0;
  while (guard++ < 40) {
    const r = await row();
    if (r === 'none') break;
    const m = r.match(/\((\d+)\/(\d+)\)/);
    if (m && parseInt(m[1], 10) === parseInt(m[2], 10) - 1) break;
    await page.evaluate(() => window.__hold('bumper1', 3));
  }
  await page.evaluate(() => window.__arm());
  for (let h = 0; h < 20; h++) { await page.evaluate(() => window.__hold('bumper1', 3));
    if ((await row()) === 'none') break; }
  await page.waitForTimeout(1400);
  const rec = await page.evaluate(() => window.__rec);
  const lastEvent = await page.evaluate(() => window.__row('Last scoring event:'));
  await browser.close();
  return { rec, vision, lastEvent, pageErrors };
}

(async () => {
  console.log('\n=== NORMAL MOTION ===');
  const n = await runAscension(false);
  console.log('  vision:', n.vision, '| last event:', n.lastEvent);
  check('an ascension actually fired', /ASCENSION|INSIGHT GAINED/.test(n.lastEvent || ''), { lastEvent: n.lastEvent });
  check('a spectral flash happened', n.rec.peakFlash > 0.05, { peak: n.rec.peakFlash });
  check('the flash is a wash, not the drain whiteout (peak well under 0.5)',
    n.rec.peakFlash <= 0.30, { peak: n.rec.peakFlash });
  check('the flash is finished inside 1s', n.rec.lastFlashAt >= 0 && n.rec.lastFlashAt < 1000,
    { lastFlashAt: Math.round(n.rec.lastFlashAt) });
  check('a particle burst fired', n.rec.maxBursts > 0, { maxBursts: n.rec.maxBursts });
  check('the burst is finished inside 1s', n.rec.lastBurstAt >= 0 && n.rec.lastBurstAt < 1000,
    { lastBurstAt: Math.round(n.rec.lastBurstAt) });
  const stepped = n.rec.physicsSamples.filter((v) => v === 1).length;
  check('physics never stopped stepping during the beat (no cutscene)',
    stepped === n.rec.physicsSamples.length && stepped > 0,
    { stepping: stepped, frames: n.rec.physicsSamples.length });
  const moved = n.rec.ballPos.some(([x, z], i) => i > 0 &&
    (Math.abs(x - n.rec.ballPos[0][0]) > 0.01 || Math.abs(z - n.rec.ballPos[0][1]) > 0.01));
  check('the ball kept moving through the beat', moved, { first: n.rec.ballPos[0], last: n.rec.ballPos[n.rec.ballPos.length - 1] });
  check('no uncaught page errors', n.pageErrors.length === 0, n.pageErrors);

  console.log('\n=== REDUCED MOTION ===');
  const r = await runAscension(true);
  console.log('  vision:', r.vision, '| last event:', r.lastEvent);
  check('an ascension still fired', /ASCENSION|INSIGHT GAINED/.test(r.lastEvent || ''), { lastEvent: r.lastEvent });
  check('no screen flash', r.rec.peakFlash <= 0.01, { peak: r.rec.peakFlash });
  check('no extra particle burst', r.rec.maxBursts === 0, { maxBursts: r.rec.maxBursts });
  check('physics still stepping', r.rec.physicsSamples.every((v) => v === 1) && r.rec.physicsSamples.length > 0,
    { frames: r.rec.physicsSamples.length });
  check('no uncaught page errors', r.pageErrors.length === 0, r.pageErrors);

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
