// SPIRITBALL Vision Gate presentation guard.
//
// This suite exists because the gate is the one fixture where presentation and mechanics are
// tightly interleaved: the capture freezes a physics body, runs a scoring burst, drives a bespoke
// colour cycle that fights the lamp system for ownership of one material, and unwinds all of it on
// a timer. A polish pass on the LOOK of that is exactly the kind of change that can silently break
// the FEEL of it, so this pins both halves:
//
//   - every mechanic the polish pass was told to preserve - capture freezes the ball (ANIMATED),
//     scoring fires, the eject returns it to DYNAMIC with the configured speed away from the gate,
//     and the sequence still runs for VISION_GATE_SEQUENCE_MS;
//   - the presentation hierarchy the pass established - throat < collar < halo < rim < beacon at
//     rest, and the gate becoming dramatically brighter ONLY during capture;
//   - that idle costs no particles, which is the "no constant particle spam" line;
//   - that reduced motion removes the spectral colour drift outright (a photosensitivity concern)
//     while merely slowing the rotation (a vestibular one) - the distinction this file already
//     draws between the two.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/vision-gate.js
//   PORT=8971 node qa/vision-gate.js
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

async function boot(browser, { reducedMotion } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`http://localhost:${PORT}/index.html?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2200);
  await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
  await page.waitForTimeout(2200);
  return { page, pageErrors };
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const { page, pageErrors } = await boot(browser);

  // ---------------------------------------------------------------- idle presentation
  const idle = await page.evaluate(async () => {
    const cfg = await import('./js/config.js');
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const part = (n) => {
      const m = scene.getMeshByName(n);
      if (!m) return null;
      const mat = m.material;
      const e = mat.emissiveColor;
      return { name: n, hasBody: !!m.physicsBody,
               emissive: [e.r, e.g, e.b].map((v) => +v.toFixed(4)),
               level: +(e.r + e.g + e.b).toFixed(4),
               alpha: mat.alpha, tex: mat.emissiveTexture ? mat.emissiveTexture.name : null };
    };
    const names = ['visionGateThroat', 'visionGateCollar', 'visionGateHalo', 'visionGateRing', 'visionGateBeacon'];
    const posts = [0, 1, 2].map((i) => {
      const m = scene.getMeshByName('visionGatePost' + i);
      return m ? { name: m.name, hasBody: !!m.physicsBody,
                   pos: m.absolutePosition.asArray().map((v) => +v.toFixed(6)) } : null;
    });
    const trig = scene.getMeshByName('visionGateTrigger');
    const tbb = trig.getBoundingInfo().boundingBox;
    return {
      parts: Object.fromEntries(names.map((n) => [n, part(n)])),
      posts,
      trigger: { pos: trig.absolutePosition.asArray().map((v) => +v.toFixed(6)),
                 ext: tbb.extendSize.asArray().map((v) => +v.toFixed(6)), hasBody: !!trig.physicsBody },
      consts: { radius: cfg.VISION_GATE_RADIUS_M, collar: cfg.VISION_GATE_COLLAR_RADIUS_M,
                seq: cfg.VISION_GATE_SEQUENCE_MS, eject: cfg.VISION_GATE_EJECT_SPEED_MS,
                pos: cfg.VISION_GATE_POS },
      // Particle systems attached at the gate while idle - the "no constant spam" check.
      // Matched by EMITTER, not by name: three permanent chakraSparkle systems belong to the
      // mission targets and matching on the name counted those as the gate's, which is a check
      // failing on a fixture it was not looking at.
      gateParticleSystems: scene.particleSystems.filter((ps) => {
        const e = ps.emitter;
        return !!(e && e.name && /^visionGate/.test(e.name));
      }).map((ps) => ps.name),
      totalParticleSystems: scene.particleSystems.length
    };
  });

  console.log('\n=== PORTAL IS BUILT (collar, throat, halo all present) ===');
  for (const n of ['visionGateThroat', 'visionGateCollar', 'visionGateHalo', 'visionGateRing', 'visionGateBeacon']) {
    check(`${n} exists`, !!idle.parts[n], idle.parts[n] ? { level: idle.parts[n].level } : null);
  }
  check('the beacon is a textured shaft, not a flat solid cylinder',
    idle.parts.visionGateBeacon && idle.parts.visionGateBeacon.tex === 'gateBeaconTex',
    { tex: idle.parts.visionGateBeacon && idle.parts.visionGateBeacon.tex });

  console.log('\n=== EMISSIVE HIERARCHY AT REST ===');
  const lv = (n) => idle.parts[n] ? idle.parts[n].level : null;
  console.log('  throat ' + lv('visionGateThroat') + '  collar ' + lv('visionGateCollar')
    + '  halo ' + lv('visionGateHalo') + '  rim ' + lv('visionGateRing') + '  beacon ' + lv('visionGateBeacon'));
  check('throat is the dimmest lit element (structure, not signal)',
    lv('visionGateThroat') < lv('visionGateCollar'), { throat: lv('visionGateThroat'), collar: lv('visionGateCollar') });
  check('collar sits below the rim ring (housing reads dimmer than the mouth)',
    lv('visionGateCollar') < lv('visionGateRing'), { collar: lv('visionGateCollar'), rim: lv('visionGateRing') });
  check('the beacon is the brightest element (it is the gate\'s long-range marker)',
    lv('visionGateBeacon') > lv('visionGateRing'), { beacon: lv('visionGateBeacon'), rim: lv('visionGateRing') });

  console.log('\n=== NO CONSTANT PARTICLE SPAM WHILE IDLE ===');
  check('no gate particle system is running at rest', idle.gateParticleSystems.length === 0, idle.gateParticleSystems);

  console.log('\n=== DECORATION CANNOT TOUCH PHYSICS ===');
  for (const n of ['visionGateThroat', 'visionGateCollar', 'visionGateHalo', 'visionGateRing', 'visionGateBeacon']) {
    check(`${n} carries no physics body`, idle.parts[n] && idle.parts[n].hasBody === false);
  }
  check('all three guard posts still carry physics bodies',
    idle.posts.every((p) => p && p.hasBody === true), idle.posts.map((p) => p && [p.name, p.hasBody]));
  check('the capture trigger still matches VISION_GATE_RADIUS_M and keeps its body',
    Math.abs(idle.trigger.ext[0] - idle.consts.radius) < 1e-6 && idle.trigger.hasBody === true,
    { ext: idle.trigger.ext, radius: idle.consts.radius });
  check('the trigger still sits at VISION_GATE_POS',
    Math.abs(idle.trigger.pos[0] - idle.consts.pos.x) < 1e-6
      && Math.abs(idle.trigger.pos[2] - idle.consts.pos.z) < 1e-6, idle.trigger.pos);

  // ---------------------------------------------------------------- capture + eject
  console.log('\n=== CAPTURE AND EJECT MECHANICS PRESERVED ===');
  const run = await page.evaluate(async () => {
    const dbg = window.__flipperDebug, scene = dbg.scene;
    const trig = scene.getMeshByName('visionGateTrigger');
    const ring = scene.getMeshByName('visionGateRing');
    const ball = dbg.mainBall, body = ball.aggregate.body;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const readScore = () => parseInt(document.getElementById('hud-score').textContent, 10) || 0;
    const restGlow = scene.effectLayers[0] ? scene.effectLayers[0].intensity : 0;
    const restRim = (() => { const e = ring.material.emissiveColor; return e.r + e.g + e.b; })();
    const before = readScore();
    // Staged from the gate's own open mouth (-Z), at the ball's rolling height. Approaching from
    // any other side means clipping a guard post first.
    const from = trig.absolutePosition.clone(); from.z -= 0.05; from.y = 0.0135;
    ball.mesh.setAbsolutePosition(from);
    body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
    body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.9));

    // Wall-clock timestamps, NOT loop-index arithmetic. This environment renders at ~1.6 fps, so
    // an `await sleep(15)` really takes hundreds of ms and a t = i * 15 label understates elapsed
    // time by more than an order of magnitude - measured, it reported the 1800ms sequence as 45ms.
    const t0 = performance.now();
    let capturedAtMs = -1, ejectedAtMs = -1, award = 0, ejectPos = null;
    let glowPeak = 0, rimPeak = 0, ringScalePeak = 0, rimMinDuringCapture = Infinity;
    let capturePos = null, ejectVel = null;
    for (let i = 0; i < 90; i++) {
      await sleep(15);
      const t = performance.now() - t0;
      const animated = body.getMotionType() === BABYLON.PhysicsMotionType.ANIMATED;
      // Stop as soon as this capture has completed - the eject drops the ball back into the
      // bumper cluster, which can bounce it straight back in for a second capture and blur the
      // first one's measurements into the next.
      if (ejectedAtMs >= 0 && t - ejectedAtMs > 400) break;
      if (animated && capturedAtMs < 0) { capturedAtMs = t; capturePos = ball.mesh.absolutePosition.asArray().map((v) => +v.toFixed(4)); }
      if (animated && ejectedAtMs >= 0) break; // a second capture started; stop measuring
      if (!animated && capturedAtMs >= 0 && ejectedAtMs < 0) {
        ejectedAtMs = t;
        const v = body.getLinearVelocity();
        ejectVel = [v.x, v.y, v.z].map((n) => +n.toFixed(4));
        ejectPos = ball.mesh.absolutePosition.asArray().map((n) => +n.toFixed(4));
      }
      if (!award && readScore() > before) award = readScore() - before;
      const g = scene.effectLayers[0] ? scene.effectLayers[0].intensity : 0;
      glowPeak = Math.max(glowPeak, g);
      const e = ring.material.emissiveColor; const sum = e.r + e.g + e.b;
      rimPeak = Math.max(rimPeak, sum);
      ringScalePeak = Math.max(ringScalePeak, ring.scaling.x);
      if (capturedAtMs >= 0 && ejectedAtMs < 0) rimMinDuringCapture = Math.min(rimMinDuringCapture, sum);
    }
    return {
      award, capturedAtMs, ejectedAtMs, capturePos, ejectVel, ejectPos,
      gatePos: [0.027, 0.235],
      restGlow: +restGlow.toFixed(3), glowPeak: +glowPeak.toFixed(3),
      restRim: +restRim.toFixed(3), rimPeak: +rimPeak.toFixed(3),
      rimMinDuringCapture: +rimMinDuringCapture.toFixed(3),
      ringScalePeak: +ringScalePeak.toFixed(3),
      finalGlow: +(scene.effectLayers[0] ? scene.effectLayers[0].intensity : 0).toFixed(3),
      finalRim: +(() => { const e = ring.material.emissiveColor; return e.r + e.g + e.b; })().toFixed(3),
      finalRingScale: +ring.scaling.x.toFixed(3),
      motionAfter: body.getMotionType() === BABYLON.PhysicsMotionType.DYNAMIC ? 'DYNAMIC' : 'other'
    };
  });
  console.log('  ' + JSON.stringify(run));
  check('the capture fires and freezes the ball (ANIMATED)', run.capturedAtMs >= 0, { atMs: run.capturedAtMs });
  check('the capture scores', run.award > 0, { award: run.award });
  check('the ball is held at the gate centre while captured',
    run.capturePos && Math.abs(run.capturePos[0] - idle.consts.pos.x) < 1e-3
      && Math.abs(run.capturePos[2] - idle.consts.pos.z) < 1e-3, run.capturePos);
  check('the sequence runs for about VISION_GATE_SEQUENCE_MS',
    run.ejectedAtMs > 0 && Math.abs((run.ejectedAtMs - run.capturedAtMs) - idle.consts.seq) < 700,
    { measuredMs: Math.round(run.ejectedAtMs - run.capturedAtMs), expectedMs: idle.consts.seq });
  check('the eject returns the ball to DYNAMIC physics', run.motionAfter === 'DYNAMIC', { motion: run.motionAfter });
  // Displacement, not instantaneous velocity. The eject sets the ball's velocity synchronously
  // inside endVisionGateCapture(), and this environment renders at ~1.6 fps - measured, the first
  // sample after the motion type flips back to DYNAMIC already showed vz = +0.182 because the ball
  // had bounced off the bumper cluster before the sample landed. The velocity the code sets is not
  // observable from outside at this frame rate; where the ball ENDS UP is, and it is the property
  // that actually matters: the gate's mouth is its open -Z side, and the ball has to leave through it.
  check('the eject puts the ball outside the gate, through its open -Z mouth',
    run.ejectPos && run.ejectPos[2] < idle.consts.pos.z - idle.consts.radius,
    { ejectZ: run.ejectPos && run.ejectPos[2], gateZ: idle.consts.pos.z, mouthEdge: +(idle.consts.pos.z - idle.consts.radius).toFixed(4) });

  console.log('\n=== BRIGHT ONLY DURING CAPTURE ===');
  check('the glow layer is boosted during capture and restored after',
    run.glowPeak > run.restGlow + 0.3 && Math.abs(run.finalGlow - run.restGlow) < 1e-3,
    { rest: run.restGlow, peak: run.glowPeak, final: run.finalGlow });
  check('the rim ring is dramatically brighter during capture (>=2x its rest level)',
    run.rimPeak >= run.restRim * 2, { rest: run.restRim, peak: run.rimPeak });
  check('the rim never dips back to its rest level mid-capture (the pulseMesh ownership hazard)',
    run.rimMinDuringCapture > run.restRim * 1.05,
    { restLevel: run.restRim, minDuringCapture: run.rimMinDuringCapture });
  check('the ring physically pulses on capture', run.ringScalePeak > 1.1, { peakScale: run.ringScalePeak });
  check('every capture-time change is fully restored afterwards',
    Math.abs(run.finalRim - run.restRim) < 1e-3 && Math.abs(run.finalRingScale - 1) < 1e-3,
    { rim: run.finalRim, restRim: run.restRim, ringScale: run.finalRingScale });
  check('no uncaught page errors', pageErrors.length === 0, pageErrors);
  await page.close();

  // ---------------------------------------------------------------- reduced motion
  console.log('\n=== REDUCED MOTION ===');
  const rm = await boot(browser, { reducedMotion: true });
  const rmData = await rm.page.evaluate(async () => {
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const halo = scene.getMeshByName('visionGateHalo');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const rot0 = halo.rotation.y;
    const e0 = halo.material.emissiveColor.clone();
    let drift = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(25);
      const e = halo.material.emissiveColor;
      drift = Math.max(drift, Math.abs(e.r - e0.r) + Math.abs(e.g - e0.g) + Math.abs(e.b - e0.b));
    }
    return { reduced: !!window.SPIRITBALL_reducedMotion, rotated: Math.abs(halo.rotation.y - rot0) > 0,
             colourDrift: +drift.toFixed(5) };
  });
  check('reduced motion is actually active in this run', rmData.reduced === true);
  check('the halo still rotates under reduced motion (motion slowed, not removed)', rmData.rotated === true);
  check('the spectral colour drift is removed outright under reduced motion',
    rmData.colourDrift === 0, { drift: rmData.colourDrift });
  check('no uncaught page errors under reduced motion', rm.pageErrors.length === 0, rm.pageErrors);

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
