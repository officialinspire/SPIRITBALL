// SPIRITBALL bumper-cap skin guard.
//
// qa/skin-integration.js covers the generic skin path (unset / broken / valid) on the
// cabinetRails slot. This file covers what is specific to bumperCap, which is the slot where a
// texture sits closest to live gameplay: the cap is the visible face of a fixture that also has
// a collider, a kick, a score value, a cooldown and a hit animation. The whole claim being
// guarded is that artwork here touches the DECORATIVE CAP AND NOTHING ELSE, and that claim is
// worth measuring rather than reasoning about, because it is exactly the kind of thing a future
// refactor breaks silently.
//
// What it pins:
//   - the cap mesh carries no physics body, in every skin state (the collider is on the parent)
//   - bumper collider extents, positions, radii and physics bodies are byte-identical across
//     unset / broken-path / loaded-artwork
//   - a REAL hit still scores and still kicks: the ball is staged next to a bumper, physics is
//     allowed to run, and the score delta and post-hit ball speed are compared between the
//     unskinned build and the skinned one
//   - the hit animation still flashes bodyMat/lampMat and still does NOT touch the shared cap
//     material (which would flash all four caps at once)
//   - normal and boss bumpers stay visually distinguishable, measured under artwork chosen to be
//     as hostile to that distinction as possible
//
// The artwork used for the "valid" state is deliberately the worst case rather than a pretty
// one: flat, fully saturated, maximum brightness, identical on all four caps. If the boss still
// reads as the boss under that, it reads under anything an artist would actually ship.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/skin-bumper-cap.js
//   PORT=8971 node qa/skin-bumper-cap.js
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

const SLOT_PATH = 'bumpers/bumper-cap.png';
const SLOT_URL_RE = /assets\/skins\/bumpers\/bumper-cap\.png/;
const SLOT_LITERAL = `bumperCap: { path: '${SLOT_PATH}', kind: 'albedo', albedoScale: 0.55 }`;

let passed = 0, failed = 0;
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  OK   ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
  else { failed++; console.log('  FAIL ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
}

// --- PNG writer (hostile test artwork) ---------------------------------------------------------
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makePng(w, h, pixel) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    const off = y * (w * 3 + 1); raw[off] = 0;
    for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x / (w - 1), y / (h - 1)); raw[off + 1 + x * 3] = r; raw[off + 2 + x * 3] = g; raw[off + 3 + x * 3] = b; }
  }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8);
    b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
// Worst case on purpose: pure white, flat, no shading of its own. Nothing an artist would ship,
// which is the point - it is the upper bound on how loud this slot can get.
const HOSTILE_CAP_PNG = makePng(512, 512, () => [255, 255, 255]);

async function routeManifest(page) {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'skins.js'), 'utf8');
  const re = /bumperCap:\s*\{[^}]*\}/;
  if (!re.test(src)) throw new Error('bumperCap slot not found in js/skins.js - QA needs updating');
  const patched = src.replace(re, SLOT_LITERAL);
  await page.route('**/js/skins.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: patched }));
}

async function boot(browser, { skinned, artwork }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  if (skinned) await routeManifest(page);
  if (artwork === 'valid') await page.route(SLOT_URL_RE, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: HOSTILE_CAP_PNG }));
  else if (artwork === 'missing') await page.route(SLOT_URL_RE, (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2200);
  await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
  await page.waitForTimeout(2200);

  // ---- fixture identity + material state, read from the live scene -----------------------------
  const state = await page.evaluate(() => {
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const mat = scene.getMaterialByName('bumperCapMat');
    const bumpers = scene.meshes.filter((m) => m.metadata && m.metadata.kind === 'bumper');
    const fixture = (m) => {
      const bb = m.getBoundingInfo().boundingBox;
      const cap = m.metadata.capMesh;
      return {
        name: m.name, boss: !!m.metadata.boss,
        ext: bb.extendSize.asArray().map((v) => +v.toFixed(6)),
        pos: m.absolutePosition.asArray().map((v) => +v.toFixed(6)),
        hasBody: !!m.physicsBody,
        bodyMat: m.metadata.bodyMat ? m.metadata.bodyMat.name : null,
        lampMat: m.metadata.lampMat ? m.metadata.lampMat.name : null,
        capName: cap ? cap.name : null,
        capHasBody: cap ? !!cap.physicsBody : null,
        capScaling: cap ? cap.scaling.asArray().map((v) => +v.toFixed(6)) : null,
        capPos: cap ? cap.absolutePosition.asArray().map((v) => +v.toFixed(6)) : null,
        capExt: cap ? cap.getBoundingInfo().boundingBox.extendSize.asArray().map((v) => +v.toFixed(6)) : null,
        insertName: m.metadata.insertMesh ? m.metadata.insertMesh.name : null
      };
    };
    return {
      capMat: {
        name: mat && mat.name,
        tex: mat && mat.albedoTexture ? mat.albedoTexture.name : null,
        albedoColor: mat ? mat.albedoColor.asArray().map((v) => +v.toFixed(3)) : null,
        emissiveColor: mat ? mat.emissiveColor.asArray().map((v) => +v.toFixed(3)) : null,
        metallic: mat ? mat.metallic : null,
        roughness: mat ? mat.roughness : null,
        sharedBy: scene.meshes.filter((m) => m.material === mat).map((m) => m.name).sort()
      },
      fixtures: bumpers.map(fixture).sort((a, b) => a.name.localeCompare(b.name))
    };
  });

  // ---- live hit: score, kick and hit animation, all from ONE real contact -----------------
  // One staged hit rather than several, because a staged hit DRAINS THE BALL. Measured: the ball
  // is placed mid-table with velocity into a bumper, bounces off, and is out of play within ~300ms
  // (isBallInPlay() false, ball y at -6.2 shortly after). Every subsequent staged "hit" then scores
  // nothing and flashes nothing - correctly, since the hit handler ignores contacts when the ball
  // is not in play - which looks exactly like a broken animation but is the harness's fault. So
  // everything this suite needs from a contact is measured from the single contact that is real.
  //
  // Nothing here reaches into the scoring code: the score is read off the HUD the player sees, the
  // kick off the ball's own velocity, and the flash off the same material objects the game mutates.
  const hit = await page.evaluate(async (targetName) => {
    const dbg = window.__flipperDebug;
    const scene = dbg.scene;
    const bumper = scene.getMeshByName(targetName);
    const capMat = scene.getMaterialByName('bumperCapMat');
    const meta = bumper.metadata;
    const ball = dbg.mainBall;
    const body = ball.aggregate.body;
    const readScore = () => parseInt(document.getElementById('hud-score').textContent, 10) || 0;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const snap = (m) => (m && m.emissiveColor ? m.emissiveColor.asArray().map((v) => +v.toFixed(4)) : null);
    const lum = (a) => (a ? a[0] + a[1] + a[2] : 0);

    const before = { score: readScore(), body: snap(meta.bodyMat), lamp: snap(meta.lampMat), cap: snap(capMat) };
    const inPlayBefore = dbg.isBallInPlay();
    // Approach from below along +Z toward the bumper centre, at the bumper's own height.
    const from = bumper.absolutePosition.clone();
    from.z -= 0.075;
    from.y = ball.mesh.absolutePosition.y;
    ball.mesh.setAbsolutePosition(from);
    body.setLinearVelocity(new BABYLON.Vector3(0, 0, 1.15));
    body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));

    // No sleep before the first read. The ball is staged in contact, so the hit resolves on the
    // very first physics step - traced, both the score award and the 2.1x emissive flash land on
    // the t=0 sample, and pulseBumperLamp() has reverted by t=8ms.
    //
    // Only the FIRST award is compared between builds: the ball goes on bouncing through the
    // cluster and a bonus ramp keeps ticking, so a score delta over any wide window is a story
    // about where the ball ended up (measured 0 -> 2400 across one second, from several events).
    let firstAward = 0, peakSpeed = 0, minVz = Infinity;
    let peakBody = 0, peakLamp = 0, capChanged = false;
    for (let i = 0; i < 40; i++) {
      const v = body.getLinearVelocity();
      peakSpeed = Math.max(peakSpeed, Math.hypot(v.x, v.y, v.z));
      minVz = Math.min(minVz, v.z);
      if (!firstAward && readScore() > before.score) firstAward = readScore() - before.score;
      peakBody = Math.max(peakBody, lum(snap(meta.bodyMat)));
      peakLamp = Math.max(peakLamp, lum(snap(meta.lampMat)));
      if (JSON.stringify(snap(capMat)) !== JSON.stringify(before.cap)) capChanged = true;
      await sleep(8);
    }
    return {
      inPlayBefore, scoreBefore: before.score, firstAward, scoreAfter: readScore(),
      peakSpeed: +peakSpeed.toFixed(4), minVz: +minVz.toFixed(4),
      bodyLift: +(peakBody / lum(before.body)).toFixed(2),
      lampLift: +(peakLamp / lum(before.lamp)).toFixed(2),
      capChanged,
      restored: JSON.stringify(snap(meta.bodyMat)) === JSON.stringify(before.body),
      capAfter: snap(capMat), bodyBefore: before.body, bodyAfter: snap(meta.bodyMat)
    };
  }, 'bumper1');

  // ---- boss vs normal: are the cues still there, and how strong? -------------------------------
  const cues = await page.evaluate(() => {
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
    // How many of a mesh's own projected pixels is it the frontmost surface at - i.e. how much of
    // it a player can actually see, rather than how big its bounding box is.
    const visiblePixels = (m) => {
      const r = rect(m); let own = 0, tested = 0;
      for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        tested++;
        const p = scene.pick(x, y);
        if (p && p.hit && p.pickedMesh === m) own++;
      }
      return { rect: r, own, tested };
    };
    const bumpers = scene.meshes.filter((m) => m.metadata && m.metadata.kind === 'bumper');
    const out = { fixtures: {}, trim: null };
    bumpers.forEach((m) => {
      const r = rect(m);
      out.fixtures[m.name] = {
        boss: !!m.metadata.boss,
        screen: [r[2] - r[0], r[3] - r[1]],
        glyph: m.metadata.insertMesh ? visiblePixels(m.metadata.insertMesh) : null,
        glyphName: m.metadata.insertMesh ? m.metadata.insertMesh.name : null
      };
    });
    const trim = scene.getMeshByName('bumper0Trim');
    if (trim) out.trim = visiblePixels(trim);
    return out;
  });

  await page.close();
  return { state, hit, cues, pageErrors };
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n=== FALLBACK (slot unset - the shipped state) ===');
  const base = await boot(browser, { skinned: false });
  check('the procedural cap texture is what renders', base.state.capMat.tex === 'bumperCapTex', { tex: base.state.capMat.tex });
  check('the cap material is shared by exactly the 4 caps',
    base.state.capMat.sharedBy.length === 4 && base.state.capMat.sharedBy.every((n) => /^bumper\dCap$/.test(n)),
    base.state.capMat.sharedBy);
  check('the tuned cap albedo is intact (0.54/0.54/0.58, the hierarchy pass value)',
    JSON.stringify(base.state.capMat.albedoColor) === JSON.stringify([0.54, 0.54, 0.58]), base.state.capMat.albedoColor);
  check('no uncaught page errors', base.pageErrors.length === 0, base.pageErrors);

  console.log('\n=== ARTWORK AFFECTS THE DECORATIVE CAP ONLY ===');
  check('no cap mesh carries a physics body (the collider is on the parent fixture)',
    base.state.fixtures.every((f) => f.capHasBody === false), base.state.fixtures.map((f) => [f.capName, f.capHasBody]));
  check('every bumper fixture does carry a physics body',
    base.state.fixtures.every((f) => f.hasBody === true), base.state.fixtures.map((f) => [f.name, f.hasBody]));

  console.log('\n=== BROKEN PATH (configured, file missing) ===');
  const broken = await boot(browser, { skinned: true, artwork: 'missing' });
  check('a failed cap-texture load does not break boot', broken.pageErrors.length === 0, broken.pageErrors);
  check('the procedural cap is still what renders', broken.state.capMat.tex === 'bumperCapTex', { tex: broken.state.capMat.tex });
  check('the tuned cap albedo is untouched by a failed load',
    JSON.stringify(broken.state.capMat.albedoColor) === JSON.stringify([0.54, 0.54, 0.58]), broken.state.capMat.albedoColor);

  console.log('\n=== HOSTILE ARTWORK (flat pure white, worst case) ===');
  const art = await boot(browser, { skinned: true, artwork: 'valid' });
  check('no uncaught page errors', art.pageErrors.length === 0, art.pageErrors);
  check('the artwork replaced the procedural cap texture',
    art.state.capMat.tex && art.state.capMat.tex !== 'bumperCapTex', { tex: art.state.capMat.tex });
  check('the albedoScale ceiling was applied instead of a plain white reset',
    JSON.stringify(art.state.capMat.albedoColor) === JSON.stringify([0.55, 0.55, 0.55]), art.state.capMat.albedoColor);
  check('the ceiling keeps a skinned cap within 0.02 of the tuned fallback albedo (not 1.85x it)',
    Math.abs(art.state.capMat.albedoColor[0] - base.state.capMat.albedoColor[0]) <= 0.02,
    { fallback: base.state.capMat.albedoColor[0], skinned: art.state.capMat.albedoColor[0] });
  check('the cap keeps its plastic shading response (metallic/roughness/emissive unchanged)',
    art.state.capMat.metallic === base.state.capMat.metallic
      && art.state.capMat.roughness === base.state.capMat.roughness
      && JSON.stringify(art.state.capMat.emissiveColor) === JSON.stringify(base.state.capMat.emissiveColor),
    { metallic: art.state.capMat.metallic, roughness: art.state.capMat.roughness, emissive: art.state.capMat.emissiveColor });

  console.log('\n=== COLLIDER / SIZE PRESERVED ACROSS ALL THREE STATES ===');
  const geo = (r) => r.state.fixtures.map((f) => ({ name: f.name, boss: f.boss, ext: f.ext, pos: f.pos, hasBody: f.hasBody }));
  check('bumper extents, positions and physics bodies are identical fallback vs artwork',
    JSON.stringify(geo(base)) === JSON.stringify(geo(art)));
  check('bumper extents, positions and physics bodies are identical fallback vs broken-path',
    JSON.stringify(geo(base)) === JSON.stringify(geo(broken)));
  const capGeo = (r) => r.state.fixtures.map((f) => [f.capName, f.capScaling, f.capExt, f.capPos]);
  check('cap mesh scaling, extents and positions are identical fallback vs artwork',
    JSON.stringify(capGeo(base)) === JSON.stringify(capGeo(art)));

  console.log('\n=== SCORING AND KICK PRESERVED (live hit, physics allowed to run) ===');
  console.log('  fallback hit: ' + JSON.stringify(base.hit));
  console.log('  artwork  hit: ' + JSON.stringify(art.hit));
  check('the ball was in play when the hit was staged (the probe is exercising a real contact)',
    base.hit.inPlayBefore === true && art.hit.inPlayBefore === true,
    { fallback: base.hit.inPlayBefore, artwork: art.hit.inPlayBefore });
  check('the staged hit actually scored in the unskinned build (the test is exercising a real hit)',
    base.hit.scoreAfter > base.hit.scoreBefore, base.hit);
  check('the staged hit still scores with artwork loaded',
    art.hit.scoreAfter > art.hit.scoreBefore, art.hit);
  check('the score awarded for the hit is the same with and without artwork',
    art.hit.firstAward === base.hit.firstAward && base.hit.firstAward > 0,
    { fallback: base.hit.firstAward, artwork: art.hit.firstAward });
  // "Kicked" means sent BACK the way it came. The ball is staged moving +Z into the bumper, so a
  // negative z velocity is the bumper actively throwing it away rather than the ball dribbling
  // past. Traced, the approach speed itself is never observable - the ball is staged in contact
  // and the hit resolves on the first physics step - so an absolute speed threshold taken from the
  // approach would be asserting against a value that never appears.
  check('the bumper still throws the ball back the way it came (unskinned)',
    base.hit.minVz < 0, { minVz: base.hit.minVz, approachVz: 1.15 });
  check('the bumper still throws the ball back the way it came (artwork)',
    art.hit.minVz < 0, { minVz: art.hit.minVz });
  // Tolerance, not equality: Havok is deterministic per step but the ball is staged from a live
  // scene, so the contact point differs slightly between two independent boots. The assertion is
  // that the kick TIER is unchanged, not that the float matches.
  check('the kick magnitude is unchanged with artwork loaded (within 12%)',
    Math.abs(art.hit.peakSpeed - base.hit.peakSpeed) / base.hit.peakSpeed <= 0.12,
    { fallback: base.hit.peakSpeed, artwork: art.hit.peakSpeed });

  console.log('\n=== HIT ANIMATION PRESERVED ===');
  console.log('  emissive lift: fallback body ' + base.hit.bodyLift + 'x lamp ' + base.hit.lampLift
    + 'x | artwork body ' + art.hit.bodyLift + 'x lamp ' + art.hit.lampLift + 'x  (pulseBumperLamp scales 2.1x)');
  check('the hit still lifts the bumper body emissive ~2.1x',
    base.hit.bodyLift >= 2.0 && art.hit.bodyLift >= 2.0, { fallback: base.hit.bodyLift, artwork: art.hit.bodyLift });
  check('the hit still lifts the lamp-ring emissive ~2.1x',
    base.hit.lampLift >= 2.0 && art.hit.lampLift >= 2.0, { fallback: base.hit.lampLift, artwork: art.hit.lampLift });
  check('the lift is the same magnitude with and without artwork',
    Math.abs(base.hit.bodyLift - art.hit.bodyLift) < 0.05 && Math.abs(base.hit.lampLift - art.hit.lampLift) < 0.05,
    { fallbackBody: base.hit.bodyLift, artworkBody: art.hit.bodyLift });
  // The shared cap material must stay out of the flash in BOTH states - touching it would light
  // all four caps on any one bumper's hit, which is the specific bug the exclusion exists for.
  check('the hit never touches the shared cap material (fallback)', base.hit.capChanged === false, base.hit.capAfter);
  check('the hit never touches the shared cap material (artwork)', art.hit.capChanged === false, art.hit.capAfter);
  check('the body emissive returns to its resting value after the flash',
    base.hit.restored === true && art.hit.restored === true,
    { before: base.hit.bodyBefore, after: base.hit.bodyAfter });

  console.log('\n=== BOSS AND NORMAL BUMPERS STAY DISTINGUISHABLE ===');
  const report = (label, c) => {
    const boss = Object.entries(c.fixtures).find(([, f]) => f.boss);
    const norms = Object.entries(c.fixtures).filter(([, f]) => !f.boss);
    console.log('  ' + label + ' boss=' + boss[0] + ' ' + boss[1].screen.join('x') + 'px glyph=' + boss[1].glyphName
      + ' visible=' + boss[1].glyph.own + 'px | normals ' + norms.map(([n, f]) => n + ' ' + f.screen.join('x')).join(', ')
      + ' | gold trim visible=' + (c.trim ? c.trim.own : 0) + 'px');
    return { boss: boss[1], norms: norms.map(([, f]) => f) };
  };
  const cb = report('fallback', base.cues);
  const ca = report('artwork ', art.cues);
  const areaOf = (f) => f.screen[0] * f.screen[1];
  for (const [label, c] of [['fallback', cb], ['artwork', ca]]) {
    const biggestNormal = Math.max(...c.norms.map(areaOf));
    check(label + ': exactly one bumper is flagged as the boss',
      Object.values((label === 'fallback' ? base : art).cues.fixtures).filter((f) => f.boss).length === 1);
    // Cue 1 - size. Independent of any texture, and the strongest of the three.
    check(label + ': the boss is visibly larger than every normal bumper (>=25% more screen area)',
      areaOf(c.boss) >= biggestNormal * 1.25,
      { bossArea: areaOf(c.boss), largestNormalArea: biggestNormal, ratio: +(areaOf(c.boss) / biggestNormal).toFixed(2) });
    // Cue 2 - the boss-only gold trim, which no normal bumper has at all.
    check(label + ': the boss-only gold trim is actually on screen',
      (label === 'fallback' ? base : art).cues.trim.own >= 80,
      { visiblePixels: (label === 'fallback' ? base : art).cues.trim.own });
    // Cue 3 - a different glyph, on its own mesh, still readable rather than swallowed by the cap.
    check(label + ": the boss's star glyph is still visible (not swallowed by the cap)",
      c.boss.glyph.own >= 80, { glyph: c.boss.glyphName, visiblePixels: c.boss.glyph.own });
    check(label + ': the boss glyph differs from the normal glyph',
      c.boss.glyphName !== c.norms[0].glyphName, { boss: c.boss.glyphName, normal: c.norms[0].glyphName });
  }
  // The cues must not merely exist in both states - they must not be WEAKENED by the artwork.
  check('hostile artwork does not shrink the boss size advantage',
    (areaOf(ca.boss) / Math.max(...ca.norms.map(areaOf))) >= (areaOf(cb.boss) / Math.max(...cb.norms.map(areaOf))) - 0.02,
    { fallback: +(areaOf(cb.boss) / Math.max(...cb.norms.map(areaOf))).toFixed(2),
      artwork: +(areaOf(ca.boss) / Math.max(...ca.norms.map(areaOf))).toFixed(2) });
  check('hostile artwork does not hide the boss glyph (within 15% of the fallback)',
    ca.boss.glyph.own >= cb.boss.glyph.own * 0.85,
    { fallback: cb.boss.glyph.own, artwork: ca.boss.glyph.own });
  check('hostile artwork does not hide the gold trim (within 15% of the fallback)',
    art.cues.trim.own >= base.cues.trim.own * 0.85,
    { fallback: base.cues.trim.own, artwork: art.cues.trim.own });

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
