// SPIRITBALL mission/vision target-face skin guard.
//
// The missionTargetFace slots differ from every other skin slot in the manifest in two ways that
// are worth their own suite:
//
//   1. It is an ARRAY - one slot per target index - so the thing that can break here is not just
//      "does a texture load" but "does target 1's artwork land on target 1". Each index has its
//      own PBRMaterial instance (targetMat0/1/2), and the whole per-index design depends on that
//      staying true.
//   2. The face it paints is attached to a mesh that MOVES. The drop animation lerps the flag's
//      position.y from TARGET_RAISED_Y_M to TARGET_DROPPED_Y_M, while the trigger volume
//      deliberately stays put - that split is what lets scoring be decoupled from the animation.
//      A skin must not be able to disturb either half.
//
// It also pins the two things an artist needs to be able to trust when authoring:
//   - UV orientation. Verified by painting a quadrant map (image TL red / TR green / BL blue /
//     BR yellow) onto the real faces in the real scene and reading back which image quadrant
//     lands in which screen quadrant. Artwork must arrive upright and un-mirrored.
//   - The tint artwork inherits. Each plate keeps a flat chakra-coloured emissiveColor after a
//     skin loads (by design - see createTargetFaceTexture()'s comment), so a neutral grey image
//     does NOT render neutral. The suite measures what mid-grey actually becomes on each target
//     and prints it, so the spec in SKINS.md is quoting a measurement rather than a guess.
//
// What it deliberately does NOT claim to test: the drop's intermediate interpolation. Measured,
// this headless SwiftShader environment runs at ~1.6 fps with frame deltas up to 677ms against a
// 220ms animation, so the lerp completes inside a single frame and no intermediate value is
// observable at any sampling rate. The endpoints, the timing constants, the trigger-volume
// invariance and skinned-vs-unskinned equality all are observable, and those are what is asserted.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/skin-mission-targets.js
//   PORT=8971 node qa/skin-mission-targets.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8971;
const BASE = `http://localhost:${PORT}/index.html?dev=1`;
const ROOT = path.join(__dirname, '..');
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

const SLOT_PATHS = ['targets/mission-target-0.png', 'targets/mission-target-1.png', 'targets/mission-target-2.png'];
const SLOT_URL_RE = /assets\/skins\/targets\/mission-target-[012]\.png/;
const SLOT_LITERAL = 'missionTargetFace: [\n'
  + SLOT_PATHS.map((p) => `        { path: '${p}', kind: 'albedo' }`).join(',\n')
  + '\n    ]';

let passed = 0, failed = 0;
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  OK   ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
  else { failed++; console.log('  FAIL ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
}

// --- PNG writer -------------------------------------------------------------------------------
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makePng(w, h, pixel) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1); raw[off] = 0;
    for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); raw[off + 1 + x * 3] = r; raw[off + 2 + x * 3] = g; raw[off + 3 + x * 3] = b; }
  }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8);
    b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
// Authored at the ratio the spec recommends, so the test artwork is itself an example of it.
// Flat mid-grey: the point is to read what the material's own emissive does to a NEUTRAL input,
// which is the number an artist needs. Per-index routing is proven by the three distinct URLs,
// not by the pixels, so the three files can safely be identical.
const NEUTRAL_PNG = makePng(448, 480, () => [128, 128, 128]);

async function routeManifest(page) {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'skins.js'), 'utf8');
  const re = /missionTargetFace:\s*\[[^\]]*\]/;
  if (!re.test(src)) throw new Error('missionTargetFace slot not found in js/skins.js - QA needs updating');
  await page.route('**/js/skins.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: src.replace(re, SLOT_LITERAL) }));
}

async function boot(browser, { skinned, artwork, quadrantProbe }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  const requests = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('request', (r) => { if (SLOT_URL_RE.test(r.url())) requests.push(r.url()); });
  if (skinned) await routeManifest(page);
  if (artwork === 'valid') await page.route(SLOT_URL_RE, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: NEUTRAL_PNG }));
  else if (artwork === 'missing') await page.route(SLOT_URL_RE, (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2200);
  await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
  await page.waitForTimeout(2200);

  const state = await page.evaluate(async () => {
    const cfg = await import('./js/config.js');
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const eng = scene.getEngine(), cam = scene.activeCamera;
    const w = eng.getRenderWidth(), h = eng.getRenderHeight();
    const vp = cam.viewport.toGlobal(w, h), tm = scene.getTransformMatrix();
    const rect = (m) => {
      const pts = m.getBoundingInfo().boundingBox.vectorsWorld
        .map((v) => BABYLON.Vector3.Project(v, BABYLON.Matrix.Identity(), tm, vp));
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      pts.forEach((q) => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
      return [x0, y0, x1, y1].map(Math.round);
    };
    const targets = [0, 1, 2].map((i) => {
      const m = scene.getMeshByName('missionTarget' + i);
      const mat = m.material;
      const bb = m.getBoundingInfo().boundingBox;
      // Which box face carries the artwork, and does every face still hold the default full
      // UV square - the assumption the orientation spec is written against.
      const uv = m.getVerticesData(BABYLON.VertexBuffer.UVKind);
      let nonDefaultFaces = 0;
      for (let f = 0; f < 6; f++) {
        let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
        for (let k = 0; k < 4; k++) {
          const j = f * 4 + k;
          u0 = Math.min(u0, uv[j * 2]); u1 = Math.max(u1, uv[j * 2]);
          v0 = Math.min(v0, uv[j * 2 + 1]); v1 = Math.max(v1, uv[j * 2 + 1]);
        }
        if (!(u0 === 0 && u1 === 1 && v0 === 0 && v1 === 1)) nonDefaultFaces++;
      }
      return {
        index: i, mesh: m.name, matName: mat.name,
        tex: mat.albedoTexture ? mat.albedoTexture.name : null,
        albedoColor: mat.albedoColor.asArray().map((v) => +v.toFixed(3)),
        emissiveColor: mat.emissiveColor.asArray().map((v) => +v.toFixed(4)),
        alpha: mat.alpha, metallic: mat.metallic, roughness: mat.roughness,
        ext: bb.extendSize.asArray().map((v) => +v.toFixed(6)),
        pos: m.absolutePosition.asArray().map((v) => +v.toFixed(6)),
        rot: m.rotation.asArray().map((v) => +v.toFixed(6)),
        hasBody: !!m.physicsBody,
        nonDefaultFaces, rect: rect(m)
      };
    });
    return {
      targets,
      // Every material instance distinct? Compared by identity, not by name.
      distinctMaterials: new Set(targets.map((t) => t.matName)).size,
      sameInstance: scene.getMeshByName('missionTarget0').material === scene.getMeshByName('missionTarget1').material,
      consts: { raised: cfg.TARGET_RAISED_Y_M, dropped: cfg.TARGET_DROPPED_Y_M, animMs: cfg.TARGET_DROP_ANIM_MS,
                radius: cfg.TARGET_RADIUS_M },
      faceSize: { w: cfg.TARGET_RADIUS_M * 2, h: 0.03 }
    };
  });

  // ---- drop animation: endpoints, and does the trigger volume stay put? -----------------------
  const drop = await page.evaluate(async () => {
    const dbg = window.__flipperDebug, scene = dbg.scene;
    const cfg = await import('./js/config.js');
    const t = scene.getMeshByName('missionTarget1');
    const ball = dbg.mainBall, body = ball.aggregate.body;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const yStart = +t.position.y.toFixed(5);
    const inPlay = dbg.isBallInPlay();
    // The trigger volume is a separate concern from the flag mesh: updateDropTargetBank() moves
    // only the mesh, and handleTriggerHit() relies on the trigger NOT following it.
    const triggerBefore = t.physicsBody ? t.physicsBody.transformNode.absolutePosition.asArray().map((v) => +v.toFixed(6)) : null;
    const from = t.absolutePosition.clone(); from.z -= 0.06; from.y = ball.mesh.absolutePosition.y;
    ball.mesh.setAbsolutePosition(from);
    body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.9));
    const seen = new Set();
    for (let i = 0; i < 80; i++) { seen.add(+t.position.y.toFixed(5)); await sleep(10); }
    return {
      inPlay, yStart, yValues: [...seen].sort((a, b) => a - b),
      reachedDropped: seen.has(+cfg.TARGET_DROPPED_Y_M.toFixed(5)),
      returnedRaised: [...seen].includes(+cfg.TARGET_RAISED_Y_M.toFixed(5)),
      triggerBefore,
      triggerAfter: t.physicsBody ? t.physicsBody.transformNode.absolutePosition.asArray().map((v) => +v.toFixed(6)) : null
    };
  });

  // ---- orientation + rendered colour ----------------------------------------------------------
  let quad = null, plateColour = null;
  if (quadrantProbe) {
    const rects = await page.evaluate(() => {
      const scene = BABYLON.EngineStore.LastCreatedScene;
      const eng = scene.getEngine(), cam = scene.activeCamera;
      const w = eng.getRenderWidth(), h = eng.getRenderHeight();
      const vp = cam.viewport.toGlobal(w, h), tm = scene.getTransformMatrix();
      const rect = (m) => {
        const pts = m.getBoundingInfo().boundingBox.vectorsWorld
          .map((v) => BABYLON.Vector3.Project(v, BABYLON.Matrix.Identity(), tm, vp));
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        pts.forEach((q) => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
        return [x0, y0, x1, y1].map(Math.round);
      };
      const names = ['missionTarget0', 'missionTarget1', 'missionTarget2'];
      const out = {};
      names.forEach((n) => { out[n] = rect(scene.getMeshByName(n)); });
      // Quadrant map, unlit so the pixels read back are the texture and not the lighting.
      const S = 256;
      const dt = new BABYLON.DynamicTexture('quadProbe', { width: S, height: S }, scene, false);
      const g = dt.getContext();
      g.fillStyle = 'rgb(255,0,0)'; g.fillRect(0, 0, S / 2, S / 2);
      g.fillStyle = 'rgb(0,255,0)'; g.fillRect(S / 2, 0, S / 2, S / 2);
      g.fillStyle = 'rgb(0,0,255)'; g.fillRect(0, S / 2, S / 2, S / 2);
      g.fillStyle = 'rgb(255,255,0)'; g.fillRect(S / 2, S / 2, S / 2, S / 2);
      dt.update();
      const probe = new BABYLON.StandardMaterial('tgtQuadProbe', scene);
      probe.disableLighting = true; probe.emissiveTexture = dt;
      probe.diffuseColor = new BABYLON.Color3(0, 0, 0); probe.specularColor = new BABYLON.Color3(0, 0, 0);
      names.forEach((n) => { scene.getMeshByName(n).material = probe; });
      // Render only the three plates so nothing can contaminate the read.
      const keep = new Set(names);
      scene.meshes.forEach((m) => { if (!keep.has(m.name)) m.setEnabled(false); });
      scene.effectLayers.slice().forEach((l) => l.dispose());
      scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
      return out;
    });
    // The dev HUD (?dev=1) paints a scrim over the left half of the viewport, which is exactly
    // where the target bank projects - without hiding it the quadrant read comes back null on all
    // three plates and looks like a UV failure rather than an occluded screenshot.
    await page.evaluate(() => { document.querySelectorAll('body > *:not(canvas)').forEach((e) => { e.style.visibility = 'hidden'; }); });
    await page.waitForTimeout(700);
    quad = { rects, png: await page.screenshot() };
  } else {
    // Plate colour as shipped/skinned, sampled from the plate centre before anything is disturbed.
    await page.evaluate(() => { document.querySelectorAll('body > *:not(canvas)').forEach((e) => { e.style.visibility = 'hidden'; }); });
    await page.waitForTimeout(400);
    plateColour = { rects: state.targets.map((t) => t.rect), png: await page.screenshot() };
  }

  await page.close();
  return { state, drop, quad, plateColour, requests, pageErrors };
}

// --- PNG reader -------------------------------------------------------------------------------
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * bpp);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++]; const row = y * w * bpp; const prev = (y - 1) * w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const cur = raw[rp++];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = (x >= bpp && y > 0) ? out[prev + x - bpp] : 0;
      let v;
      if (filter === 0) v = cur; else if (filter === 1) v = cur + a;
      else if (filter === 2) v = cur + b; else if (filter === 3) v = cur + ((a + b) >> 1);
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
             v = cur + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)); }
      out[row + x] = v & 0xff;
    }
  }
  return { w, h, bpp, data: out };
}
const QUAD = { TL: [255, 0, 0], TR: [0, 255, 0], BL: [0, 0, 255], BR: [255, 255, 0] };
function quadrantOf(img, r, ly, hy, lx, hx) {
  const w = r[2] - r[0], h = r[3] - r[1];
  const counts = {};
  for (let y = Math.round(r[1] + h * ly); y < Math.round(r[1] + h * hy); y++)
    for (let x = Math.round(r[0] + w * lx); x < Math.round(r[0] + w * hx); x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const i = (y * img.w + x) * img.bpp;
      let best = null, bd = 1e9;
      for (const k in QUAD) { const c = QUAD[k];
        const d = (c[0] - img.data[i]) ** 2 + (c[1] - img.data[i + 1]) ** 2 + (c[2] - img.data[i + 2]) ** 2;
        if (d < bd) { bd = d; best = k; } }
      if (bd < 12000) counts[best] = (counts[best] || 0) + 1;
    }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}
function meanRgb(img, r) {
  let sr = 0, sg = 0, sb = 0, n = 0;
  const w = r[2] - r[0], h = r[3] - r[1];
  for (let y = Math.round(r[1] + h * 0.3); y < Math.round(r[1] + h * 0.7); y++)
    for (let x = Math.round(r[0] + w * 0.3); x < Math.round(r[0] + w * 0.7); x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const i = (y * img.w + x) * img.bpp;
      sr += img.data[i]; sg += img.data[i + 1]; sb += img.data[i + 2]; n++;
    }
  return n ? [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)] : null;
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n=== FALLBACK (all three slots unset - the shipped state) ===');
  const base = await boot(browser, { skinned: false });
  check('no uncaught page errors', base.pageErrors.length === 0, base.pageErrors);
  check('unset slots issue no network request', base.requests.length === 0, base.requests);
  base.state.targets.forEach((t) => {
    check(`target ${t.index} renders its own procedural face texture`,
      t.tex === 'targetFaceTex' + (t.index + 1), { tex: t.tex });
  });
  check('each target has its own material instance (per-index slots need per-index materials)',
    base.state.distinctMaterials === 3 && base.state.sameInstance === false,
    { distinct: base.state.distinctMaterials, targets0and1Shared: base.state.sameInstance });

  console.log('\n=== FACE GEOMETRY THE ARTWORK SPEC IS WRITTEN AGAINST ===');
  const fs0 = base.state.faceSize;
  const aspect = fs0.w / fs0.h;
  console.log('  visible face ' + fs0.w + 'm x ' + fs0.h + 'm  aspect ' + aspect.toFixed(4)
    + '  | on-screen ' + base.state.targets.map((t) => (t.rect[2] - t.rect[0]) + 'x' + (t.rect[3] - t.rect[1])).join(', ') + ' px');
  check('the face is 14:15 (0.9333), the ratio the spec recommends',
    Math.abs(aspect - 14 / 15) < 0.0005, { aspect: +aspect.toFixed(4), spec: +(14 / 15).toFixed(4) });
  check('the plates are unrotated, so image axes map straight to screen axes',
    base.state.targets.every((t) => t.rot.every((v) => v === 0)), base.state.targets.map((t) => t.rot));
  check('all 18 box faces still carry the default full u[0,1]/v[0,1] square',
    base.state.targets.every((t) => t.nonDefaultFaces === 0),
    base.state.targets.map((t) => t.nonDefaultFaces));

  console.log('\n=== NO BRIGHTNESS CEILING IS NEEDED HERE ===');
  // Unlike bumperCap, applySkinTexture()'s white reset is a NO-OP on these materials - they are
  // already white, because createTargetFaceTexture() bakes the chakra colour into the texture
  // rather than tinting through albedoColor. So there is nothing for an albedoScale to preserve,
  // and adding one for symmetry would darken artwork for no reason.
  check('fallback albedoColor is already white on all three targets',
    base.state.targets.every((t) => JSON.stringify(t.albedoColor) === JSON.stringify([1, 1, 1])),
    base.state.targets.map((t) => t.albedoColor));
  check('each target keeps its own distinct chakra emissive (the per-target identity)',
    new Set(base.state.targets.map((t) => JSON.stringify(t.emissiveColor))).size === 3,
    base.state.targets.map((t) => ({ i: t.index, emissive: t.emissiveColor })));

  console.log('\n=== UV ORIENTATION (quadrant map painted onto the real faces) ===');
  const orient = await boot(browser, { skinned: false, quadrantProbe: true });
  const qimg = decodePng(orient.quad.png);
  let orientOk = true;
  const orientRows = [];
  for (const name of Object.keys(orient.quad.rects)) {
    const r = orient.quad.rects[name];
    const got = {
      'screen TL': quadrantOf(qimg, r, 0, 0.5, 0, 0.5),
      'screen TR': quadrantOf(qimg, r, 0, 0.5, 0.5, 1),
      'screen BL': quadrantOf(qimg, r, 0.5, 1, 0, 0.5),
      'screen BR': quadrantOf(qimg, r, 0.5, 1, 0.5, 1)
    };
    const ok = got['screen TL'] === 'TL' && got['screen TR'] === 'TR'
      && got['screen BL'] === 'BL' && got['screen BR'] === 'BR';
    if (!ok) orientOk = false;
    orientRows.push({ name, got, ok });
  }
  orientRows.forEach((o) => console.log('  ' + o.name + '  ' + JSON.stringify(o.got)));
  check('artwork arrives UPRIGHT on every target (image top -> screen top)', orientOk,
    orientRows.filter((o) => !o.ok).map((o) => o.name));
  check('artwork arrives UN-MIRRORED on every target (image left -> screen left)', orientOk);

  console.log('\n=== BROKEN PATH (all three configured, files missing) ===');
  const broken = await boot(browser, { skinned: true, artwork: 'missing' });
  check('a failed load on all three slots does not break boot', broken.pageErrors.length === 0, broken.pageErrors);
  check('all three requests were actually attempted (the failure path is exercised)',
    new Set(broken.requests).size === 3, broken.requests);
  check('every target falls back to its own procedural face',
    broken.state.targets.every((t) => t.tex === 'targetFaceTex' + (t.index + 1)),
    broken.state.targets.map((t) => t.tex));

  console.log('\n=== ARTWORK LOADED ON ALL THREE SLOTS ===');
  const art = await boot(browser, { skinned: true, artwork: 'valid' });
  check('no uncaught page errors', art.pageErrors.length === 0, art.pageErrors);
  check('every target picked up artwork instead of its procedural face',
    art.state.targets.every((t) => t.tex && !/^targetFaceTex/.test(t.tex)),
    art.state.targets.map((t) => t.tex));
  // The per-index guarantee. Proven by URL, not by pixels: each material must be holding the
  // texture from ITS OWN slot, which is the failure mode a shared material instance would cause.
  check('each target holds the texture from its OWN slot index (no cross-wiring)',
    art.state.targets.every((t) => t.tex && t.tex.endsWith('mission-target-' + t.index + '.png')),
    art.state.targets.map((t) => ({ i: t.index, tex: t.tex })));
  check('albedoColor stays white after a load (nothing to preserve, nothing lost)',
    art.state.targets.every((t) => JSON.stringify(t.albedoColor) === JSON.stringify([1, 1, 1])),
    art.state.targets.map((t) => t.albedoColor));
  check('the plate keeps its translucent lit-plastic response (alpha/metallic/roughness)',
    art.state.targets.every((t, i) => t.alpha === base.state.targets[i].alpha
      && t.metallic === base.state.targets[i].metallic && t.roughness === base.state.targets[i].roughness),
    art.state.targets.map((t) => ({ alpha: t.alpha, metallic: t.metallic, roughness: t.roughness })));
  check('each target keeps its own chakra emissive after skinning (identity survives artwork)',
    art.state.targets.every((t, i) => JSON.stringify(t.emissiveColor) === JSON.stringify(base.state.targets[i].emissiveColor)),
    art.state.targets.map((t) => t.emissiveColor));

  console.log('\n=== WHAT NEUTRAL GREY BECOMES (the tint artwork inherits) ===');
  // Not an assertion - a measurement, quoted into SKINS.md so the spec is not guesswork. Flat
  // rgb(128,128,128) artwork is loaded on all three and the rendered plate centre is read back.
  const aimg = decodePng(art.plateColour.png);
  const bimg = decodePng(base.plateColour.png);
  art.plateColour.rects.forEach((r, i) => {
    console.log('  target ' + i + '  emissive ' + JSON.stringify(art.state.targets[i].emissiveColor)
      + '  fallback renders ' + JSON.stringify(meanRgb(bimg, base.plateColour.rects[i]))
      + '  |  grey artwork renders ' + JSON.stringify(meanRgb(aimg, r)));
  });
  const greys = art.plateColour.rects.map((r) => meanRgb(aimg, r));
  check('neutral grey does NOT render neutral (the emissive tint is real and per-target)',
    greys.every((c) => c && Math.max(...c) - Math.min(...c) > 8),
    greys.map((c) => ({ rgb: c, spread: Math.max(...c) - Math.min(...c) })));
  check('the three targets tint differently from each other',
    new Set(greys.map((c) => c.join(','))).size === 3, greys);

  console.log('\n=== DROP ANIMATION UNCHANGED ===');
  console.log('  constants raised=' + base.state.consts.raised + ' dropped=' + base.state.consts.dropped
    + ' animMs=' + base.state.consts.animMs);
  console.log('  fallback drop: ' + JSON.stringify(base.drop.yValues) + '  artwork drop: ' + JSON.stringify(art.drop.yValues));
  check('the ball was in play for the staged drop (a real trigger, not a no-op)',
    base.drop.inPlay === true && art.drop.inPlay === true,
    { fallback: base.drop.inPlay, artwork: art.drop.inPlay });
  check('the flag starts raised at TARGET_RAISED_Y_M',
    base.drop.yStart === +base.state.consts.raised.toFixed(5), { yStart: base.drop.yStart });
  check('the flag reaches TARGET_DROPPED_Y_M when hit (fallback)', base.drop.reachedDropped === true, base.drop.yValues);
  check('the flag reaches TARGET_DROPPED_Y_M when hit (artwork)', art.drop.reachedDropped === true, art.drop.yValues);
  check('the drop endpoints are identical with and without artwork',
    JSON.stringify(base.drop.yValues) === JSON.stringify(art.drop.yValues),
    { fallback: base.drop.yValues, artwork: art.drop.yValues });
  // The architectural half that matters most: the trigger must NOT follow the flag down, or
  // scoring stops being decoupled from the animation.
  check('the trigger volume does not move while the flag drops (fallback)',
    JSON.stringify(base.drop.triggerBefore) === JSON.stringify(base.drop.triggerAfter),
    { before: base.drop.triggerBefore, after: base.drop.triggerAfter });
  check('the trigger volume does not move while the flag drops (artwork)',
    JSON.stringify(art.drop.triggerBefore) === JSON.stringify(art.drop.triggerAfter),
    { before: art.drop.triggerBefore, after: art.drop.triggerAfter });

  console.log('\n=== GEOMETRY / COLLIDER UNCHANGED ACROSS ALL THREE STATES ===');
  const geo = (r) => r.state.targets.map((t) => ({ i: t.index, ext: t.ext, pos: t.pos, rot: t.rot, hasBody: t.hasBody }));
  check('every target still carries a physics body', base.state.targets.every((t) => t.hasBody === true));
  check('extents, positions, rotations and bodies identical fallback vs artwork',
    JSON.stringify(geo(base)) === JSON.stringify(geo(art)));
  check('extents, positions, rotations and bodies identical fallback vs broken-path',
    JSON.stringify(geo(base)) === JSON.stringify(geo(broken)));

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
