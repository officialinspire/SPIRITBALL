// SPIRITBALL desktop input-boundary regression suite.
//
// One question, asked once per input: does this key/click drive EXACTLY the control it names, and
// leave every other control untouched? The existing suites all check a control in isolation
// (qa/flipper-geometry.js: does ArrowLeft move the left paddle; qa/regression-suite.js: does a
// launch launch). None of them check the negative half - that ArrowLeft does not also nudge the
// plunger, that Space never reaches a flipper, that a click on the canvas activates nothing - and
// the negative half is where input bugs actually live.
//
// Every assertion below therefore reads a FULL snapshot of every control (both flippers' active
// flags and angles, pause state, plunger charge, ball-in-play, which screen is up) before and
// after an input, and asserts on the whole delta rather than on the one field the input was
// supposed to touch.
//
// Key events go through CDP Input.dispatchKeyEvent rather than Playwright's keyboard helper,
// because the interesting cases need `autoRepeat: true` (a physically HELD key fires keydown
// over and over; Playwright's keyboard.down() fires exactly one) and explicit modifier bitmasks.
//
// Haptics double as the side-effect counter: vibrateDevice() is called from inside
// activateFlipper()'s own off->on edge guard, the same guard that gates the solenoid sound, so
// stubbing navigator.vibrate and counting calls measures "how many times did this count as a real
// press" directly - no new game hooks needed. The flipper's tick is HAPTIC_FLIPPER_MS (8ms), a
// value nothing else in the game ever passes (launch press is 15, bumper 18, launch release
// 20-60, and the fanfares are arrays), so flipVibes below is an exact count of "how many times a
// FLIPPER registered a real press" - which is what lets an assertion say `Space produced zero
// flipper haptics` while still allowing the plunger its own legitimate tick.
//
// Reads window.__flipperDebug - the permanent read-only ?dev=1 hook (same one
// qa/flipper-geometry.js uses). Nothing to hand-patch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/input-boundaries.js
//   PORT=8971 node qa/input-boundaries.js   (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const LAUNCH = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};
const PORT = process.env.PORT || 8971;
const URL = `http://localhost:${PORT}/index.html?dev=1`;
// Desktop: wide + landscape, so updateMobileControlsVisibility() hides #mobile-controls entirely
// and the keyboard is the only live input path (asserted in the MOUSE section).
const DESKTOP = { width: 1280, height: 900 };

let fails = 0;
function check(label, cond, detail) {
  if (!cond) fails++;
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
}

const KEYS = {
  ArrowLeft:  { key: 'ArrowLeft',  code: 'ArrowLeft',  vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Space:      { key: ' ',          code: 'Space',      vk: 32, text: ' ' },
  Escape:     { key: 'Escape',     code: 'Escape',     vk: 27 }
};
const MOD = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

async function key(cdp, name, type, { repeat = false, modifiers = 0 } = {}) {
  const k = KEYS[name];
  await cdp.send('Input.dispatchKeyEvent', {
    type, key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
    autoRepeat: repeat, modifiers
  });
}
const down = (cdp, name, opts) => key(cdp, name, 'keyDown', opts);
const up = (cdp, name, opts) => key(cdp, name, 'keyUp', opts);
// A physically held key: one real off->on keydown, then N browser auto-repeats, then one keyup.
async function hold(cdp, page, name, repeats, { releaseAfter = true } = {}) {
  await down(cdp, name);
  for (let i = 0; i < repeats; i++) {
    await key(cdp, name, 'keyDown', { repeat: true });
    await page.waitForTimeout(25);
  }
  if (releaseAfter) await up(cdp, name);
}

// Every control the game has, in one read. Assertions compare whole snapshots, so a stray effect
// on a control the test wasn't even thinking about still fails something.
const snapshot = (page) => page.evaluate(() => {
  const d = window.__flipperDebug;
  const disp = (id) => {
    const el = document.getElementById(id);
    return el ? getComputedStyle(el).display : 'missing';
  };
  const round = (n) => Math.round(n * 1000) / 1000;
  return {
    leftActive: d.leftFlipper.active,
    rightActive: d.rightFlipper.active,
    leftAngle: round(d.leftFlipper.currentAngleRad),
    rightAngle: round(d.rightFlipper.currentAngleRad),
    ballInPlay: d.isBallInPlay(),
    charge: Number(document.getElementById('launch-btn').style.getPropertyValue('--charge-pct') || 0),
    paused: disp('pause-overlay') !== 'none',
    // Dismissing the title screen is logically instant but visually a fade: the overlay keeps
    // display:flex, wearing .is-starting, until its transition ends (~2s under headless
    // compositing here). The game's own menuUp flag flips on the input tick, and every guard in
    // babylon-game.js reads that, not the paint - so .is-starting is the honest read of "the menu
    // is gone", and testing raw display would be testing the CSS transition instead of the input.
    menuUp: disp('menu-overlay') !== 'none' && !document.getElementById('menu-overlay').classList.contains('is-starting'),
    gameOver: disp('gameover-overlay') !== 'none',
    controlsUp: disp('controls-overlay') !== 'none',
    // Split by the flipper's own signature tick, so "did a flipper register a press" and "did
    // some other control buzz" are never conflated.
    flipVibes: window.__vibes.filter((v) => v === 8).length,
    otherVibes: window.__vibes.filter((v) => v !== 8).length
  };
});

// "Everything except the named fields is identical." The point of the suite in one helper.
function onlyChanged(before, after, allowed) {
  const changed = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const unexpected = changed.filter((k) => !allowed.includes(k));
  return { ok: unexpected.length === 0, unexpected, changed };
}

async function boot(browser, { start = true } = {}) {
  const page = await browser.newPage({ viewport: DESKTOP, hasTouch: false, isMobile: false });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  // Count every haptic the game asks for. vibrateDevice() sits behind activateFlipper()'s off->on
  // edge guard, so this is a direct read of "how many real presses did the game register".
  await page.addInitScript(() => {
    window.__vibes = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true, writable: true,
      value: (ms) => { window.__vibes.push(ms); return true; }
    });
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 30000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display !== 'none', null, { timeout: 30000 });
  const cdp = await page.context().newCDPSession(page);
  if (start) {
    // Dismiss the title screen with the mouse, so the keyboard sections start from a clean slate
    // with no Space keydown/keyup of their own already in the history.
    await page.mouse.click(30, 400);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display === 'none', null, { timeout: 30000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => { window.__vibes.length = 0; });
  }
  return { page, cdp, pageErrors };
}

(async () => {
  const browser = await chromium.launch(LAUNCH);

  // =========================================================================================
  console.log('=== KEY -> CONTROL MAPPING (each key drives exactly one control) ===');
  // =========================================================================================
  {
    // ArrowLeft / ArrowRight, one at a time, from an identical resting state each round.
    for (const [name, activeField, otherField] of [
      ['ArrowLeft', 'leftActive', 'rightActive'],
      ['ArrowRight', 'rightActive', 'leftActive']
    ]) {
      const { page, cdp, pageErrors } = await boot(browser);
      const before = await snapshot(page);
      await down(cdp, name);
      await page.waitForTimeout(120);
      const held = await snapshot(page);
      const angleField = activeField === 'leftActive' ? 'leftAngle' : 'rightAngle';
      const otherAngle = angleField === 'leftAngle' ? 'rightAngle' : 'leftAngle';

      check(`${name} down: its own flipper engages`, held[activeField] === true, { before: before[activeField], held: held[activeField] });
      check(`${name} down: the OTHER flipper's active flag never moves`, held[otherField] === false, held);
      check(`${name} down: the OTHER flipper's physical angle never moves`, held[otherAngle] === before[otherAngle], { before: before[otherAngle], held: held[otherAngle] });
      check(`${name} down: touches nothing but its own flipper`,
        onlyChanged(before, held, [activeField, angleField, 'flipVibes']).ok, onlyChanged(before, held, [activeField, angleField, 'flipVibes']));

      await up(cdp, name);
      await page.waitForTimeout(400);
      const released = await snapshot(page);
      check(`${name} up: its own flipper releases`, released[activeField] === false, released);
      check(`${name} up: touches nothing but its own flipper`,
        onlyChanged(held, released, [activeField, angleField, 'flipVibes']).ok, onlyChanged(held, released, [activeField, angleField, 'flipVibes']));
      check(`${name}: no page errors`, pageErrors.length === 0, pageErrors);
      await page.close();
    }

    // Space: plunger only, never a flipper.
    {
      const { page, cdp, pageErrors } = await boot(browser);
      const before = await snapshot(page);
      await down(cdp, 'Space');
      await page.waitForTimeout(250);
      const charging = await snapshot(page);
      check('Space down: neither flipper engages', charging.leftActive === false && charging.rightActive === false, charging);
      check('Space down: neither flipper moves physically',
        charging.leftAngle === before.leftAngle && charging.rightAngle === before.rightAngle,
        { before: [before.leftAngle, before.rightAngle], after: [charging.leftAngle, charging.rightAngle] });
      check('Space down: the plunger is what actually responded', charging.charge > before.charge, { before: before.charge, after: charging.charge });
      check('Space down: no FLIPPER haptic (the plunger gets its own tick, which is fine)', charging.flipVibes === 0, { flipVibes: charging.flipVibes, otherVibes: charging.otherVibes });
      check('Space down: touches nothing but the plunger', onlyChanged(before, charging, ['charge', 'otherVibes']).ok, onlyChanged(before, charging, ['charge', 'otherVibes']));

      await up(cdp, 'Space');
      await page.waitForTimeout(400);
      const launched = await snapshot(page);
      check('Space up: still no flipper anywhere', launched.leftActive === false && launched.rightActive === false, launched);
      check('Space up: launches the ball', launched.ballInPlay === true, launched);
      check('Space up: touches nothing but the plunger/ball',
        onlyChanged(charging, launched, ['charge', 'ballInPlay', 'otherVibes']).ok, onlyChanged(charging, launched, ['charge', 'ballInPlay', 'otherVibes']));
      check('Space: not one flipper haptic across the whole press/release', launched.flipVibes === 0, { flipVibes: launched.flipVibes });
      check('Space: no page errors', pageErrors.length === 0, pageErrors);
      await page.close();
    }

    // Escape: pause flow only.
    {
      const { page, cdp, pageErrors } = await boot(browser);
      const before = await snapshot(page);
      await down(cdp, 'Escape');
      await up(cdp, 'Escape');
      await page.waitForTimeout(200);
      const paused = await snapshot(page);
      check('Escape: pauses', paused.paused === true, paused);
      check('Escape: neither flipper engages', paused.leftActive === false && paused.rightActive === false, paused);
      check('Escape: touches nothing but the pause flow', onlyChanged(before, paused, ['paused']).ok, onlyChanged(before, paused, ['paused']));

      await down(cdp, 'Escape');
      await up(cdp, 'Escape');
      await page.waitForTimeout(200);
      const resumed = await snapshot(page);
      check('Escape again: resumes', resumed.paused === false, resumed);
      check('Escape again: touches nothing but the pause flow', onlyChanged(paused, resumed, ['paused']).ok, onlyChanged(paused, resumed, ['paused']));
      check('Escape: no page errors', pageErrors.length === 0, pageErrors);
      await page.close();
    }
  }

  // =========================================================================================
  console.log('\n=== KEY REPEAT (a held key must not re-fire its side effects) ===');
  // =========================================================================================
  {
    for (const [name, field] of [['ArrowLeft', 'leftActive'], ['ArrowRight', 'rightActive']]) {
      const { page, cdp, pageErrors } = await boot(browser);
      await hold(cdp, page, name, 8, { releaseAfter: false });
      const held = await snapshot(page);
      check(`${name} held through 8 auto-repeats: exactly ONE press registered`, held.flipVibes === 1, { flipVibes: held.flipVibes });
      check(`${name} held: still engaged, not re-triggered`, held[field] === true, held);
      check(`${name} held: the other flipper stayed out of it`,
        held[field === 'leftActive' ? 'rightActive' : 'leftActive'] === false, held);
      await up(cdp, name);
      await page.waitForTimeout(300);
      const after = await snapshot(page);
      check(`${name} held: one keyup fully releases it`, after[field] === false, after);
      check(`${name} held: repeats never produced a second haptic`, after.flipVibes === 1, { flipVibes: after.flipVibes });
      check(`${name} repeat: no page errors`, pageErrors.length === 0, pageErrors);
      await page.close();
    }

    // Space: a held key must keep ACCUMULATING charge, not restart it on every repeat.
    {
      const { page, cdp, pageErrors } = await boot(browser);
      await down(cdp, 'Space');
      await page.waitForTimeout(200);
      const early = await snapshot(page);
      for (let i = 0; i < 8; i++) { await key(cdp, 'Space', 'keyDown', { repeat: true }); await page.waitForTimeout(40); }
      const late = await snapshot(page);
      check('Space held through 8 auto-repeats: charge keeps accumulating (never reset)', late.charge > early.charge, { early: early.charge, late: late.charge });
      check('Space held: still no flipper', late.leftActive === false && late.rightActive === false, late);
      check('Space held: no flipper haptic at all', late.flipVibes === 0, { flipVibes: late.flipVibes });
      check('Space held: exactly ONE launch-press tick, not one per repeat', late.otherVibes === 1, { otherVibes: late.otherVibes });
      await up(cdp, 'Space');
      await page.waitForTimeout(300);
      check('Space repeat: no page errors', pageErrors.length === 0, pageErrors);
      await page.close();
    }

    // Escape: a held key must pause ONCE, not strobe pause/resume once per repeat.
    {
      const { page, cdp, pageErrors } = await boot(browser);
      const before = await snapshot(page);
      await hold(cdp, page, 'Escape', 9, { releaseAfter: true }); // odd repeat count: a per-repeat toggle would land back on "not paused"
      await page.waitForTimeout(250);
      const after = await snapshot(page);
      check('Escape held through 9 auto-repeats: pauses exactly once and STAYS paused', after.paused === true, { before: before.paused, after: after.paused });
      check('Escape held: never fell through into the Controls submenu', after.controlsUp === false, after);
      check('Escape held: touches nothing but the pause flow', onlyChanged(before, after, ['paused']).ok, onlyChanged(before, after, ['paused']));
      check('Escape repeat: no page errors', pageErrors.length === 0, pageErrors);
      await page.close();
    }
  }

  // =========================================================================================
  console.log('\n=== KEYUP ISOLATION (releasing one key releases only that flipper) ===');
  // =========================================================================================
  {
    const { page, cdp, pageErrors } = await boot(browser);
    for (const [release, keep] of [['ArrowLeft', 'ArrowRight'], ['ArrowRight', 'ArrowLeft']]) {
      await down(cdp, 'ArrowLeft');
      await down(cdp, 'ArrowRight');
      await page.waitForTimeout(120);
      const both = await snapshot(page);
      check(`${release}/${keep}: both engaged before the release`, both.leftActive && both.rightActive, both);
      await up(cdp, release);
      await page.waitForTimeout(150);
      const one = await snapshot(page);
      const releasedField = release === 'ArrowLeft' ? 'leftActive' : 'rightActive';
      const keptField = keep === 'ArrowLeft' ? 'leftActive' : 'rightActive';
      check(`${release} up: releases its own flipper`, one[releasedField] === false, one);
      check(`${release} up: leaves ${keep}'s flipper still held`, one[keptField] === true, one);
      await up(cdp, keep);
      await page.waitForTimeout(400);
      const none = await snapshot(page);
      check(`${keep} up: now both are released`, !none.leftActive && !none.rightActive, none);
    }
    // A Space keyup in the middle of a two-flipper hold must not disturb either one.
    await down(cdp, 'ArrowLeft');
    await down(cdp, 'ArrowRight');
    await page.waitForTimeout(120);
    await down(cdp, 'Space');
    await up(cdp, 'Space');
    await page.waitForTimeout(150);
    const duringSpace = await snapshot(page);
    check('Space press/release mid-hold: both flippers stay exactly as they were', duringSpace.leftActive && duringSpace.rightActive, duringSpace);
    await up(cdp, 'ArrowLeft');
    await up(cdp, 'ArrowRight');
    await page.waitForTimeout(300);
    check('keyup isolation: no page errors', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // =========================================================================================
  console.log('\n=== MODIFIER CHORDS (a browser/OS shortcut is not a flip) ===');
  // =========================================================================================
  {
    const { page, cdp, pageErrors } = await boot(browser);
    for (const [mod, mask] of Object.entries({ Control: MOD.Control, Alt: MOD.Alt, Meta: MOD.Meta })) {
      const before = await snapshot(page);
      await down(cdp, 'ArrowLeft', { modifiers: mask });
      await page.waitForTimeout(120);
      const held = await snapshot(page);
      check(`${mod}+ArrowLeft: does NOT flip`, held.leftActive === false && held.rightActive === false, held);
      check(`${mod}+ArrowLeft: touches nothing at all`, onlyChanged(before, held, []).ok, onlyChanged(before, held, []));
      await up(cdp, 'ArrowLeft', { modifiers: mask });
      await page.waitForTimeout(150);
    }
    // The other direction, and the reason keyup is deliberately NOT modifier-filtered: a modifier
    // pressed DURING a legitimate hold must never be able to strand a flipper down.
    await down(cdp, 'ArrowLeft');
    await page.waitForTimeout(100);
    check('bare ArrowLeft still flips (the filter only rejects chords)', (await snapshot(page)).leftActive === true);
    await up(cdp, 'ArrowLeft', { modifiers: MOD.Control }); // modifier grabbed mid-hold
    await page.waitForTimeout(200);
    check('keyup with a modifier held still releases (no stuck flipper)', (await snapshot(page)).leftActive === false, await snapshot(page));
    check('modifier chords: no page errors', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // =========================================================================================
  console.log('\n=== MOUSE (no click anywhere may reach a flipper) ===');
  // =========================================================================================
  {
    // Menu still up: the click that dismisses the title screen must not also flip.
    const { page, pageErrors } = await boot(browser, { start: false });
    const atMenu = await snapshot(page);
    check('desktop: on-screen touch controls are hidden entirely',
      await page.evaluate(() => getComputedStyle(document.getElementById('mobile-controls')).display === 'none'));
    await page.mouse.click(640, 450);
    await page.waitForTimeout(500);
    const dismissed = await snapshot(page);
    check('click on the menu: dismisses it and nothing else', dismissed.menuUp === false && !dismissed.leftActive && !dismissed.rightActive, dismissed);
    check('click on the menu: no flipper haptic', dismissed.flipVibes === atMenu.flipVibes, { before: atMenu.flipVibes, after: dismissed.flipVibes });

    // In-play canvas clicks: centre, all four corners, and the exact bottom corners where the
    // mobile flipper buttons WOULD be if they were showing.
    const spots = [[640, 450], [5, 5], [1275, 5], [5, 895], [1275, 895], [60, 840], [1220, 840], [640, 880]];
    for (const [x, y] of spots) {
      const before = await snapshot(page);
      await page.mouse.click(x, y);
      await page.waitForTimeout(120);
      const after = await snapshot(page);
      check(`click (${x},${y}): no flipper activity`, !after.leftActive && !after.rightActive && after.flipVibes === before.flipVibes, after);
    }

    // Clicks while the pause screen is up, including its own buttons.
    await page.evaluate(() => { window.__vibes.length = 0; });
    const cdp2 = await page.context().newCDPSession(page);
    await down(cdp2, 'Escape'); await up(cdp2, 'Escape');
    await page.waitForTimeout(250);
    check('pause screen is up for the click test', (await snapshot(page)).paused === true);
    await page.mouse.click(640, 200);
    await page.click('#pause-controls-btn');
    await page.waitForTimeout(200);
    const inControls = await snapshot(page);
    check('clicks on the pause/controls screens: no flipper activity',
      !inControls.leftActive && !inControls.rightActive && inControls.flipVibes === 0, inControls);
    check('clicks on the pause/controls screens: reached the Controls screen as intended', inControls.controlsUp === true, inControls);
    await page.click('#controls-back-btn');
    await page.click('#pause-resume-btn');
    await page.waitForTimeout(200);
    const resumed = await snapshot(page);
    check('clicking Resume resumes, still with no flipper activity',
      resumed.paused === false && !resumed.leftActive && !resumed.rightActive && resumed.flipVibes === 0, resumed);
    check('mouse: no page errors', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  await browser.close();
  console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
