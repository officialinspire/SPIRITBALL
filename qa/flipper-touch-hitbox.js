// SPIRITBALL mobile flipper touch hit-area regression test.
//
// Guards the fix for a user-reported bug: .flipper-zone used to be a full-viewport-height,
// ~32%-wide edge strip, so a touch anywhere down either side of the playfield (top corners,
// mid-table - nowhere near the visible round control) activated a flipper, and simply gripping
// the phone by its sides held both flippers down. The zones are now compact bottom-corner arcade
// buttons; see index.html's own .flipper-zone comment.
//
// Why this file and not an addition to qa/stabilization-suite.js: that suite's multi-touch INPUT
// checks dispatch synthetic TouchEvents AT an element (el.dispatchEvent(...)), which bypasses hit
// testing entirely - they would keep passing even if the hitbox covered the whole screen, because
// they never ask the browser which element a coordinate belongs to. Every touch here goes through
// CDP Input.dispatchTouchEvent at real screen coordinates instead, so the browser does the same
// hit test a real finger would. That is the only kind of check that can see this bug.
//
// Reads window.__flipperDebug - the PERMANENT read-only ?dev=1 hook already shipped in
// babylon-game.js (same one qa/flipper-geometry.js uses). Nothing to hand-patch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/flipper-touch-hitbox.js
//   PORT=8971 node qa/flipper-touch-hitbox.js   (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const LAUNCH = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};
const PORT = process.env.PORT || 8971;
const URL = `http://localhost:${PORT}/index.html?dev=1`;
// A common phone portrait viewport; the narrow-phone floor is exercised separately at the end.
const VIEWPORT = { width: 390, height: 844 };

let fails = 0;
function check(label, cond, detail) {
  if (!cond) fails++;
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
}

async function boot(browser, viewport = VIEWPORT) {
  const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load' });
  // Dismiss the title screen - it sits above #mobile-controls, so the buttons are not reachable
  // until it is gone, and the flippers are what this test is about.
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display !== 'none', null, { timeout: 30000 });
  await page.tap('#menu-start-instructions');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display === 'none', null, { timeout: 30000 });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 30000 });
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp, pageErrors };
}

// Real, hit-tested touch input: CDP delivers these to the browser's own input pipeline, so the
// browser decides which element (if any) each coordinate lands on - exactly like a finger.
async function touchStart(cdp, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id !== undefined ? p.id : i + 1 }))
  });
}
async function touchEndAll(cdp) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function touchCancel(cdp) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
}

const flipperState = (page) => page.evaluate(() => ({
  left: window.__flipperDebug.leftFlipper.active,
  right: window.__flipperDebug.rightFlipper.active
}));

// Centre of each control, in viewport coordinates, straight from layout - so the test follows the
// buttons if their size/inset is ever retuned, and can never drift from where they really are.
const controlBoxes = (page) => page.evaluate(() => {
  const box = (id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, right: r.right, bottom: r.bottom };
  };
  return { left: box('flipper-zone-left'), right: box('flipper-zone-right'), launch: box('launch-btn'),
           vw: window.innerWidth, vh: window.innerHeight };
});

(async () => {
  const browser = await chromium.launch(LAUNCH);

  // =========================================================================================
  // The six required scenarios: only the first three may activate a flipper.
  // =========================================================================================
  console.log('=== HIT AREA (390x844 portrait, real hit-tested touches) ===');
  {
    const { page, cdp, pageErrors } = await boot(browser);
    const b = await controlBoxes(page);

    const scenarios = [
      { name: 'left button only',          points: [{ x: b.left.cx, y: b.left.cy }],  expect: { left: true,  right: false } },
      { name: 'right button only',         points: [{ x: b.right.cx, y: b.right.cy }], expect: { left: false, right: true  } },
      { name: 'both buttons (two thumbs)', points: [{ x: b.left.cx, y: b.left.cy }, { x: b.right.cx, y: b.right.cy }], expect: { left: true, right: true } },
      { name: 'centre playfield',          points: [{ x: b.vw / 2, y: b.vh / 2 }],     expect: { left: false, right: false } },
      { name: 'upper-left playfield',      points: [{ x: 20, y: 120 }],                expect: { left: false, right: false } },
      { name: 'upper-right playfield',     points: [{ x: b.vw - 20, y: 120 }],         expect: { left: false, right: false } },
      // Not in the required six, but the same class of bug: the old strip reached all the way
      // down the sides, so these mid-table side touches were the everyday "I gripped my phone"
      // false activation.
      { name: 'mid-table left edge',       points: [{ x: 10, y: b.vh / 2 }],           expect: { left: false, right: false } },
      { name: 'mid-table right edge',      points: [{ x: b.vw - 10, y: b.vh / 2 }],    expect: { left: false, right: false } },
      // Launch stays independent: pressing it must not move a flipper.
      { name: 'launch button',             points: [{ x: b.launch.cx, y: b.launch.cy }], expect: { left: false, right: false } }
    ];

    for (const s of scenarios) {
      await touchStart(cdp, s.points);
      await page.waitForTimeout(80);
      const held = await flipperState(page);
      check(`${s.name}: left=${s.expect.left} right=${s.expect.right}`,
        held.left === s.expect.left && held.right === s.expect.right, held);
      await touchEndAll(cdp);
      await page.waitForTimeout(80);
      const released = await flipperState(page);
      check(`${s.name}: both released on touchend`, !released.left && !released.right, released);
    }

    // border-radius participates in hit testing, so the pad's *usable* target is the inscribed
    // circle, not the border box. Prove the full advertised extent is genuinely live by pressing
    // just inside each of the four cardinal edges - if a future retune shrinks the circle, or
    // clips it further, these are what notice.
    for (const side of ['left', 'right']) {
      const box = b[side];
      const r = box.w / 2 - 3;
      const edges = { 'inner edge': { dx: -r, dy: 0 }, 'outer edge': { dx: r, dy: 0 },
                      'top edge': { dx: 0, dy: -r }, 'bottom edge': { dx: 0, dy: r } };
      for (const [where, d] of Object.entries(edges)) {
        await touchStart(cdp, [{ x: box.cx + d.dx, y: box.cy + d.dy }]);
        await page.waitForTimeout(70);
        const held = await flipperState(page);
        check(`${side} button ${where} (${Math.round(box.w)}px target) still activates`, held[side] === true, held);
        await touchEndAll(cdp);
        await page.waitForTimeout(60);
      }
    }

    check('no page errors during hit-area pass', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // =========================================================================================
  // Independence + the behaviours the fix had to preserve.
  // =========================================================================================
  console.log('\n=== INDEPENDENCE / PRESERVED BEHAVIOUR ===');
  {
    const { page, cdp, pageErrors } = await boot(browser);
    const b = await controlBoxes(page);

    // Left held while right is pressed and released: lifting one thumb must not release the other
    // (the touch-identifier tracking in babylon-game.js, unchanged by this fix).
    await touchStart(cdp, [{ x: b.left.cx, y: b.left.cy, id: 1 }]);
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.round(b.left.cx), y: Math.round(b.left.cy), id: 1 }, { x: Math.round(b.right.cx), y: Math.round(b.right.cy), id: 2 }]
    });
    await page.waitForTimeout(60);
    check('left held + right added: both active', JSON.stringify(await flipperState(page)) === '{"left":true,"right":true}', await flipperState(page));
    // Lift only the right thumb.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ x: Math.round(b.right.cx), y: Math.round(b.right.cy), id: 2 }]
    });
    await page.waitForTimeout(80);
    const afterRightLift = await flipperState(page);
    check('right lifted: left still held, right released', afterRightLift.left === true && afterRightLift.right === false, afterRightLift);
    await touchEndAll(cdp);
    await page.waitForTimeout(80);
    check('left lifted: both released', JSON.stringify(await flipperState(page)) === '{"left":false,"right":false}', await flipperState(page));

    // touchcancel still releases (preserved).
    await touchStart(cdp, [{ x: b.left.cx, y: b.left.cy }]);
    await page.waitForTimeout(60);
    check('touchcancel setup: left active', (await flipperState(page)).left === true);
    await touchCancel(cdp);
    await page.waitForTimeout(80);
    check('touchcancel releases the flipper', (await flipperState(page)).left === false, await flipperState(page));

    // forceReleaseAllControls() via visibilitychange still releases (preserved).
    await touchStart(cdp, [{ x: b.left.cx, y: b.left.cy }, { x: b.right.cx, y: b.right.cy }]);
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(80);
    check('forceReleaseAllControls (visibilitychange) releases both', JSON.stringify(await flipperState(page)) === '{"left":false,"right":false}', await flipperState(page));
    await touchEndAll(cdp);

    check('no page errors during independence pass', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // =========================================================================================
  // Geometry: the buttons must stay comfortably tappable and must not swallow the playfield or
  // collide with the launch button, at the widest and narrowest phones this layout targets.
  // =========================================================================================
  console.log('\n=== GEOMETRY (touch-target size, playfield clearance, no overlap) ===');
  for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const { page, pageErrors } = await boot(browser, vp);
    const b = await controlBoxes(page);
    const tag = `${vp.width}x${vp.height}`;

    for (const side of ['left', 'right']) {
      check(`${tag} ${side}: touch target >= 56px (min usable)`, b[side].w >= 56 && b[side].h >= 56, { w: b[side].w, h: b[side].h });
      check(`${tag} ${side}: touch target >= 72px (target floor)`, b[side].w >= 72 && b[side].h >= 72, { w: b[side].w, h: b[side].h });
      // The whole point of the fix: the control occupies a bottom corner, not a full-height strip.
      check(`${tag} ${side}: confined to the bottom of the screen`, b[side].y > b.vh * 0.75, { y: b[side].y, vh: b.vh });
      check(`${tag} ${side}: occupies a small fraction of the viewport`,
        (b[side].w * b[side].h) / (b.vw * b.vh) < 0.05, { fraction: +((b[side].w * b[side].h) / (b.vw * b.vh)).toFixed(4) });
      check(`${tag} ${side}: on screen with safe-area inset`, b[side].x >= 0 && b[side].right <= b.vw && b[side].bottom <= b.vh,
        { x: b[side].x, right: b[side].right, bottom: b[side].bottom, vw: b.vw, vh: b.vh });
    }
    check(`${tag}: left/right do not overlap each other`, b.left.right < b.right.x, { leftRight: b.left.right, rightX: b.right.x });
    check(`${tag}: neither flipper overlaps the launch button`,
      b.left.right < b.launch.x && b.right.x > b.launch.right, { left: b.left.right, launchX: b.launch.x, launchRight: b.launch.right, right: b.right.x });
    check(`${tag}: no page errors`, pageErrors.length === 0, pageErrors);
    await page.close();
  }

  await browser.close();
  console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
