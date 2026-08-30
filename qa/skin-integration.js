// SPIRITBALL decorative-skin integration guard.
//
// The skin system (js/skins.js + applySkinTexture() in babylon-game.js) is an artwork drop-in
// point, and the risky thing about a drop-in point is that it is only ever exercised the day
// someone drops artwork in - by which time a regression in it looks like "the new art broke the
// game" rather than like a pre-existing hole. This file exercises all three states of the
// cabinetRails slot on every run, so the path is known-good BEFORE a file lands in it:
//
//   1. UNSET (the shipped state, path: null) - no request is issued at all, and the procedural
//      profile from createCabinetRailTexture() is what renders. This is the state the console-
//      cleanliness argument in skins.js rests on, so it is asserted rather than assumed.
//   2. CONFIGURED BUT BROKEN (path points at a file that is not there) - the game must still
//      boot and play. A bad deploy or a typo in the manifest is a real failure mode and it must
//      not be able to take the table down with it.
//   3. CONFIGURED AND VALID - the artwork actually swaps in, and the slot's albedoScale ceiling
//      is actually applied, so the rails stay subordinate to the gameplay elements they frame.
//
// States 2 and 3 are produced by intercepting js/skins.js in the browser and rewriting the one
// slot, never by editing the repo - the shipped manifest stays untouched and the test leaves no
// residue.
//
// It also pins the two invariants a future change could quietly break:
//   - the wall UV layout the artwork spec is written against (every face still a full
//     u[0,1]/v[0,1] square, so a v-only profile strip still maps cleanly onto all 42 of them);
//   - no skin asset URL literal anywhere outside js/skins.js.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/skin-integration.js
//   PORT=8971 node qa/skin-integration.js
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

// The slot under test. cabinetRails is the one that carries a real UV constraint AND a real
// brightness ceiling, so it is the slot worth exercising end to end; every other slot goes
// through the identical applySkinTexture() path.
const SLOT_PATH = 'cabinet/cabinet-rails.png';
const SLOT_URL_RE = /assets\/skins\/cabinet\/cabinet-rails\.png/;

let passed = 0, failed = 0;
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  OK   ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
  else { failed++; console.log('  FAIL ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
}

// --- minimal PNG writer, so state 3 can serve a REAL decodable image ------------------------
// Deliberately generated here rather than committed as a fixture: the point of state 3 is that
// a valid file loads, and a file this test builds itself cannot drift out of sync with the spec
// it is checking. Draws the same v-only rail profile the spec calls for (crown highlight at the
// top, body falloff, dark base band), so it doubles as a shape-conformance example.
function crcTable() {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
}
const CRC = crcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeRailStripPng(w, h) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    const v = y / h;
    // Same band boundaries createCabinetRailTexture() uses - see its comment.
    let k;
    if (v < 0.055) k = 1.00;
    else if (v < 0.13) k = 0.72;
    else if (v < 0.70) k = 0.62 - 0.20 * ((v - 0.13) / 0.57);
    else if (v < 0.86) k = 0.34;
    else k = 0.09;
    const r = Math.round(40 * k), g = Math.round(190 * k), b = Math.round(235 * k);
    const off = y * (w * 3 + 1);
    raw[off] = 0;
    for (let x = 0; x < w; x++) { raw[off + 1 + x * 3] = r; raw[off + 2 + x * 3] = g; raw[off + 3 + x * 3] = b; }
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8);
    b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

// --- minimal PNG reader, for measuring the rendered frame ------------------------------------
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
      if (filter === 0) v = cur;
      else if (filter === 1) v = cur + a;
      else if (filter === 2) v = cur + b;
      else if (filter === 3) v = cur + ((a + b) >> 1);
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
             v = cur + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)); }
      out[row + x] = v & 0xff;
    }
  }
  return { w, h, bpp, data: out };
}
// Median, not mean: a rail carries a narrow specular streak along its crown that a mean reads as
// "the whole wall is bright". The median is what the eye actually registers as the surface.
function medianAt(img, pts) {
  if (!pts || !pts.length) return null;
  const L = [];
  for (const [x, y] of pts) {
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
    const i = (y * img.w + x) * img.bpp;
    L.push(0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]);
  }
  if (!L.length) return null;
  L.sort((a, b) => a - b);
  return +L[Math.floor(L.length / 2)].toFixed(1);
}

// Rewrites the cabinetRails slot in the real js/skins.js on the way to the browser. Textual, on
// the genuine shipped source, so the test still runs the real module (and would fail loudly if
// the slot were renamed or restructured) rather than a hand-built stand-in.
async function routeManifest(page, newLiteral) {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'skins.js'), 'utf8');
  const re = /cabinetRails:\s*\{[^}]*\}/;
  if (!re.test(src)) throw new Error('cabinetRails slot not found in js/skins.js - QA needs updating');
  const patched = src.replace(re, newLiteral);
  await page.route('**/js/skins.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: patched }));
}

// Boots the game and reports the state of wallMat plus everything measured from the live scene.
async function boot(browser, { manifestLiteral, serveArtwork }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  const consoleErrors = [];
  const skinRequests = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  // Scoped to the slot under test, NOT to assets/skins/ generally: playfieldBackground is a
  // populated slot and legitimately fetches its artwork on every boot, so a blanket filter would
  // report that real, expected load as a violation of the unset-slot contract.
  page.on('request', (r) => { if (SLOT_URL_RE.test(r.url())) skinRequests.push(r.url()); });

  if (manifestLiteral) await routeManifest(page, manifestLiteral);
  if (serveArtwork === 'valid') {
    const png = makeRailStripPng(64, 512);
    await page.route(SLOT_URL_RE, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  } else if (serveArtwork === 'missing') {
    // A genuine 404, produced the way a bad deploy produces one.
    await page.route(SLOT_URL_RE, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  }

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2200);
  await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => {
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const mat = scene.getMaterialByName('wallMat');
    const tex = mat && mat.albedoTexture;
    const cam = scene.activeCamera, eng = scene.getEngine();
    const w = eng.getRenderWidth(), h = eng.getRenderHeight();
    const vp = cam.viewport.toGlobal(w, h), tm = scene.getTransformMatrix();
    const rect = (name) => {
      const m = scene.getMeshByName(name); if (!m) return null;
      const pts = m.getBoundingInfo().boundingBox.vectorsWorld
        .map((v) => BABYLON.Vector3.Project(v, BABYLON.Matrix.Identity(), tm, vp));
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      pts.forEach((q) => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
      return [x0, y0, x1, y1].map(Math.round);
    };
    // Every wall face still carrying the default full UV square is what the v-only artwork spec
    // depends on; a future faceUV/custom-unwrap change would land here first.
    const wallNames = ['topWall', 'leftWall', 'rightWall', 'leftSlant', 'rightSlant', 'leftGuide', 'rightGuide'];
    const uvSpans = [];
    let faceCount = 0;
    wallNames.forEach((n) => {
      const m = scene.getMeshByName(n); if (!m) return;
      const uv = m.getVerticesData(BABYLON.VertexBuffer.UVKind);
      for (let f = 0; f < 6; f++) {
        let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          u0 = Math.min(u0, uv[i * 2]); u1 = Math.max(u1, uv[i * 2]);
          v0 = Math.min(v0, uv[i * 2 + 1]); v1 = Math.max(v1, uv[i * 2 + 1]);
        }
        faceCount++;
        if (!(u0 === 0 && u1 === 1 && v0 === 0 && v1 === 1)) uvSpans.push({ mesh: n, face: f, u: [u0, u1], v: [v0, v1] });
      }
    });
    // Collider identity, so "no structural geometry or collider change" is measured, not claimed.
    const colliders = wallNames.map((n) => {
      const m = scene.getMeshByName(n);
      const bb = m.getBoundingInfo().boundingBox;
      return {
        name: n,
        ext: bb.extendSize.asArray().map((v) => +v.toFixed(6)),
        pos: m.absolutePosition.asArray().map((v) => +v.toFixed(6)),
        rotY: +m.rotation.y.toFixed(6),
        body: !!(m.physicsBody || (m.physicsImpostor))
      };
    });
    // Pixel sampling by PICK, not by projected bounding box. A wall's bounding box on screen is
    // mostly not wall: leftWall's box spans a third of the frame and swallows playfield, bumper
    // bloom and wherever the ball happens to be that run. Measured, that made the rails' median
    // move by ~3 luminance between two runs of the SAME build and flip the sign of the
    // fallback-vs-artwork comparison - i.e. the box was measuring the ball, not the rail. Picking
    // each candidate point and keeping only those whose frontmost surface really is the mesh in
    // question gives a number that belongs to the surface being asserted about.
    const sampleMesh = (names, budget) => {
      const wanted = new Set(names);
      const boxes = names.map(rect).filter(Boolean);
      if (!boxes.length) return [];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      boxes.forEach((r) => { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]); });
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
      const cols = Math.max(2, Math.round(Math.sqrt(budget * (x1 - x0) / Math.max(1, y1 - y0))));
      const rows = Math.max(2, Math.ceil(budget / cols));
      const pts = [];
      for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
        const px = Math.round(x0 + ((ix + 0.5) / cols) * (x1 - x0));
        const py = Math.round(y0 + ((iy + 0.5) / rows) * (y1 - y0));
        const hit = scene.pick(px, py);
        if (hit && hit.hit && hit.pickedMesh && wanted.has(hit.pickedMesh.name)) pts.push([px, py]);
      }
      return pts;
    };
    const samples = {
      rails: sampleMesh(['leftWall', 'rightWall', 'topWall', 'leftSlant', 'rightSlant', 'leftGuide', 'rightGuide'], 1400),
      bumper0: sampleMesh(['bumper0'], 400),
      bumper3: sampleMesh(['bumper3'], 400),
      // The lit target FACES, not the SlotGlow inlays behind them: the inlays are a few pixels
      // tall from this camera and sit behind the housing, so picking never lands on one (measured:
      // 0 verified points out of a 400-point budget).
      missionTargets: sampleMesh(['missionTarget0', 'missionTarget1', 'missionTarget2'], 400),
      flippers: sampleMesh(['leftFlipper', 'rightFlipper'], 600)
    };
    return {
      matName: mat && mat.name,
      sharedBy: scene.meshes.filter((m) => m.material === mat).map((m) => m.name),
      texName: tex ? tex.name : null,
      albedoColor: mat ? mat.albedoColor.asArray().map((v) => +v.toFixed(3)) : null,
      metallic: mat ? mat.metallic : null,
      roughness: mat ? mat.roughness : null,
      uvSpans, faceCount, colliders,
      dpr: window.devicePixelRatio,
      samples,
      inPlay: !!(window.__flipperDebug.isBallInPlay && window.__flipperDebug.isBallInPlay()),
      ballPos: window.__flipperDebug.mainBall
        ? window.__flipperDebug.mainBall.mesh.absolutePosition.asArray().map((v) => +v.toFixed(4)) : null
    };
  });

  await page.evaluate(() => { document.querySelectorAll('body > *:not(canvas)').forEach((e) => { e.style.visibility = 'hidden'; }); });
  await page.waitForTimeout(400);
  const shot = decodePng(await page.screenshot());
  await page.close();
  return { state, shot, pageErrors, consoleErrors, skinRequests };
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  // ---------------------------------------------------------------- state 1: shipped (unset)
  console.log('\n=== STATE 1: SLOT UNSET (the shipped default) ===');
  const a = await boot(browser, {});
  check('the game boots and the ball is in play', a.state.inPlay === true, { ballPos: a.state.ballPos });
  check('no uncaught page errors', a.pageErrors.length === 0, a.pageErrors);
  check('no console errors', a.consoleErrors.length === 0, a.consoleErrors);
  check('an unset slot issues NO network request for its asset', a.skinRequests.length === 0, a.skinRequests);
  check('wallMat renders the procedural profile', a.state.texName === 'cabinetRailTex', { tex: a.state.texName });
  check('wallMat is shared by all 7 boundary walls', a.state.sharedBy.length === 7, a.state.sharedBy);
  check('albedoColor is white (the procedural texture bakes the wall colour in)',
    JSON.stringify(a.state.albedoColor) === JSON.stringify([1, 1, 1]), a.state.albedoColor);

  console.log('\n=== UV LAYOUT THE ARTWORK SPEC IS WRITTEN AGAINST ===');
  check('all 42 wall faces carry the default full u[0,1]/v[0,1] square',
    a.state.uvSpans.length === 0 && a.state.faceCount === 42,
    { faces: a.state.faceCount, nonDefault: a.state.uvSpans });

  // ------------------------------------------------------- state 2: configured but missing file
  console.log('\n=== STATE 2: SLOT CONFIGURED, FILE MISSING (bad deploy / typo) ===');
  const b = await boot(browser, {
    manifestLiteral: `cabinetRails: { path: '${SLOT_PATH}', kind: 'albedo', albedoScale: 0.55 }`,
    serveArtwork: 'missing'
  });
  check('a failed texture load does NOT break boot - the ball is still in play', b.state.inPlay === true, { ballPos: b.state.ballPos });
  check('a failed texture load raises no uncaught page error', b.pageErrors.length === 0, b.pageErrors);
  check('the request was actually attempted (the test is exercising the failure path)',
    b.skinRequests.length === 1, b.skinRequests);
  check('wallMat falls back to the procedural profile, untouched', b.state.texName === 'cabinetRailTex', { tex: b.state.texName });
  check('a failed load does NOT apply the albedoScale ceiling (material left exactly as built)',
    JSON.stringify(b.state.albedoColor) === JSON.stringify([1, 1, 1]), b.state.albedoColor);
  check('the fallback keeps its physical response (metallic/roughness unchanged)',
    b.state.metallic === a.state.metallic && b.state.roughness === a.state.roughness,
    { metallic: b.state.metallic, roughness: b.state.roughness });

  // ------------------------------------------------------------ state 3: configured and valid
  console.log('\n=== STATE 3: SLOT CONFIGURED, ARTWORK VALID ===');
  const c = await boot(browser, {
    manifestLiteral: `cabinetRails: { path: '${SLOT_PATH}', kind: 'albedo', albedoScale: 0.55 }`,
    serveArtwork: 'valid'
  });
  check('the game boots and the ball is in play', c.state.inPlay === true, { ballPos: c.state.ballPos });
  check('no uncaught page errors', c.pageErrors.length === 0, c.pageErrors);
  check('the artwork actually replaced the procedural profile',
    c.state.texName !== null && c.state.texName !== 'cabinetRailTex', { tex: c.state.texName });
  check('the artwork loaded from exactly the manifest path',
    c.skinRequests.length === 1 && SLOT_URL_RE.test(c.skinRequests[0]), c.skinRequests);
  check('the slot albedoScale ceiling is applied to albedoColor',
    JSON.stringify(c.state.albedoColor) === JSON.stringify([0.55, 0.55, 0.55]), c.state.albedoColor);

  // ------------------------------------------------------------- rails vs gameplay brightness
  console.log('\n=== RAILS STAY DARKER THAN ACTIVE GAMEPLAY ELEMENTS ===');
  // Lamp-lit gameplay surfaces - the ones whose brightness is carried by the surface itself, so
  // sampling that surface is a fair reading of how bright they look.
  const PLAY_KEYS = ['bumper0', 'bumper3', 'missionTargets'];
  const railsOf = (r) => medianAt(r.shot, r.state.samples.rails);
  const playOf = (r) => {
    const each = Object.fromEntries(PLAY_KEYS.map((k) => [k, medianAt(r.shot, r.state.samples[k])]));
    const vals = Object.values(each).filter((v) => v !== null);
    return { min: Math.min(...vals), each };
  };
  const counts = (r) => Object.fromEntries(Object.entries(r.state.samples).map(([k, v]) => [k, v.length]));
  check('pick coordinates and screenshot pixels share a scale (devicePixelRatio 1)',
    a.state.dpr === 1 && a.shot.w === 1280, { dpr: a.state.dpr, shotWidth: a.shot.w });
  check('enough pick-verified rail pixels to take a median from',
    a.state.samples.rails.length >= 200 && c.state.samples.rails.length >= 200, counts(a));
  const railFallback = railsOf(a), railArt = railsOf(c);
  const playFallback = playOf(a), playArt = playOf(c);
  console.log('  sample counts ' + JSON.stringify(counts(a)));
  console.log('  fallback  rails=' + railFallback + '  lamp-lit=' + JSON.stringify(playFallback.each));
  console.log('  artwork   rails=' + railArt + '  lamp-lit=' + JSON.stringify(playArt.each));
  // The flippers are measured and PRINTED but deliberately not part of the min above, and that is
  // a real property of this board rather than a convenience. A flipper's brightness does not live
  // on the flipper: its glow blooms onto the surrounding lane geometry, so the bat's own pixels
  // read darker than the rails while the flipper AREA reads far brighter (board-graphics audit,
  // measured: the flipper meshes own 0.6% of the frame's top-1% brightest pixels at 1.04% screen
  // coverage, while the lane geometry the halo lands on owns 40.7%). Taking a min over the flipper
  // mesh would therefore assert against a number that does not describe what a player sees. It is
  // printed so the value stays visible rather than quietly dropped.
  console.log('  flipper mesh (not asserted, see comment): fallback=' + medianAt(a.shot, a.state.samples.flippers)
    + ' artwork=' + medianAt(c.shot, c.state.samples.flippers));
  check('fallback: rails sit below the dimmest lamp-lit gameplay element',
    railFallback < playFallback.min, { rails: railFallback, dimmest: playFallback.min });
  check('artwork: rails sit below the dimmest lamp-lit gameplay element',
    railArt < playArt.min, { rails: railArt, dimmest: playArt.min });
  // Tolerance, not equality. Even sampling only pick-verified rail pixels, the ball is somewhere
  // different in each of these two independent boots and its glow lands additively on whatever
  // rail it is passing. Measured across repeat runs of the same build, that drift is ~0.4
  // luminance (113.6 / 114.0), so 4 is an order of magnitude above the noise while still being
  // far tighter than the ~8 the albedoScale ceiling actually buys. This is the one assertion the
  // integration path itself is responsible for: whatever artwork lands here, it cannot arrive
  // brighter than the procedural profile it replaces.
  check('artwork does not brighten the rails vs the procedural fallback',
    railArt <= railFallback + 4, { fallback: railFallback, artwork: railArt, delta: +(railArt - railFallback).toFixed(1) });

  // ------------------------------------------------------- geometry / collider identity
  console.log('\n=== NO STRUCTURAL GEOMETRY OR COLLIDER CHANGE ===');
  check('every wall still carries a physics body', a.state.colliders.every((w) => w.body === true),
    a.state.colliders.filter((w) => !w.body).map((w) => w.name));
  check('wall extents/positions/rotations are identical across all three skin states',
    JSON.stringify(a.state.colliders) === JSON.stringify(b.state.colliders)
      && JSON.stringify(a.state.colliders) === JSON.stringify(c.state.colliders));

  // -------------------------------------------------------------------- source hygiene
  console.log('\n=== NO HARDCODED SKIN URL OUTSIDE js/skins.js ===');
  const scan = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'vendor' || e.name === 'archive') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|html)$/.test(e.name)) scan.push(full);
    }
  };
  walk(ROOT);
  // Comments are stripped first, and that distinction is the whole point of the check rather
  // than a convenience. babylon-game.js mentions assets/skins/<slot>.png in eight comments - each
  // one a cross-reference telling the next reader which file would populate the slot that call
  // site reads, which is documentation working as intended. What must not exist is an actual
  // path LITERAL that could be fetched: that is what would split asset routing across two files
  // and let the manifest silently stop being the single source of truth.
  const stripComments = (src) => {
    let out = '', i = 0, mode = 'code', quote = '';
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (mode === 'code') {
        if (c === '/' && n === '/') { mode = 'line'; i += 2; continue; }
        if (c === '/' && n === '*') { mode = 'block'; i += 2; continue; }
        if (c === '"' || c === "'" || c === '`') { mode = 'str'; quote = c; out += c; i++; continue; }
        out += c; i++; continue;
      }
      if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } i++; continue; }
      if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i += 2; } else i++; continue; }
      // in a string literal - copy through, honouring escapes so a \" cannot end it early
      if (c === '\\') { out += c + (n === undefined ? '' : n); i += 2; continue; }
      if (c === quote) { mode = 'code'; }
      out += c; i++;
    }
    return out;
  };
  const offenders = scan.filter((f) => {
    const rel = path.relative(ROOT, f);
    if (rel === path.join('js', 'skins.js')) return false;      // the one file allowed to name paths
    if (rel.startsWith('qa' + path.sep)) return false;          // QA fixtures, including this file
    return /assets\/skins\//.test(stripComments(fs.readFileSync(f, 'utf8')));
  }).map((f) => path.relative(ROOT, f));
  check('no source file outside js/skins.js contains an assets/skins/ path literal in CODE',
    offenders.length === 0, offenders);
  // A stripper that silently ate everything would make the check above pass vacuously.
  check('the comment stripper is actually working (it still finds the literal inside js/skins.js)',
    /assets\/skins\//.test(stripComments(fs.readFileSync(path.join(ROOT, 'js', 'skins.js'), 'utf8'))));

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
