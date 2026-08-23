// SPIRITBALL ball angular-motion audit.
//
// Asks whether the ball reads as ROLLING STEEL rather than a sliding sphere, and splits that into
// the two halves that fail independently:
//
//   PHYSICS  - is Havok actually rolling the ball (omega*r == v), does a collision change spin the
//              way a real one would, and does spin decay when the ball is not going anywhere?
//   VISUAL   - does that rotation reach the screen? Two separate things have to be true: the mesh
//              quaternion must track the physics, AND the ball must have surface detail, because a
//              uniform sphere looks identical at every orientation no matter how correctly it spins.
//
// That second point is the one this suite exists for. When it was written the physics was already
// perfect (omega*r/v = 0.998) and the mesh was already turning ~13.8 revolutions in 1.5s - and the
// ball still looked like it was sliding, because it had no texture at all. Physics assertions alone
// would have passed the whole time.
//
// Determinism: the game is PAUSED first (scene.physicsEnabled = false, so the render loop stops
// stepping physics) and this rig drives scene.getPhysicsEngine()._step() at a fixed 1/60. Headless
// Chromium renders at ~5 FPS, so anything measured off the live loop measures the sandbox instead.
//
// Seeds are clearance-checked before use: dropping a ball inside a collider makes Havok eject it,
// and the resulting numbers describe the ejection rather than the physics (the same trap that made
// an earlier version of qa/ball-trap-audit.js report artifacts as real).
//
// Reads window.__flipperDebug - the permanent read-only ?dev=1 hook. Nothing to hand-patch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/ball-spin.js
//   PORT=8971 node qa/ball-spin.js         (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const LAUNCH = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};
const PORT = process.env.PORT || 8971;
const URL = `http://localhost:${PORT}/index.html?dev=1`;

let fails = 0;
const check = (label, cond, detail) => {
  if (!cond) fails++;
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
};

const RIG = () => {
  const d = window.__flipperDebug, s = d.scene, pe = s.getPhysicsEngine();
  const body = d.mainBall.aggregate.body, mesh = d.mainBall.mesh, DT = 1 / 60, Y = 0.0135, R = 0.0135;
  d.leftFlipper.active = false; d.rightFlipper.active = false;
  for (let i = 0; i < 60; i++) { d.updateFlipperMotor(d.leftFlipper, DT * 1000); d.updateFlipperMotor(d.rightFlipper, DT * 1000); }

  const clearance = (px, pz) => {
    let best = Infinity;
    for (let a = 0; a < 32; a++) {
      const th = a * Math.PI / 16;
      try {
        const h = pe.raycast(new BABYLON.Vector3(px, Y, pz), new BABYLON.Vector3(px + Math.cos(th) * 0.09, Y, pz + Math.sin(th) * 0.09));
        if (h && h.hasHit) { const dd = Math.hypot(h.hitPointWorld.x - px, h.hitPointWorld.z - pz); if (dd < best) best = dd; }
      } catch (e) { /* no hit along this ray */ }
    }
    return best;
  };

  const mat = mesh.material;
  const out = {
    visual: {
      usesQuaternion: !!mesh.rotationQuaternion,
      albedoTexture: !!(mat && mat.albedoTexture),
      emissiveTexture: !!(mat && mat.emissiveTexture)
    },
    angularDamping: body.getAngularDamping(),
    linearDamping: body.getLinearDamping()
  };

  // --- free roll: omega*r vs v, and mesh rotation vs the integral of |omega|
  mesh.position.set(0.21, Y, 0.36);
  body.setLinearVelocity(new BABYLON.Vector3(0, 0, -0.5));
  body.setAngularVelocity(new BABYLON.Vector3(-0.5 / R, 0, 0));   // no-slip: wx = vz/R
  let qPrev = mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null;
  let meshTurn = 0, omegaIntegral = 0;
  const ratios = [];
  for (let i = 0; i < 45; i++) {
    pe._step(DT); d.updateBallPhysics(d.mainBall, DT * 1000);
    const v = body.getLinearVelocity(), w = body.getAngularVelocity();
    const sp = Math.hypot(v.x, v.y, v.z), wm = Math.hypot(w.x, w.y, w.z);
    omegaIntegral += wm * DT;
    const q = mesh.rotationQuaternion;
    if (q && qPrev) {
      const dot = Math.min(1, Math.abs(q.x * qPrev.x + q.y * qPrev.y + q.z * qPrev.z + q.w * qPrev.w));
      meshTurn += 2 * Math.acos(dot);
      qPrev = q.clone();
    }
    if (sp > 0.05) ratios.push(wm * R / sp);
  }
  ratios.sort((a, b) => a - b);
  out.freeRoll = {
    medianRatio: +ratios[Math.floor(ratios.length / 2)].toFixed(3),
    meshTurn: +meshTurn.toFixed(2),
    omegaIntegral: +omegaIntegral.toFixed(2),
    agreement: +(meshTurn / omegaIntegral).toFixed(3)
  };

  // --- collision: a wall reverses travel but cannot reverse spin about an axis in its own face,
  // so the ball must come off carrying its spin (i.e. with backspin relative to the new direction).
  out.bounce = null;
  for (const sx of [0, -0.05, 0.05]) {
    if (clearance(sx, 0.395) < R + 0.001) continue;
    mesh.position.set(sx, Y, 0.395);
    body.setLinearVelocity(new BABYLON.Vector3(0, 0, 1.2));
    body.setAngularVelocity(new BABYLON.Vector3(1.2 / R, 0, 0));
    for (let i = 0; i < 120; i++) {
      const bv = body.getLinearVelocity().clone(), bw = body.getAngularVelocity().clone();
      pe._step(DT); d.updateBallPhysics(d.mainBall, DT * 1000);
      if (bv.z > 0.3 && body.getLinearVelocity().z < 0) {
        for (let k = 0; k < 3; k++) { pe._step(DT); d.updateBallPhysics(d.mainBall, DT * 1000); }
        const v2 = body.getLinearVelocity(), w2 = body.getAngularVelocity();
        out.bounce = { vIn: +bv.z.toFixed(3), vOut: +v2.z.toFixed(3), wIn: +bw.x.toFixed(1), wOut: +w2.x.toFixed(1),
                       spinKept: Math.sign(w2.x) === Math.sign(bw.x), spinBled: +(1 - Math.abs(w2.x / bw.x)).toFixed(2) };
        break;
      }
    }
    if (out.bounce) break;
  }

  // --- yaw spin with travel pinned out, so only the angular dynamics remain
  mesh.position.set(0.0, Y, -0.16);
  body.setAngularVelocity(new BABYLON.Vector3(0, 60, 0));
  const yaw = [];
  for (let i = 0; i <= 600; i++) {
    body.setLinearVelocity(BABYLON.Vector3.Zero());
    pe._step(DT);
    if (i % 120 === 0) yaw.push({ t: +(i / 60).toFixed(1), w: +Math.abs(body.getAngularVelocity().y).toFixed(2) });
  }
  out.yaw = yaw;
  out.yawHalfLife = +(Math.log(2) / body.getAngularDamping()).toFixed(1);
  return out;
};

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 30000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display !== 'none', null, { timeout: 30000 });
  await page.mouse.click(640, 450);
  await page.waitForTimeout(2000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  const r = await page.evaluate(RIG);
  console.log(`=== BALL ANGULAR MOTION  (angularDamping ${r.angularDamping.toFixed(3)}, linearDamping ${r.linearDamping}) ===\n`);

  console.log('  PHYSICS');
  check('the ball truly ROLLS: omega*r matches v (1.0 = rolling, 0 = sliding)',
    Math.abs(r.freeRoll.medianRatio - 1) < 0.05, { ratio: r.freeRoll.medianRatio });
  check('a wall bounce keeps the ball spinning the same way (it leaves with backspin)',
    r.bounce && r.bounce.spinKept, r.bounce);
  check('the wall also bleeds some spin, rather than leaving it untouched',
    r.bounce && r.bounce.spinBled > 0.05, r.bounce ? { bled: r.bounce.spinBled } : null);
  check('a stationary ball does not spin forever - yaw decays',
    r.yaw[r.yaw.length - 1].w < r.yaw[0].w * 0.6, { from: r.yaw[0].w, to: r.yaw[r.yaw.length - 1].w });

  console.log('\n  VISUAL');
  check('the mesh is driven by a quaternion, so physics rotation can reach it', r.visual.usesQuaternion);
  // The assertion that would have caught the real defect: a uniform sphere cannot show rotation.
  check('the ball has surface detail, so its rotation is actually visible',
    r.visual.albedoTexture && r.visual.emissiveTexture, r.visual);
  check('mesh rotation matches the physics it came from (integral of |omega|)',
    Math.abs(r.freeRoll.agreement - 1) < 0.12,
    { meshTurnedRad: r.freeRoll.meshTurn, omegaIntegral: r.freeRoll.omegaIntegral, ratio: r.freeRoll.agreement });

  console.log(`\n  free roll: mesh turned ${r.freeRoll.meshTurn} rad (${(r.freeRoll.meshTurn / (2 * Math.PI)).toFixed(1)} revolutions) in 0.75s`);
  console.log(`  yaw spin-down with travel pinned out (half-life ${r.yawHalfLife}s from Havok's own damping):`);
  r.yaw.forEach((x) => console.log(`     t=${x.t}s  ${x.w} rad/s`));
  check('no page errors', pageErrors.length === 0, pageErrors);
  console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
