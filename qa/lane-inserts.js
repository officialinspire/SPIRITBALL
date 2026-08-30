// SPIRITBALL lane-insert legibility guard.
//
// Two things this pass changed about the inserts, and both are the kind that decay silently:
//
//   1. SYMBOLIC IDENTITY. Each lane family now carries its own legend rather than sharing one.
//      Before, inlane and outlane drew the same down-arrow - two adjacent lanes meaning opposite
//      things (return the ball / lose the ball) with the same mark - and orbit drew the same
//      up-arrow as the skill shot. A future edit that points two families at one lens texture
//      would restore exactly that, invisibly, so the distinctness is asserted rather than assumed.
//
//   2. STATE CONTRAST. The reason lit-vs-unlit read so weakly was measured, not guessed: rendering
//      the inserts in isolation (only insert meshes, glow layer off) and then zeroing emissiveColor
//      showed 85-94% of an UNLIT insert's brightness was albedo response to the scene lights - a
//      constant the lamp system cannot touch. Lowering that floor is what put the lamp back in
//      charge. This file re-measures the dim->lit ratio the same way on every run, so an edit that
//      quietly re-raises the floor fails here instead of costing the board its state signal.
//
// It also pins the thing that must NOT have changed: triggers. The insert lenses are decorative
// meshes with no physics body at all, and every lane trigger's geometry still matches the config
// constants it is built from - which this pass did not touch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/lane-inserts.js
//   PORT=8971 node qa/lane-inserts.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const zlib = require('zlib');

const PORT = process.env.PORT || 8971;
const BASE = `http://localhost:${PORT}/index.html?dev=1`;
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

// One representative mesh per family, plus the skill shot - which used to share the orbit's arrow
// and is here to prove it no longer does.
const FAMILY = {
  inlane: 'inlaneLampleft',
  outlane: 'outlaneLampleft',
  orbit: 'orbitEntranceLampleft',
  reentry: 'reentryLane0',
  skillShot: 'skillShotLamp1'
};
const EXPECTED_LENS = {
  inlane: 'insertLensTexFlow',
  outlane: 'insertLensTexVoid',
  orbit: 'insertLensTexCycle',
  reentry: 'insertLensTexGround',
  skillShot: 'insertLensTexArrowUp'
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
const meanLum = (img, r) => {
  let s = 0, n = 0;
  for (let y = Math.max(0, r[1]); y < Math.min(img.h, r[3]); y++)
    for (let x = Math.max(0, r[0]); x < Math.min(img.w, r[2]); x++) {
      const i = (y * img.w + x) * img.bpp;
      s += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]; n++;
    }
  return n ? +(s / n).toFixed(1) : null;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  const skinRequests = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('request', (r) => { if (/assets\/skins\/lanes\//.test(r.url())) skinRequests.push(r.url()); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2500);

  const state = await page.evaluate(async (FAMILY) => {
    const cfg = await import('./js/config.js');
    const skins = await import('./js/skins.js');
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const fam = {};
    for (const k in FAMILY) {
      const m = scene.getMeshByName(FAMILY[k]);
      if (!m) { fam[k] = null; continue; }
      const mat = m.material;
      fam[k] = {
        mesh: m.name, matName: mat.name,
        lens: mat.emissiveTexture ? mat.emissiveTexture.name : null,
        albedo: mat.albedoColor ? mat.albedoColor.asArray().map((v) => +v.toFixed(4)) : null,
        emissive: mat.emissiveColor.asArray().map((v) => +v.toFixed(4)),
        roughness: mat.roughness,
        // A decorative lens must never be a physics object - that is what keeps it incapable of
        // affecting a trigger no matter how it is restyled.
        hasBody: !!m.physicsBody
      };
    }
    // Lane trigger geometry, compared against the config constants it is built from. This pass
    // did not touch js/config.js, so matching them is the check that triggers are untouched.
    const trig = (name) => {
      const m = scene.getMeshByName(name);
      if (!m) return null;
      const bb = m.getBoundingInfo().boundingBox;
      return { name, ext: bb.extendSize.asArray().map((v) => +v.toFixed(6)),
               pos: m.absolutePosition.asArray().map((v) => +v.toFixed(6)), hasBody: !!m.physicsBody };
    };
    return {
      fam,
      lensTextureNames: scene.textures.filter((t) => t.name && t.name.startsWith('insertLensTex')).map((t) => t.name).sort(),
      triggers: ['inlaneleft', 'outlaneleft', 'orbitEntranceleft', 'reentryLane0'].map(trig),
      consts: { laneW: cfg.LANE_TRIGGER_WIDTH_M, orbitW: cfg.ORBIT_TRIGGER_WIDTH_M,
                orbitD: cfg.ORBIT_TRIGGER_DEPTH_M, reentryR: cfg.REENTRY_LANE_RADIUS_M },
      slots: {
        inlane: skins.SKIN_MANIFEST.laneInsertInlane,
        outlane: skins.SKIN_MANIFEST.laneInsertOutlane,
        orbit: skins.SKIN_MANIFEST.laneInsertOrbit,
        reentry: skins.SKIN_MANIFEST.laneInsertReentry
      }
    };
  }, FAMILY);

  console.log('\n=== EACH FAMILY HAS ITS OWN SYMBOL ===');
  for (const k in EXPECTED_LENS) {
    check(`${k} uses ${EXPECTED_LENS[k]}`, state.fam[k] && state.fam[k].lens === EXPECTED_LENS[k],
      { got: state.fam[k] ? state.fam[k].lens : 'mesh missing' });
  }
  const lenses = Object.keys(EXPECTED_LENS).map((k) => state.fam[k] && state.fam[k].lens);
  check('no two families share a lens texture (the regression this pass exists to prevent)',
    new Set(lenses).size === lenses.length, lenses);
  check('all four family lens textures were actually built',
    ['insertLensTexFlow', 'insertLensTexVoid', 'insertLensTexCycle', 'insertLensTexGround']
      .every((n) => state.lensTextureNames.includes(n)), state.lensTextureNames);

  console.log('\n=== SKIN SLOTS (one per family, all four) ===');
  check('all four lane-insert slots exist and are emissive',
    ['inlane', 'outlane', 'orbit', 'reentry'].every((k) => state.slots[k] && state.slots[k].kind === 'emissive'),
    state.slots);
  check('every slot is still unset, so no request is issued', skinRequests.length === 0, skinRequests);

  console.log('\n=== TRIGGERS UNCHANGED ===');
  check('no insert lens carries a physics body (a lens cannot be a trigger)',
    Object.keys(FAMILY).filter((k) => k !== 'reentry').every((k) => state.fam[k] && state.fam[k].hasBody === false),
    Object.keys(FAMILY).map((k) => [k, state.fam[k] && state.fam[k].hasBody]));
  const t = Object.fromEntries(state.triggers.filter(Boolean).map((x) => [x.name, x]));
  check('the inlane trigger still matches LANE_TRIGGER_WIDTH_M',
    t.inlaneleft && Math.abs(t.inlaneleft.ext[0] * 2 - state.consts.laneW) < 1e-6,
    { ext: t.inlaneleft && t.inlaneleft.ext, laneW: state.consts.laneW });
  check('the orbit trigger still matches ORBIT_TRIGGER_WIDTH_M / _DEPTH_M',
    t.orbitEntranceleft && Math.abs(t.orbitEntranceleft.ext[0] * 2 - state.consts.orbitW) < 1e-6
      && Math.abs(t.orbitEntranceleft.ext[2] * 2 - state.consts.orbitD) < 1e-6,
    { ext: t.orbitEntranceleft && t.orbitEntranceleft.ext, w: state.consts.orbitW, d: state.consts.orbitD });
  check('the re-entry lane trigger still matches REENTRY_LANE_RADIUS_M and keeps its body',
    t.reentryLane0 && Math.abs(t.reentryLane0.ext[0] * 2 - state.consts.reentryR * 2) < 1e-6
      && t.reentryLane0.hasBody === true,
    { ext: t.reentryLane0 && t.reentryLane0.ext, radius: state.consts.reentryR });

  console.log('\n=== LIT vs UNLIT IS OBVIOUS ===');
  // Measured in isolation - only the insert meshes rendered, glow layer disposed - because in
  // situ the flipper bloom sits at ~200 luminance directly on the lower lane band and swamps any
  // reading taken there. That is a real limitation of the board, reported rather than hidden, but
  // it is not what this check is about: this is about whether the LAMP moves the INSERT.
  const rects = await page.evaluate((FAMILY) => {
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
    const names = Object.values(FAMILY);
    const out = {};
    for (const k in FAMILY) { const m = scene.getMeshByName(FAMILY[k]); if (m) out[k] = rect(m); }
    window.__base = {};
    names.forEach((n) => { const m = scene.getMeshByName(n); if (m) window.__base[n] = m.material.emissiveColor.scale(1 / 0.12); });
    const keep = new Set(names);
    scene.meshes.forEach((m) => { if (!keep.has(m.name)) m.setEnabled(false); });
    scene.effectLayers.slice().forEach((l) => l.dispose());
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
    return out;
  }, FAMILY);
  await page.evaluate(() => { document.querySelectorAll('body > *:not(canvas)').forEach((e) => { e.style.visibility = 'hidden'; }); });
  const drive = async (scale) => {
    await page.evaluate(({ FAMILY, scale }) => {
      const scene = BABYLON.EngineStore.LastCreatedScene;
      Object.values(FAMILY).forEach((n) => {
        const m = scene.getMeshByName(n);
        if (m) m.material.emissiveColor = window.__base[n].scale(scale);
      });
    }, { FAMILY, scale });
    await page.waitForTimeout(550);
    return decodePng(await page.screenshot());
  };
  const dimImg = await drive(0.12);   // LAMP_DIM_SCALE
  const litImg = await drive(0.9);    // LAMP_LIT_SCALE
  const ratios = {};
  for (const k in rects) {
    const d = meanLum(dimImg, rects[k]), l = meanLum(litImg, rects[k]);
    ratios[k] = { dim: d, lit: l, ratio: d ? +(l / d).toFixed(2) : null,
                  px: (rects[k][2] - rects[k][0]) + 'x' + (rects[k][3] - rects[k][1]) };
  }
  for (const k in ratios) console.log('  ' + k.padEnd(11) + JSON.stringify(ratios[k]));
  // The floor is set below the measured 1.55-1.75x with room for renderer noise, and well above
  // the 1.25-1.41x this pass started from - so a regression to the old albedo floor fails here.
  check('every family brightens at least 1.40x from dim to lit',
    Object.values(ratios).every((r) => r.ratio !== null && r.ratio >= 1.40),
    Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, v.ratio])));
  check('the lit state is brighter than the dim state everywhere (no inverted lamp)',
    Object.values(ratios).every((r) => r.lit > r.dim));

  check('no uncaught page errors', pageErrors.length === 0, pageErrors);
  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
