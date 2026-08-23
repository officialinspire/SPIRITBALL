// SPIRITBALL control-isolation matrix.
//
// One compact table: for every input the game accepts, on both platforms, does it drive exactly
// the flipper(s) it names - and does releasing it put them back? Twelve rows, two assertions each
// (held state, then released state), one screen of output.
//
// This is the quick, readable matrix. The two exhaustive suites stay where they are and cover the
// things a matrix can't: qa/input-boundaries.js (desktop) also snapshots plunger charge, pause
// state, haptic counts and screen state per input, and covers key-repeat and modifier chords;
// qa/flipper-touch-hitbox.js (mobile) also covers per-touch identifier release, touchcancel,
// forceReleaseAllControls, and touch-target geometry at three viewports. Run this one first - if
// a control mapping has broken outright, this says so in a few seconds.
//
// Real hit-tested input, not synthetic dispatch: keys go through CDP Input.dispatchKeyEvent and
// touches through CDP Input.dispatchTouchEvent at real screen coordinates, so the browser decides
// which element each input lands on, exactly as a keyboard or a finger would. Dispatching events
// AT an element would bypass hit testing and make the "must NOT activate" rows meaningless.
//
// Reads window.__flipperDebug - the permanent read-only ?dev=1 hook. Nothing to hand-patch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/control-isolation.js
//   PORT=8971 node qa/control-isolation.js   (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const LAUNCH = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};
const PORT = process.env.PORT || 8971;
const URL = `http://localhost:${PORT}/index.html?dev=1`;
const DESKTOP = { width: 1280, height: 900 }; // wide + landscape: #mobile-controls is hidden here
const PHONE = { width: 390, height: 844 };

let fails = 0;
const check = (label, cond, detail) => {
  if (!cond) fails++;
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
};

const KEYS = {
  ArrowLeft:  { key: 'ArrowLeft',  code: 'ArrowLeft',  vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Space:      { key: ' ',          code: 'Space',      vk: 32 },
  Escape:     { key: 'Escape',     code: 'Escape',     vk: 27 }
};
const sendKey = (cdp, name, type) => cdp.send('Input.dispatchKeyEvent', {
  type, key: KEYS[name].key, code: KEYS[name].code,
  windowsVirtualKeyCode: KEYS[name].vk, nativeVirtualKeyCode: KEYS[name].vk
});
const touchAt = (cdp, points) => cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: points.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: i + 1 }))
});
const touchEnd = (cdp) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

const flippers = (page) => page.evaluate(() => ({
  left: window.__flipperDebug.leftFlipper.active,
  right: window.__flipperDebug.rightFlipper.active
}));

async function boot(browser, viewport, touch) {
  const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 30000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display !== 'none', null, { timeout: 30000 });
  // Dismiss the title screen (it sits above the controls) with a plain click - deliberately not
  // Space, so no key this matrix is about has any history before the rows below run.
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await page.waitForFunction(() => document.getElementById('menu-overlay').classList.contains('is-starting')
    || getComputedStyle(document.getElementById('menu-overlay')).display === 'none', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  return { page, cdp: await page.context().newCDPSession(page), pageErrors };
}

// One row of the matrix: press, assert exactly who engaged, release, assert everyone is back down.
async function row(page, label, expect, press, release) {
  await press();
  await page.waitForTimeout(90);
  const held = await flippers(page);
  const want = `left:${expect.left ? 'on' : 'off'} right:${expect.right ? 'on' : 'off'}`;
  check(`${label.padEnd(22)} -> ${want}`, held.left === expect.left && held.right === expect.right, held);
  await release();
  await page.waitForTimeout(140);
  const after = await flippers(page);
  check(`${label.padEnd(22)} -> released, both inactive`, after.left === false && after.right === false, after);
}

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const NEITHER = { left: false, right: false };

  console.log('=== DESKTOP (1280x900, keyboard + mouse) ===');
  {
    const { page, cdp, pageErrors } = await boot(browser, DESKTOP, false);
    check('on-screen touch controls are hidden (keyboard/mouse is the only input path)',
      await page.evaluate(() => getComputedStyle(document.getElementById('mobile-controls')).display === 'none'));

    const down = (k) => sendKey(cdp, k, 'keyDown');
    const up = (k) => sendKey(cdp, k, 'keyUp');
    await row(page, 'ArrowLeft', { left: true, right: false }, () => down('ArrowLeft'), () => up('ArrowLeft'));
    await row(page, 'ArrowRight', { left: false, right: true }, () => down('ArrowRight'), () => up('ArrowRight'));
    await row(page, 'Space', NEITHER, () => down('Space'), () => up('Space'));
    await row(page, 'canvas click (centre)', NEITHER,
      async () => { await page.mouse.move(640, 450); await page.mouse.down(); }, () => page.mouse.up());
    // Escape last: it leaves the game paused, and nothing after it needs a running table.
    await row(page, 'Escape', NEITHER, () => down('Escape'), () => up('Escape'));
    check('desktop: no page errors', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  console.log('\n=== MOBILE (390x844, touch) ===');
  {
    const { page, cdp, pageErrors } = await boot(browser, PHONE, true);
    check('on-screen touch controls are showing',
      await page.evaluate(() => getComputedStyle(document.getElementById('mobile-controls')).display !== 'none'));
    // Coordinates come from layout, so the matrix follows the controls if they are ever retuned.
    const at = await page.evaluate(() => {
      const c = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
      return { left: c('flipper-zone-left'), right: c('flipper-zone-right'), launch: c('launch-btn'),
               centre: { x: innerWidth / 2, y: innerHeight / 2 },
               upperLeft: { x: 20, y: 120 }, upperRight: { x: innerWidth - 20, y: 120 } };
    });

    for (const [label, points, expect] of [
      ['left control', [at.left], { left: true, right: false }],
      ['right control', [at.right], { left: false, right: true }],
      ['both controls', [at.left, at.right], { left: true, right: true }],
      ['centre playfield', [at.centre], NEITHER],
      ['upper-left playfield', [at.upperLeft], NEITHER],
      ['upper-right playfield', [at.upperRight], NEITHER],
      ['launch button', [at.launch], NEITHER]
    ]) {
      await row(page, label, expect, () => touchAt(cdp, points), () => touchEnd(cdp));
    }
    check('mobile: no page errors', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  await browser.close();
  console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
