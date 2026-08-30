// SPIRITBALL visual-hierarchy guard, measured from the real gameplay camera.
//
// Pins the one ordering the table has to keep: the ball and the flippers are gameplay, the named
// shot callouts painted next to them are decoration, and decoration must not outshine gameplay.
//
// HOW IT MEASURES, and why it is done the hard way. For each element it projects a grid of points
// across the mesh, keeps only the points where a scene pick confirms THAT mesh is the front-most
// thing at that pixel, and reads the rendered luminance there. A projected bounding box is not
// good enough - it mostly contains pixels belonging to something else, which is how an earlier
// pass in this repo ended up measuring the ball while trying to measure an insert.
//
// WHAT IS AND IS NOT TRUSTWORTHY HERE. Measured across three runs on identical code, static
// scenery (labels, bumpers, flippers, playfield) is stable to +/-0-3%; the BALL swings +/-2-14%,
// because it is small and round and its surviving sample set shifts. So the ball is sampled at
// eight playfield positions and compared on its MEDIAN, and the thresholds below leave room for
// that. Transparent meshes are deliberately not asserted on at all: a pick only tells you which
// mesh owns a pixel, not that the pixel is that mesh's own colour, so a 22%-alpha floor decal
// reads as whatever is glowing behind it.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/visual-hierarchy.js
//   PORT=8971 node qa/visual-hierarchy.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), zlib = require('zlib');
const OUT = process.env.OUT || require('os').tmpdir();
const PORT = process.env.PORT || 8971;
const TAG = 'qa';

// Shot callouts = pure decoration. Bumper inserts (labelPlane★ / labelPlane◉) are gameplay markers
// on the bumpers and are NOT in this list.
// The split follows createLabelPlane()'s own discriminator, not a guess: a label that draws itself
// a background chip is a named callout (decoration that names a shot and carries no state); every
// chipless user is a gameplay marker sitting on its own lamp. The inlane/outlane flow arrows are
// therefore GAMEPLAY, not decoration - an earlier version of this file had them in the decor list
// and duly reported the game for not dimming them.
const DECOR_LABELS = ['labelPlaneLORBIT','labelPlaneRORBIT','labelPlaneVISIONGATE','labelPlaneTARGETS',
                      'labelPlaneSKILLSHOT','labelPlaneKICKBACK'];
const GAMEPLAY_LABELS = ['labelPlane★','labelPlane◉','labelPlane▲','labelPlane▼'];

function decodePng(file) {
  const buf = fs.readFileSync(file); let p = 8, w = 0, h = 0, ct = 0, idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8);
    if (t === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); ct = buf[p + 17]; }
    else if (t === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len)); else if (t === 'IEND') break; p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), ch = ct === 6 ? 4 : ct === 2 ? 3 : 1, stride = w * ch;
  const rows = []; let off = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) { const ft = raw[off++]; const line = Buffer.from(raw.slice(off, off + stride)); off += stride;
    for (let i = 0; i < stride; i++) { const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[i] = v & 255; }
    rows.push(line); prev = line; }
  return { w, h, ch, rows, lum(x, y) { if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const r = rows[y][x * ch], g = rows[y][x * ch + 1] ?? r, b = rows[y][x * ch + 2] ?? r;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; } };
}
const stat = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y);
  return { n: a.length, p50: +s[Math.floor(s.length/2)].toFixed(1), p90: +s[Math.floor(s.length*0.9)].toFixed(1), max: +s[s.length-1].toFixed(1) }; };

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.BABYLON && !!BABYLON.EngineStore.LastCreatedScene, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.mouse.click(640, 400); await page.waitForTimeout(2600);
  await page.keyboard.down('Space'); await page.waitForTimeout(240); await page.keyboard.up('Space');
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    const s = BABYLON.EngineStore.LastCreatedScene, ball = s.getMeshByName('ball');
    const body = ball.physicsBody || (ball.getPhysicsBody && ball.getPhysicsBody());
    if (body) { body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED); body.setLinearVelocity(BABYLON.Vector3.Zero()); }
  });

  // (a) The ball at eight representative positions across the reachable playfield.
  const spots = [[0,-0.20],[0,-0.05],[0,0.10],[0,0.25],[-0.12,0.00],[0.12,0.00],[-0.12,0.20],[0.12,0.20]];
  const ballReads = [];
  for (const [x, z] of spots) {
    const pt = await page.evaluate(({ x, z }) => {
      const s = BABYLON.EngineStore.LastCreatedScene, e = s.getEngine(), ball = s.getMeshByName('ball');
      ball.position.set(x, 0.0135, z); ball.computeWorldMatrix(true);
      const vp = s.activeCamera.viewport.toGlobal(e.getRenderWidth(), e.getRenderHeight());
      const bb = ball.getBoundingInfo().boundingBox, lo = bb.minimumWorld, hi = bb.maximumWorld;
      const pts = [];
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 4; k++) {
        const wp = new BABYLON.Vector3(lo.x+(hi.x-lo.x)*i/4, lo.y+(hi.y-lo.y)*j/4, lo.z+(hi.z-lo.z)*k/4);
        const v = BABYLON.Vector3.Project(wp, BABYLON.Matrix.Identity(), s.getTransformMatrix(), vp);
        const px = Math.round(v.x), py = Math.round(v.y);
        if (px < 1 || py < 1 || px >= e.getRenderWidth()-1 || py >= e.getRenderHeight()-1) continue;
        const pick = s.pick(px, py, (m) => m.isVisible && m.isPickable !== false);
        if (pick && pick.hit && pick.pickedMesh === ball) pts.push([px, py]);
      }
      return pts;
    }, { x, z });
    await page.waitForTimeout(900);
    const f = `${OUT}/hb-${TAG}-${x}_${z}.png`;
    await page.screenshot({ path: f });
    const img = decodePng(f);
    const seen = new Set(), lums = [];
    for (const [px, py] of pt) { const k = px+','+py; if (seen.has(k)) continue; seen.add(k);
      const l = img.lum(px, py); if (l !== null) lums.push(l); }
    ballReads.push({ pos: `${x},${z}`, ...stat(lums) });
    fs.unlinkSync(f);
  }
  console.log('=== BALL luminance across the playfield ===');
  ballReads.forEach((r) => console.log(`  at ${r.pos.padEnd(12)} n=${String(r.n).padStart(3)}  p50=${String(r.p50).padStart(6)} p90=${String(r.p90).padStart(6)} max=${String(r.max).padStart(6)}`));
  const allP90 = ballReads.filter((r)=>r.n>=4).map((r) => r.p90);
  console.log(`  -> ball p90 range ${Math.min(...allP90)} .. ${Math.max(...allP90)}  (median ${allP90.sort((a,b)=>a-b)[Math.floor(allP90.length/2)]})`);

  // (b) Decorative callouts vs the gameplay elements they must not outrank.
  await page.evaluate(() => { const s = BABYLON.EngineStore.LastCreatedScene;
    const ball = s.getMeshByName('ball'); ball.position.set(0.02, 0.0135, 0.02); ball.computeWorldMatrix(true); });
  await page.waitForTimeout(1000);
  const shot = `${OUT}/hier2-${TAG}.png`;
  await page.screenshot({ path: shot });
  const img = decodePng(shot);
  const groups = await page.evaluate(({ DECOR_LABELS, GAMEPLAY_LABELS }) => {
    const s = BABYLON.EngineStore.LastCreatedScene, e = s.getEngine();
    const vp = s.activeCamera.viewport.toGlobal(e.getRenderWidth(), e.getRenderHeight());
    const want = (m) => {
      if (DECOR_LABELS.includes(m.name)) return 'DECOR callout';
      if (GAMEPLAY_LABELS.includes(m.name)) return 'bumper insert (gameplay)';
      if (m.name === 'ball') return 'BALL';
      if (/^(left|right)Flipper$/.test(m.name)) return 'flipper';
      if (/^bumper\d$/.test(m.name)) return 'bumper body';
      if (/^saturnFloorGlow$|FloorGlow$/.test(m.name)) return 'floor glow (decor)';
      if (/^playfield$/.test(m.name)) return 'playfield art';
      if (/^skybox$|^nearSky$/.test(m.name)) return 'starfield';
      return null;
    };
    const out = [];
    for (const m of s.meshes) {
      if (!m.isEnabled() || !m.isVisible) continue;
      const g = want(m); if (!g) continue;
      const bb = m.getBoundingInfo().boundingBox, lo = bb.minimumWorld, hi = bb.maximumWorld;
      const pts = [];
      for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5; j++) for (let k = 0; k <= 5; k++) {
        const wp = new BABYLON.Vector3(lo.x+(hi.x-lo.x)*i/5, lo.y+(hi.y-lo.y)*j/5, lo.z+(hi.z-lo.z)*k/5);
        const v = BABYLON.Vector3.Project(wp, BABYLON.Matrix.Identity(), s.getTransformMatrix(), vp);
        const px = Math.round(v.x), py = Math.round(v.y);
        if (px < 1 || py < 1 || px >= e.getRenderWidth()-1 || py >= e.getRenderHeight()-1) continue;
        const pick = s.pick(px, py, (mm) => mm.isVisible && mm.isPickable !== false);
        if (pick && pick.hit && pick.pickedMesh === m) pts.push([px, py]);
      }
      if (pts.length) out.push({ group: g, name: m.name, pts });
    }
    return out;
  }, { DECOR_LABELS, GAMEPLAY_LABELS });

  const rows = groups.map((g) => {
    const seen = new Set(), lums = [];
    for (const [x, y] of g.pts) { const k = x+','+y; if (seen.has(k)) continue; seen.add(k);
      const l = img.lum(x, y); if (l !== null) lums.push(l); }
    return { ...stat(lums), group: g.group, name: g.name };
  }).filter((r) => r && r.n >= 3);
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  const ballP90 = ballReads.filter((r) => r.n >= 4).map((r) => r.p90).sort((a, b) => a - b);
  const ballMedian = ballP90[Math.floor(ballP90.length / 2)];
  const flippers = ['leftFlipper', 'rightFlipper'].map((n) => by[n]).filter(Boolean);
  const flipperP90 = Math.max(...flippers.map((f) => f.p90));
  const callouts = rows.filter((r) => r.group === 'DECOR callout' && DECOR_LABELS.includes(r.name));

  console.log('\n=== MEASURED ===');
  console.log(`  ball p90 across ${ballP90.length} positions: ${ballP90.join(', ')}  -> median ${ballMedian}`);
  console.log(`  flippers p90: ${flippers.map((f) => f.name + '=' + f.p90).join('  ')}`);
  rows.sort((a, b) => b.p90 - a.p90).forEach((r) =>
    console.log(`  p90=${String(r.p90).padStart(6)} p50=${String(r.p50).padStart(6)} n=${String(r.n).padStart(4)}  ${r.group.padEnd(24)} ${r.name}`));

  let pass = 0, fail = 0;
  const check = (l, ok, d) => { ok ? pass++ : fail++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${l}`, d === undefined ? '' : JSON.stringify(d)); };

  console.log('\n=== HIERARCHY ===');
  check('the ball was measurable at most playfield positions', ballP90.length >= 6, { positions: ballP90.length });

  // The headline invariant. Signage is tier 7; the flippers are tier 3. Before this was pinned,
  // 'L ORBIT' rendered at p90 195 against flippers at 126 - decoration 55% above the hardware.
  // 3% tolerance: that is the measured run-to-run spread on static scenery, so parity reads as
  // parity rather than as a failure. 'L ORBIT' sits right at the flippers now; before the signage
  // was dimmed it was at 195 against 126, i.e. 55% above them.
  const overFlippers = callouts.filter((c) => c.p90 > flipperP90 * 1.03);
  check('no named shot callout outshines the flippers', overFlippers.length === 0,
    { flipperP90, threshold: +(flipperP90 * 1.03).toFixed(1), over: overFlippers.map((c) => c.name + '=' + c.p90) });

  // Deliberately NOT an absolute threshold against the ball. The ball is lit BY the table, so its
  // rendered luminance is position-dependent by design - p90 47 over the dark mid-left, 242 under
  // the bumper lamps. An absolute gate against its median would be measuring where the lights are,
  // not the hierarchy, and would demand decoration be dimmer than the flippers already are. The
  // flippers above are the stable tier-3 reference; this is the tier-4 one.
  const inserts = rows.filter((r) => /^labelPlane[\u2605\u25c9]$/.test(r.name));
  const dimmestInsert = inserts.length ? Math.min(...inserts.map((i) => i.p90)) : Infinity;
  const overInsert = callouts.filter((c) => c.p90 > dimmestInsert * 1.03);
  check('no named shot callout outshines the bumper inserts', overInsert.length === 0,
    { dimmestInsert, over: overInsert.map((c) => c.name + '=' + c.p90) });

  // The dimming must have hit signage ONLY. These four reuse createLabelPlane() but are gameplay
  // markers sitting on their own lamps, and they are supposed to stay at full strength - so at
  // least one of them should still be brighter than the brightest callout.
  const markers = rows.filter((r) => GAMEPLAY_LABELS.includes(r.name));
  const brightestCallout = Math.max(...callouts.map((c) => c.p90));
  check('gameplay markers were not dimmed along with the signage',
    markers.length > 0 && Math.max(...markers.map((m) => m.p90)) > brightestCallout,
    { markers: markers.map((m) => m.name + '=' + m.p90), brightestCallout });

  // Tier 8 is last, by a wide margin, and must stay there.
  const sky = by.skybox;
  check('the starfield stays the dimmest thing on screen',
    !!sky && sky.p90 < ballMedian * 0.5 && sky.p90 < flipperP90 * 0.5,
    { skybox: sky && sky.p90, ballMedian, flipperP90 });

  console.log(`\n=== SUMMARY ===\nTOTAL: ${pass} passed, ${fail} failed`);
  fs.writeFileSync(`${OUT}/visual-hierarchy.json`, JSON.stringify({ ballReads, rows }, null, 1));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
