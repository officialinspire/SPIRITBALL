// SPIRITBALL ATTRACT CAMERA suite.
//
// The title screen's camera has to satisfy several requirements at once that pull against each
// other, and every one of them is easy to break silently by nudging a single number in the shot
// list. This file pins all of them.
//
// WHAT IT REPLACED. The original attract camera was one line - `camera.alpha += dt * 0.00015` -
// an unbounded 360-degree orbit at 0.15 rad/s. It swung behind the backglass for roughly a third
// of every revolution (the table stopped reading as a pinball machine entirely), it never rested,
// and it showcased nothing because it held a constant radius the whole way round.
//
// WHAT IS ASSERTED, and why each one earned a place here:
//   - The whole machine stays in frame, at every held framing, at every viewport. The framing
//     solver derives the radius per viewport rather than hardcoding it, because a fixed radius
//     provably cannot work: Babylon's FOVMODE_VERTICAL_FIXED narrows the horizontal field as the
//     aspect does, and the closest radius that fits was measured at 1.09 on desktop versus 2.11
//     on a phone in portrait for the same framing.
//   - The machine clears the marquee. The BACKGLASS is what makes this non-trivial - it stands
//     0.28m above the far end of the table and so projects higher than any point on the
//     playfield. Fitting the table alone let the panel's own RANK/MISSION text drift up behind
//     "DMT VISION QUEST PINBALL".
//   - The flippers are not hidden behind the CTA during the beat that exists to show them.
//   - The camera stays in the front hemisphere, so it never ends up behind the backglass.
//   - Peak angular rate stays well under the old constant spin, and the camera genuinely rests at
//     each framing rather than creeping through it. This is the motion-comfort requirement, and
//     it is the one most likely to be broken by "just widening the shots a bit" later.
//   - prefers-reduced-motion holds one fixed framing and never moves.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/attract-camera.js
//   PORT=8971 node qa/attract-camera.js     (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8971;
const BASE = `http://localhost:${PORT}/index.html?dev=1`;
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

// Timing and shot names are read from the page (window.__flipperDebug.attract) rather than
// restated here, so this file cannot silently drift out of step with the shot list.
// The orbit this replaced ran at a constant 0.15 rad/s with no rest. Staying meaningfully under
// that, in brief eased bursts between holds, is the comfort budget.
const MAX_ANGULAR_RATE = 0.12;
const VIEWPORTS = [[1280, 900], [1024, 700], [1440, 820], [390, 844], [320, 568]];

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond, detail });
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
}

const PROBE = () => {
  const dbg = window.__flipperDebug, scene = dbg.scene;
  const A = dbg.attract;
  const DWELL_MS = A.dwellMs, SPAN_MS = A.dwellMs + A.moveMs, SHOTS = A.shotNames.length;
  const cam = A.camera;
  const engine = scene.getEngine(), W = engine.getRenderWidth(), H = engine.getRenderHeight();
  const glass = scene.getMeshByName('backglass');
  glass.computeWorldMatrix(true);
  const T = { x: 0.255, z: 0.453 };
  const table = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) table.push(new BABYLON.Vector3(sx * T.x, 0, sz * T.z));
  const machine = table.concat(glass.getBoundingInfo().boundingBox.vectorsWorld);
  const flipPts = [dbg.leftFlipper, dbg.rightFlipper]
    .flatMap((f) => [dbg.pivotWorldPosition(f), dbg.tipWorldPosition(f)]);
  const marquee = document.querySelector('#menu-overlay .title-marquee').getBoundingClientRect();
  const cta = document.getElementById('menu-start-instructions').getBoundingClientRect();

  const project = (pts) => {
    const tm = cam.getViewMatrix(true).multiply(cam.getProjectionMatrix(true));
    const vp = cam.viewport.toGlobal(W, H);
    return pts.map((v) => BABYLON.Vector3.Project(v, BABYLON.Matrix.Identity(), tm, vp));
  };
  const boundsOf = (pts) => {
    const q = project(pts);
    return { x0: Math.min(...q.map(p => p.x)) / W, x1: Math.max(...q.map(p => p.x)) / W,
             y0: Math.min(...q.map(p => p.y)) / H, y1: Math.max(...q.map(p => p.y)) / H };
  };

  const shots = [];
  for (let i = 0; i < SHOTS; i++) {
    A.seek(i * SPAN_MS + DWELL_MS * 0.5);
    const t = boundsOf(table), m = boundsOf(machine);
    const flip = project(flipPts);
    shots.push({
      tableInFrame: t.x0 >= 0 && t.x1 <= 1 && t.y0 >= 0 && t.y1 <= 1,
      tableWidth: +(t.x1 - t.x0).toFixed(3),
      clearsMarquee: m.y0 >= marquee.bottom / window.innerHeight,
      machineOnScreen: m.x0 >= 0 && m.x1 <= 1 && m.y1 <= 1,
      flippersBehindCta: flip.filter((p) => p.x >= cta.left && p.x <= cta.right && p.y >= cta.top && p.y <= cta.bottom).length
    });
  }

  // Motion profile over the whole cycle, sampled finely enough to catch a peak.
  const cycle = SPAN_MS * SHOTS;
  const STEP = 50;
  let peakRate = 0, peakAt = 0, moving = 0, samples = 0;
  let prev = null;
  const restingRates = [];
  for (let t = 0; t <= cycle; t += STEP) {
    A.seek(t);
    const now = { a: cam.alpha, b: cam.beta };
    if (prev) {
      const rate = Math.hypot(now.a - prev.a, now.b - prev.b) / (STEP / 1000);
      if (rate > peakRate) { peakRate = rate; peakAt = t; }
      if (rate > 1e-6) moving++;
      // Is the camera genuinely still during the dwell, or creeping through it? Both ends of
      // the pair must sit inside the same dwell - a pair straddling the dwell/move boundary
      // picks up the first easing sample and reports a spurious 2.6e-5 rad/s.
      const inDwell = (ms) => (ms % SPAN_MS) <= DWELL_MS;
      if (inDwell(t) && inDwell(t - STEP) && Math.floor(t / SPAN_MS) === Math.floor((t - STEP) / SPAN_MS)) {
        restingRates.push(rate);
      }
      samples++;
    }
    prev = now;
  }
  // Star depth needs camera TRANSLATION, not just rotation: the near sky layer is positioned at
  // camera.position * (1 - NEAR_SKY_PARALLAX), so it only separates from the far sphere when the
  // camera actually moves through space. A shot list that only rotated would leave the two layers
  // locked together and the background flat.
  const nearSky = scene.getMeshByName('nearSky');
  let maxCamShift = 0, maxLayerShift = 0;
  let firstPos = null, firstLayer = null;
  for (let t = 0; t <= cycle; t += 250) {
    A.seek(t);
    // ArcRotateCamera derives .position lazily inside getViewMatrix - without forcing the rebuild
    // every sample reads the same stale vector and the travel measures as exactly zero.
    cam.getViewMatrix(true);
    scene.onBeforeCameraRenderObservable.notifyObservers(cam); // the parallax hook lives here
    if (!firstPos) { firstPos = cam.position.clone(); if (nearSky) firstLayer = nearSky.position.clone(); }
    maxCamShift = Math.max(maxCamShift, BABYLON.Vector3.Distance(firstPos, cam.position));
    if (nearSky) maxLayerShift = Math.max(maxLayerShift, BABYLON.Vector3.Distance(firstLayer, nearSky.position));
  }

  // Front hemisphere: never behind the table's far end.
  let minAlpha = Infinity, maxAlpha = -Infinity, minCamY = Infinity;
  for (let t = 0; t <= cycle; t += 100) {
    A.seek(t);
    cam.getViewMatrix(true);
    minAlpha = Math.min(minAlpha, cam.alpha); maxAlpha = Math.max(maxAlpha, cam.alpha);
    minCamY = Math.min(minCamY, cam.position.y);
  }
  A.seek(0);
  return {
    shotNames: A.shotNames, hasNearSky: !!nearSky,
    maxCamShift: +maxCamShift.toFixed(3), maxLayerShift: +maxLayerShift.toFixed(3),
    shots, peakRate: +peakRate.toFixed(4), peakAtShot: Math.floor(peakAt / SPAN_MS),
    movingFraction: +(moving / samples).toFixed(3),
    maxRestingRate: +Math.max(...restingRates, 0).toFixed(6),
    alphaRange: [+minAlpha.toFixed(3), +maxAlpha.toFixed(3)],
    frontAlpha: -Math.PI / 2, minCamY: +minCamY.toFixed(3)
  };
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const pageErrors = [];

  for (const [w, h] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500 });
    page.on('pageerror', (e) => pageErrors.push(`${w}x${h}: ${String(e)}`));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__flipperDebug && window.__flipperDebug.attract), null, { timeout: 40000 });
    const r = await page.evaluate(PROBE);

    console.log(`\n=== ${w}x${h} ===`);
    r.shots.forEach((s, i) => {
      check(`${w}x${h} ${r.shotNames[i]}: whole table in frame`, s.tableInFrame, { width: s.tableWidth });
      check(`${w}x${h} ${r.shotNames[i]}: machine clears the marquee and stays on screen`,
        s.clearsMarquee && s.machineOnScreen, { clearsMarquee: s.clearsMarquee, onScreen: s.machineOnScreen });
      check(`${w}x${h} ${r.shotNames[i]}: table is not a distant speck`, s.tableWidth >= 0.25, { width: s.tableWidth });
    });
    check(`${w}x${h}: flippers are not hidden behind the CTA during the flipper beat`,
      r.shots[3].flippersBehindCta === 0, { pointsBehindCta: r.shots[3].flippersBehindCta });

    if (w === 1280) {
      console.log(`\n=== MOTION PROFILE (${w}x${h}) ===`);
      check('peak angular rate stays inside the comfort budget', r.peakRate <= MAX_ANGULAR_RATE,
        { peakRate: r.peakRate, budget: MAX_ANGULAR_RATE, oldConstantSpin: 0.15, duringShot: r.shotNames[r.peakAtShot] });
      check('the camera actually rests, it does not drift continuously', r.movingFraction <= 0.65,
        { movingFraction: r.movingFraction });
      check('it is genuinely stationary during each dwell', r.maxRestingRate === 0, { maxRateDuringDwell: r.maxRestingRate });
      check('the camera never leaves the front hemisphere', 
        r.alphaRange[0] >= r.frontAlpha - 0.5 && r.alphaRange[1] <= r.frontAlpha + 0.5, { alphaRange: r.alphaRange });
      check('the camera never drops below the playfield', r.minCamY > 0.02, { minCameraY: r.minCamY });
      check('the camera translates enough for the sky layers to separate', r.maxCamShift > 0.5,
        { maxCameraTravel: r.maxCamShift });
      check('the near star layer parallaxes against that travel', r.hasNearSky && r.maxLayerShift > 0.1,
        { nearLayerTravel: r.maxLayerShift, cameraTravel: r.maxCamShift });
    }
    await page.close();
  }

  console.log('\n=== REDUCED MOTION ===');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    page.on('pageerror', (e) => pageErrors.push(`reduced: ${String(e)}`));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__flipperDebug && window.__flipperDebug.attract), null, { timeout: 40000 });
    const r = await page.evaluate(() => new Promise((res) => {
      const cam = window.__flipperDebug.attract.camera;
      const snap = () => ({ a: cam.alpha, b: cam.beta, r: cam.radius, o: cam.targetScreenOffset.y });
      const first = snap();
      setTimeout(() => {
        const later = snap();
        res({ first, later,
          moved: Math.abs(first.a - later.a) + Math.abs(first.b - later.b) + Math.abs(first.r - later.r) });
      }, 3000);
    }));
    check('reduced motion holds one fixed framing over 3s', r.moved === 0, r);
    check('and it is a real framing, not a degenerate one', r.later.r > 0.5 && r.later.r < 5, { radius: r.later.r });
    await page.close();
  }

  check('no uncaught page errors', pageErrors.length === 0, pageErrors);
  await browser.close();
  console.log('\n=== SUMMARY ===');
  const pass = results.filter((x) => x.pass).length, fail = results.filter((x) => !x.pass).length;
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
