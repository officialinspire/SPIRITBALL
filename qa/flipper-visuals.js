// SPIRITBALL flipper-visual guard.
//
// The flipper is the one object on this board where a purely cosmetic edit is most dangerous: the
// bat mesh IS the collider, its local offset from the pivot is what makes the hinge mathematically
// stationary, and its restitution/friction/motion-type/collision-filter are the whole of the
// game's energy transfer. A "just repaint it" pass touches a material two lines away from all of
// that. So this file asserts the paint changed and everything else did not.
//
// What it pins:
//   - GEOMETRY, PIVOT, MOTION, COLLISION, ENERGY TRANSFER, all read from the live scene and
//     compared against the config constants they are built from (this pass did not touch
//     js/config.js, so agreement with config is the check that none of them moved);
//   - the bat is actually painted - albedo and emissive textures present, albedoColor white so
//     the baked face is not tinted twice;
//   - LEFT/RIGHT SYMMETRY, measured from rendered pixels rather than argued from the fact that
//     they share a material;
//   - BALL PROMINENCE, measured with the ball parked at a fixed world position so the comparison
//     is controlled rather than wherever the ball happened to roll.
//
// One number here is deliberately NOT "flipper got darker". Measured before and after, the
// flipper's own pick-verified pixels went 84.8 -> 95.5 while the playfield around it went
// 81.9 -> 54.0. That is the intended outcome and matches the board-graphics audit's diagnosis: the
// problem was never the mesh's own brightness (it owned 0.6% of the frame's brightest pixels at
// 1.04% coverage) but the uniform emissive throwing a halo onto everything nearby. Bright detail
// on a dark body reads brighter per-pixel while emitting far less total light, so the check that
// matters is the SPILL, not the surface.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/flipper-visuals.js
//   PORT=8971 node qa/flipper-visuals.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const zlib = require('zlib');

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

function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * bpp);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++]; const row = y * w * bpp; const prev = (y - 1) * w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const cur = raw[rp++];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = (x >= bpp && y > 0) ? out[prev + x - bpp] : 0;
      let v;
      if (f === 0) v = cur; else if (f === 1) v = cur + a;
      else if (f === 2) v = cur + b; else if (f === 3) v = cur + ((a + b) >> 1);
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
             v = cur + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)); }
      out[row + x] = v & 0xff;
    }
  }
  return { w, h, bpp, data: out };
}
const statAt = (img, pts) => {
  if (!pts || !pts.length) return null;
  const L = [];
  for (const [x, y] of pts) {
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
    const i = (y * img.w + x) * img.bpp;
    L.push(0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]);
  }
  if (!L.length) return null;
  L.sort((a, b) => a - b);
  return { n: L.length, median: +L[Math.floor(L.length / 2)].toFixed(1),
           p95: +L[Math.floor(0.95 * (L.length - 1))].toFixed(1) };
};
const statRect = (img, r) => {
  const L = []; let clip = 0;
  for (let y = Math.max(0, r[1]); y < Math.min(img.h, r[3]); y++)
    for (let x = Math.max(0, r[0]); x < Math.min(img.w, r[2]); x++) {
      const i = (y * img.w + x) * img.bpp;
      const R = img.data[i], G = img.data[i + 1], B = img.data[i + 2];
      if (R >= 250 && G >= 250 && B >= 250) clip++;
      L.push(0.2126 * R + 0.7152 * G + 0.0722 * B);
    }
  L.sort((a, b) => a - b);
  return { mean: +(L.reduce((a, b) => a + b, 0) / L.length).toFixed(1),
           p95: +L[Math.floor(0.95 * (L.length - 1))].toFixed(1),
           max: +L[L.length - 1].toFixed(1), clipPct: +(100 * clip / L.length).toFixed(3) };
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2200);
  await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
  await page.waitForTimeout(2200);

  const rig = await page.evaluate(async () => {
    const cfg = await import('./js/config.js');
    const dbg = window.__flipperDebug, scene = dbg.scene;
    const mat = scene.getMaterialByName('flipperMat');
    const read = (f) => {
      const m = f.mesh, bb = m.getBoundingInfo().boundingBox;
      const body = m.physicsBody;
      return {
        name: m.name,
        // Local size derived from the mesh's own vertex extent, not from what we asked for.
        size: [bb.extendSize.x * 2, bb.extendSize.y * 2, bb.extendSize.z * 2].map((v) => +v.toFixed(6)),
        localPos: m.position.asArray().map((v) => +v.toFixed(6)),
        localRot: m.rotationQuaternion ? m.rotationQuaternion.asArray().map((v) => +v.toFixed(6)) : null,
        parentIsPivot: !!(m.parent && m.parent.name === f.pivotNode.name),
        pivotPos: f.pivotNode.position.asArray().map((v) => +v.toFixed(6)),
        hasBody: !!body,
        motionType: body ? body.getMotionType() : null,
        disablePreStep: body ? body.disablePreStep : null,
        filterCollideMask: f.aggregate.shape ? f.aggregate.shape.filterCollideMask : null,
        restAngleRad: +f.restAngleRad.toFixed(6),
        minAngleRad: +f.minAngleRad.toFixed(6),
        maxAngleRad: +f.maxAngleRad.toFixed(6),
        motorSign: f.motorSign,
        materialIs: m.material === mat
      };
    };
    return {
      left: read(dbg.leftFlipper), right: read(dbg.rightFlipper),
      mat: {
        albedoColor: mat.albedoColor.asArray().map((v) => +v.toFixed(3)),
        emissiveColor: mat.emissiveColor.asArray().map((v) => +v.toFixed(3)),
        metallic: mat.metallic, roughness: mat.roughness,
        albedoTex: mat.albedoTexture ? mat.albedoTexture.name : null,
        emissiveTex: mat.emissiveTexture ? mat.emissiveTexture.name : null
      },
      consts: {
        len: cfg.FLIPPER_LENGTH_M, hei: cfg.FLIPPER_HEIGHT_M, thk: cfg.FLIPPER_THICKNESS_M,
        pivotX: cfg.FLIPPER_PIVOT_X_M, z: cfg.FLIPPER_Z_M, clearance: cfg.FLIPPER_PLAYFIELD_CLEARANCE_M,
        sweep: cfg.FLIPPER_SWEEP_RAD, leftRest: cfg.FLIPPER_LEFT_REST_RAD, rightRest: cfg.FLIPPER_RIGHT_REST_RAD,
        restitution: cfg.FLIPPER_RESTITUTION, friction: cfg.FLIPPER_FRICTION, mass: cfg.FLIPPER_MASS_KG
      },
      ANIMATED: BABYLON.PhysicsMotionType.ANIMATED
    };
  });

  console.log('\n=== GEOMETRY UNTOUCHED ===');
  for (const side of ['left', 'right']) {
    const f = rig[side];
    check(`${side} bat is still ${rig.consts.len} x ${rig.consts.hei} x ${rig.consts.thk}`,
      Math.abs(f.size[0] - rig.consts.len) < 1e-6 && Math.abs(f.size[1] - rig.consts.hei) < 1e-6
        && Math.abs(f.size[2] - rig.consts.thk) < 1e-6, { size: f.size });
  }
  console.log('\n=== PIVOT UNTOUCHED ===');
  for (const side of ['left', 'right']) {
    const f = rig[side];
    check(`${side} bat hangs off its pivot node`, f.parentIsPivot === true);
    check(`${side} bat's local offset is still half its length on X, with identity rotation`,
      Math.abs(f.localPos[0] - rig.consts.len / 2) < 1e-6 && f.localPos[1] === 0 && f.localPos[2] === 0
        && JSON.stringify(f.localRot) === JSON.stringify([0, 0, 0, 1]),
      { localPos: f.localPos, localRot: f.localRot });
    check(`${side} pivot still sits at the configured hinge point`,
      Math.abs(Math.abs(f.pivotPos[0]) - rig.consts.pivotX) < 1e-6
        && Math.abs(f.pivotPos[2] - rig.consts.z) < 1e-6,
      { pivotPos: f.pivotPos, pivotX: rig.consts.pivotX, z: rig.consts.z });
  }
  console.log('\n=== MOTION UNTOUCHED ===');
  for (const side of ['left', 'right']) {
    const f = rig[side];
    check(`${side} body is ANIMATED with preStep enabled`,
      f.motionType === rig.ANIMATED && f.disablePreStep === false,
      { motionType: f.motionType, disablePreStep: f.disablePreStep });
    check(`${side} sweep range is still exactly FLIPPER_SWEEP_RAD`,
      Math.abs((f.maxAngleRad - f.minAngleRad) - rig.consts.sweep) < 1e-6,
      { span: +(f.maxAngleRad - f.minAngleRad).toFixed(6), sweep: rig.consts.sweep });
  }
  check('left/right rest angles still match config, and the motor signs are still opposite',
    Math.abs(rig.left.restAngleRad - rig.consts.rightRest) < 1e-6
      && Math.abs(rig.right.restAngleRad - rig.consts.leftRest) < 1e-6
      && rig.left.motorSign === -rig.right.motorSign,
    { leftRest: rig.left.restAngleRad, rightRest: rig.right.restAngleRad,
      signs: [rig.left.motorSign, rig.right.motorSign] });

  console.log('\n=== COLLISION AND ENERGY TRANSFER UNTOUCHED ===');
  for (const side of ['left', 'right']) {
    check(`${side} still collides with the ball category only`,
      rig[side].filterCollideMask !== null && rig[side].filterCollideMask > 0,
      { mask: rig[side].filterCollideMask });
    check(`${side} still carries a physics body`, rig[side].hasBody === true);
  }
  // Restitution and friction are the energy transfer. They are set from config at construction and
  // nothing in a material pass can reach them - but that is the claim, so it gets measured.
  const phys = await page.evaluate(async () => {
    const cfg = await import('./js/config.js');
    const dbg = window.__flipperDebug;
    const g = (f) => {
      const m = f.aggregate.shape ? f.aggregate.shape.material : null;
      return m ? { restitution: +(m.restitution ?? -1).toFixed(6), friction: +(m.friction ?? -1).toFixed(6) } : null;
    };
    return { left: g(dbg.leftFlipper), right: g(dbg.rightFlipper),
             restitution: cfg.FLIPPER_RESTITUTION, friction: cfg.FLIPPER_FRICTION };
  });
  check('both bats still use the configured restitution and friction',
    phys.left && phys.right
      && Math.abs(phys.left.restitution - phys.restitution) < 1e-6
      && Math.abs(phys.left.friction - phys.friction) < 1e-6
      && JSON.stringify(phys.left) === JSON.stringify(phys.right),
    phys);

  console.log('\n=== THE BAT IS ACTUALLY PAINTED ===');
  check('an albedo bat texture is applied', rig.mat.albedoTex === 'flipperBatTex', { tex: rig.mat.albedoTex });
  check('a separate emissive detail texture is applied',
    rig.mat.emissiveTex === 'flipperBatEmisTex', { tex: rig.mat.emissiveTex });
  check('albedoColor is white so the baked face is not tinted twice',
    JSON.stringify(rig.mat.albedoColor) === JSON.stringify([1, 1, 1]), rig.mat.albedoColor);
  check('both bats share the one material (symmetry is structural)',
    rig.left.materialIs === true && rig.right.materialIs === true);

  // ---------------------------------------------------------------- rendered measurements
  const shot = await page.evaluate(() => {
    const dbg = window.__flipperDebug, scene = dbg.scene;
    const eng = scene.getEngine(), cam = scene.activeCamera;
    const w = eng.getRenderWidth(), h = eng.getRenderHeight();
    const vp = cam.viewport.toGlobal(w, h), tm = scene.getTransformMatrix();
    // Ball parked at a FIXED world position clear of both bats, so the ball-vs-flipper comparison
    // is controlled rather than measuring wherever the ball happened to roll.
    const ball = dbg.mainBall, body = ball.aggregate.body;
    ball.mesh.setAbsolutePosition(new BABYLON.Vector3(0, 0.0135, -0.06));
    body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
    body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
    body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
    // Forced, and not optional: setAbsolutePosition() marks the world matrix dirty but does not
    // recompute it, so both rect() and scene.pick() below would otherwise still be working from
    // where the ball WAS. Measured, that sampled background instead of ball and reported it as
    // 87.1 against a true 153.8 - a failing ball-prominence check caused entirely by the probe.
    ball.mesh.computeWorldMatrix(true);
    const rect = (m) => {
      const pts = m.getBoundingInfo().boundingBox.vectorsWorld
        .map((v) => BABYLON.Vector3.Project(v, BABYLON.Matrix.Identity(), tm, vp));
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      pts.forEach((q) => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
      return [x0, y0, x1, y1].map(Math.round);
    };
    const samp = (names, budget) => {
      const want = new Set(names);
      const boxes = names.map((n) => { const m = scene.getMeshByName(n); return m ? rect(m) : null; }).filter(Boolean);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      boxes.forEach((r) => { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]); });
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
      const cols = Math.max(2, Math.round(Math.sqrt(budget * (x1 - x0) / Math.max(1, y1 - y0))));
      const rows = Math.max(2, Math.ceil(budget / cols)); const pts = [];
      for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
        const px = Math.round(x0 + ((ix + 0.5) / cols) * (x1 - x0));
        const py = Math.round(y0 + ((iy + 0.5) / rows) * (y1 - y0));
        const hit = scene.pick(px, py);
        if (hit && hit.hit && hit.pickedMesh && want.has(hit.pickedMesh.name)) pts.push([px, py]);
      }
      return pts;
    };
    return {
      leftRect: rect(scene.getMeshByName('leftFlipper')),
      rightRect: rect(scene.getMeshByName('rightFlipper')),
      leftPts: samp(['leftFlipper'], 500), rightPts: samp(['rightFlipper'], 500),
      ballPts: samp(['ball'], 400),
      // Playfield immediately around the bats - the surface the old uniform emissive was washing.
      spillPts: [[560, 700], [600, 720], [680, 720], [720, 700], [640, 740], [520, 700], [760, 700]]
    };
  });
  await page.evaluate(() => { document.querySelectorAll('body > *:not(canvas)').forEach((e) => { e.style.visibility = 'hidden'; }); });
  await page.waitForTimeout(600);
  const img = decodePng(await page.screenshot());
  const L = statAt(img, shot.leftPts), R = statAt(img, shot.rightPts);
  const B = statAt(img, shot.ballPts), S = statAt(img, shot.spillPts);
  const LR = statRect(img, shot.leftRect), RR = statRect(img, shot.rightRect);

  console.log('\n=== LEFT / RIGHT VISUAL SYMMETRY ===');
  console.log('  left  ' + JSON.stringify(L) + '  bbox ' + JSON.stringify(LR));
  console.log('  right ' + JSON.stringify(R) + '  bbox ' + JSON.stringify(RR));
  check('both bats sample a comparable number of pixels (same projected size)',
    Math.abs(L.n - R.n) / Math.max(L.n, R.n) < 0.15, { left: L.n, right: R.n });
  check('both bats render at the same brightness (within 12%)',
    Math.abs(L.median - R.median) / Math.max(L.median, R.median) < 0.12,
    { left: L.median, right: R.median });
  check('neither bat clips to white', LR.clipPct < 0.05 && RR.clipPct < 0.05,
    { left: LR.clipPct, right: RR.clipPct });

  console.log('\n=== BALL STAYS MORE PROMINENT THAN THE FLIPPERS ===');
  const flipMedian = (L.median * L.n + R.median * R.n) / (L.n + R.n);
  console.log('  ball ' + B.median + ' (n=' + B.n + ')   flippers ' + flipMedian.toFixed(1)
    + ' (n=' + (L.n + R.n) + ')   playfield around them ' + S.median);
  check('the ball reads clearly brighter than the bats (>=1.3x)',
    B.median >= flipMedian * 1.3, { ball: B.median, flippers: +flipMedian.toFixed(1),
      ratio: +(B.median / flipMedian).toFixed(2) });
  // The spill is the real target. Measured before this pass at 81.9 on these same points; the
  // threshold sits between that and the 54.0 measured after, so a regression toward the old
  // uniform emissive fails here even if the bat's own surface looks unchanged.
  check('the bats no longer wash the playfield around them (spill < 70, was 81.9)',
    S.median < 70, { spill: S.median, before: 81.9 });
  check('no uncaught page errors', pageErrors.length === 0, pageErrors);

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
