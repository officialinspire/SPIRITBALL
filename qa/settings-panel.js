// SPIRITBALL settings-panel + INSPIRE wordmark guard (Phase 4).
//
// The panel is now ONE card behind TWO doors, and that is where this kind of change goes wrong:
// BACK has two correct answers and only an explicitly tracked return destination can pick between
// them. So the routing assertions read controlsReturnTo, not the overlay's display.
//
// The other three failures worth catching, none of which a screenshot would show:
//   1. A CONTROL THAT STARTS THE GAME. The title screen starts on a click ANYWHERE, so every
//      interactive thing added to it - the SETTINGS button, and by extension the sliders and BACK
//      on the panel it opens - is a chance to dismiss the menu or charge the plunger by accident.
//      Asserted against the phase machine, which is what "the game started" actually means.
//   2. ARROW KEYS ON A SLIDER FLIPPING THE FLIPPERS. Left/Right are the flippers and the window
//      listener is global; a focused range must own them while the panel is up.
//   3. THE WORDMARK COLLIDING WITH THE CTA at 320px. Checked as real geometry - overlapping
//      rectangles and page overflow - at all three required viewports.
//
// Usage:
//   python3 -m http.server 8994            (serve the repo root, from any directory)
//   node qa/settings-panel.js
//   PORT=8994 node qa/settings-panel.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8994;
const BASE = `http://localhost:${PORT}/index.html?dev=1`;
const LAUNCH = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
         '--enable-webgl', '--no-sandbox']
};

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  OK   ${name}`, detail === undefined ? '' : JSON.stringify(detail)); }
  else { failed++; console.log(`  FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail)); }
}

const VIEWPORTS = [
  { name: '320x568', w: 320, h: 568, touch: true },
  { name: '390x844', w: 390, h: 844, touch: true },
  { name: 'desktop 1280x800', w: 1280, h: 800, touch: false }
];

async function newPage(browser, { w = 1280, h = 800, touch = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__flipperDebug && window.__flipperDebug.settings),
    null, { timeout: 40000 });
  return { context, page, errors };
}

// What "the game is running" actually means - the phase, not an overlay's display.
const phase = (page) => page.evaluate(() => ({
  phase: window.__flipperDebug.startup.getStartupPhase(),
  returnTo: window.__flipperDebug.settings.returnTo(),
  controlsUp: window.__flipperDebug.settings.isControlsUp(),
  menuDisplay: getComputedStyle(document.getElementById('menu-overlay')).display,
  pauseDisplay: getComputedStyle(document.getElementById('pause-overlay')).display,
  controlsDisplay: getComputedStyle(document.getElementById('controls-overlay')).display,
  heading: document.getElementById('controls-overlay-heading').textContent.trim(),
  charge: window.__flipperDebug.plunger ? window.__flipperDebug.plunger.chargePercent : null,
  ballInPlay: window.__flipperDebug.isBallInPlay()
}));

const rect = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
}, sel);

const overlaps = (a, b) => !!(a && b && a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom);

(async () => {
  const browser = await chromium.launch(LAUNCH);

  // ------------------------------------------------------------- routing: menu door
  console.log('\n=== MENU -> SETTINGS -> BACK RETURNS TO THE MENU ===');
  {
    const { context, page, errors } = await newPage(browser);
    const atMenu = await phase(page);
    check('starts at the title screen', atMenu.phase === 'menu' && atMenu.menuDisplay !== 'none', atMenu);

    await page.click('#menu-settings-btn');
    const inSettings = await phase(page);
    check('SETTINGS opens the panel', inSettings.controlsUp === true
      && inSettings.controlsDisplay !== 'none', inSettings);
    check('and records the menu as the return destination', inSettings.returnTo === 'menu', inSettings);
    check('and titles the card SETTINGS', inSettings.heading === 'SETTINGS', inSettings);
    // THE key assertion: the title screen is still logically up. The overlay is off-screen so its
    // click-anywhere handler cannot fire, but the game has NOT started.
    check('opening settings did not start the game', inSettings.phase === 'menu'
      && inSettings.ballInPlay === false, inSettings);
    check('and took the title overlay off the screen', inSettings.menuDisplay === 'none', inSettings);

    await page.click('#controls-back-btn');
    const back = await phase(page);
    check('BACK returns to the title screen', back.phase === 'menu' && back.menuDisplay !== 'none'
      && back.controlsDisplay === 'none', back);
    check('and clears the return destination', back.returnTo === null, back);
    check('and still has not started the game', back.ballInPlay === false, back);
    check('menu door: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- routing: pause door
  console.log('\n=== PAUSE -> CONTROLS -> BACK RETURNS TO PAUSE ===');
  {
    const { context, page, errors } = await newPage(browser);
    await page.keyboard.press('Space');           // dismiss the title screen
    await page.waitForTimeout(300);
    await page.click('#pause-btn');
    await page.waitForTimeout(300);
    await page.click('#pause-controls-btn');
    const inControls = await phase(page);
    check('CONTROLS opens the panel from pause', inControls.controlsUp === true
      && inControls.controlsDisplay !== 'none' && inControls.pauseDisplay === 'none', inControls);
    check('and records pause as the return destination', inControls.returnTo === 'pause', inControls);
    check('and titles the card CONTROLS', inControls.heading === 'CONTROLS', inControls);

    await page.click('#controls-back-btn');
    const back = await phase(page);
    check('BACK returns to the pause panel, not the menu', back.pauseDisplay !== 'none'
      && back.controlsDisplay === 'none' && back.menuDisplay === 'none', back);
    check('and clears the return destination', back.returnTo === null, back);
    check('the game is still paused, not resumed', await page.evaluate(
      () => getComputedStyle(document.getElementById('pause-overlay')).display) === 'flex');

    // Escape must back out the same way the button does, from either door.
    await page.click('#pause-controls-btn');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const esc = await phase(page);
    check('Escape backs out of the panel to pause', esc.controlsUp === false
      && esc.pauseDisplay !== 'none', esc);
    check('pause door: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- input isolation
  console.log('\n=== SETTINGS CONTROLS NEVER START THE GAME OR FLIP A FLIPPER ===');
  {
    const { context, page, errors } = await newPage(browser);
    // The SETTINGS button sits ON the click-anywhere title screen. Its click must not reach it.
    await page.click('#menu-settings-btn');
    let st = await phase(page);
    check('the SETTINGS click did not dismiss the title screen', st.phase === 'menu', st);
    check('and charged nothing', !st.charge, st);

    // Dragging a slider: a pointerdown on the panel must not reach the window-level launch path.
    const r = await rect(page, '#sfx-volume');
    await page.mouse.move(r.x + r.w * 0.3, r.y + r.h / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.w * 0.8, r.y + r.h / 2, { steps: 6 });
    await page.mouse.up();
    st = await phase(page);
    check('dragging a slider did not start the game', st.phase === 'menu'
      && st.ballInPlay === false, st);
    check('and did not charge the plunger', !st.charge, st);

    // Arrow keys belong to the focused slider, not to the flippers.
    await page.focus('#music-volume');
    const before = await page.evaluate(() => ({ v: document.getElementById('music-volume').value }));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const flip = await page.evaluate(() => ({
      v: document.getElementById('music-volume').value,
      left: window.__flipperDebug.leftFlipper.active,
      right: window.__flipperDebug.rightFlipper.active
    }));
    check('ArrowRight moves the slider, not the right flipper',
      Number(flip.v) === Number(before.v) + 2 && flip.right === false && flip.left === false,
      { before: before.v, after: flip.v, left: flip.left, right: flip.right });

    // Space on a focused panel button must activate it, and must not launch.
    await page.focus('#mute-toggle-btn');
    const mutedBefore = await page.evaluate(() => window.__flipperDebug.audio.isMasterMuted());
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const afterSpace = await page.evaluate(() => ({
      muted: window.__flipperDebug.audio.isMasterMuted(),
      phase: window.__flipperDebug.startup.getStartupPhase(),
      pressed: document.getElementById('mute-toggle-btn').getAttribute('aria-pressed')
    }));
    check('Space activates the focused SOUND toggle', afterSpace.muted === !mutedBefore
      && afterSpace.pressed === String(afterSpace.muted), afterSpace);
    check('and does not start the game', afterSpace.phase === 'menu', afterSpace);
    await page.keyboard.press('Space');           // put it back
    await page.waitForTimeout(150);

    // BACK, then confirm click-anywhere-to-start still works on the title screen itself.
    await page.click('#controls-back-btn');
    await page.waitForTimeout(200);
    await page.mouse.click(160, 300);
    await page.waitForTimeout(300);
    const started = await phase(page);
    check('click-anywhere-to-start still works after the detour', started.phase === 'gameplay', started);
    check('input isolation: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- live audio + persistence
  console.log('\n=== VOLUMES ARE LIVE, LABELLED, AND PERSISTED ===');
  {
    const { context, page, errors } = await newPage(browser);
    await page.click('#menu-settings-btn');

    // Every control must be a real, labelled form control - this is what makes the keyboard and
    // AT paths work at all, and it is easy to lose to a styled div.
    const semantics = await page.evaluate(() => {
      const out = {};
      ['music-volume', 'sfx-volume'].forEach((id) => {
        const el = document.getElementById(id);
        const label = document.querySelector(`label[for="${id}"]`);
        out[id] = {
          tag: el.tagName, type: el.type, min: el.min, max: el.max,
          labelled: !!label && label.textContent.trim().length > 0,
          labelText: label ? label.textContent.trim() : null,
          height: Math.round(el.getBoundingClientRect().height)
        };
      });
      const b = document.getElementById('mute-toggle-btn');
      out.mute = { tag: b.tagName, pressed: b.getAttribute('aria-pressed'),
                   height: Math.round(b.getBoundingClientRect().height) };
      out.back = { height: Math.round(
        document.getElementById('controls-back-btn').getBoundingClientRect().height) };
      return out;
    });
    check('music volume is a native 0-100 range with a real label',
      semantics['music-volume'].tag === 'INPUT' && semantics['music-volume'].type === 'range'
      && semantics['music-volume'].min === '0' && semantics['music-volume'].max === '100'
      && semantics['music-volume'].labelled, semantics['music-volume']);
    check('SFX volume is a native 0-100 range with a real label',
      semantics['sfx-volume'].tag === 'INPUT' && semantics['sfx-volume'].type === 'range'
      && semantics['sfx-volume'].min === '0' && semantics['sfx-volume'].max === '100'
      && semantics['sfx-volume'].labelled, semantics['sfx-volume']);
    check('the SOUND toggle reports its state to AT', semantics.mute.tag === 'BUTTON'
      && (semantics.mute.pressed === 'true' || semantics.mute.pressed === 'false'), semantics.mute);
    check('every control clears the 44px touch floor',
      semantics['music-volume'].height >= 44 && semantics['sfx-volume'].height >= 44
      && semantics.mute.height >= 44 && semantics.back.height >= 44, semantics);

    // Live: the gain node moves as the value does, and the visible number tracks it.
    const live = await page.evaluate(() => {
      const set = (id, v) => {
        const el = document.getElementById(id);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('music-volume', 20);
      set('sfx-volume', 70);
      return {
        music: window.__flipperDebug.audio.getMusicVolume(),
        sfx: window.__flipperDebug.audio.getSfxVolume(),
        musicShown: document.getElementById('music-volume-value').textContent.trim(),
        sfxShown: document.getElementById('sfx-volume-value').textContent.trim()
      };
    });
    check('moving the music slider changes the music volume immediately',
      Math.abs(live.music - 0.2) < 1e-6, live);
    check('moving the SFX slider changes the SFX volume immediately',
      Math.abs(live.sfx - 0.7) < 1e-6, live);
    check('the numeric readouts are visible and track the sliders',
      live.musicShown === '20' && live.sfxShown === '70', live);

    // Reload: the panel comes back showing what was stored, without being told.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.__flipperDebug && window.__flipperDebug.settings),
      null, { timeout: 40000 });
    await page.click('#menu-settings-btn');
    const restored = await page.evaluate(() => ({
      music: document.getElementById('music-volume').value,
      sfx: document.getElementById('sfx-volume').value,
      musicShown: document.getElementById('music-volume-value').textContent.trim(),
      sfxShown: document.getElementById('sfx-volume-value').textContent.trim(),
      gainMusic: window.__flipperDebug.audio.getMusicVolume(),
      gainSfx: window.__flipperDebug.audio.getSfxVolume()
    }));
    check('persisted volumes are restored on the sliders after a reload',
      restored.music === '20' && restored.sfx === '70', restored);
    check('and on their readouts', restored.musicShown === '20' && restored.sfxShown === '70', restored);
    check('and in the controller itself', Math.abs(restored.gainMusic - 0.2) < 1e-6
      && Math.abs(restored.gainSfx - 0.7) < 1e-6, restored);
    check('live audio: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- the SFX preview
  console.log('\n=== THE SFX PREVIEW FIRES ONLY WHEN ADJUSTMENT FINISHES ===');
  {
    const { context, page, errors } = await newPage(browser);
    await page.click('#menu-settings-btn');
    // Counted at the bus: every synthesized SFX in this build ends up connected to the SFX gain
    // node, so counting connections to it counts sounds without needing to hear one.
    await page.evaluate(() => {
      const ctx = window.__flipperDebug.audio;
      window.__sfxCount = 0;
      const proto = (window.AudioContext || window.webkitAudioContext).prototype;
      const realOsc = proto.createOscillator;
      proto.createOscillator = function () { window.__sfxCount++; return realOsc.apply(this, arguments); };
      ctx.unlockAudio(); // a context must exist for a preview to be countable at all
    });
    const dragged = await page.evaluate(() => {
      const el = document.getElementById('sfx-volume');
      window.__sfxCount = 0;
      for (let v = 40; v <= 60; v += 5) {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return window.__sfxCount;
    });
    check('a drag (input events) previews nothing', dragged === 0, { oscillators: dragged });
    const committed = await page.evaluate(() => {
      const el = document.getElementById('sfx-volume');
      window.__sfxCount = 0;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return window.__sfxCount;
    });
    check('finishing the adjustment (change) previews once', committed > 0, { oscillators: committed });
    const musicPreview = await page.evaluate(() => {
      const el = document.getElementById('music-volume');
      window.__sfxCount = 0;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return window.__sfxCount;
    });
    check('the music slider does not fire an SFX preview', musicPreview === 0,
      { oscillators: musicPreview });
    check('preview: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- responsive geometry
  console.log('\n=== LAYOUT AT 320x568, 390x844 AND DESKTOP ===');
  for (const vp of VIEWPORTS) {
    const { context, page, errors } = await newPage(browser, vp);
    const logo = await rect(page, '#menu-logo');
    const cta = await rect(page, '#menu-start-instructions');
    const settingsBtn = await rect(page, '#menu-settings-btn');
    const hint = await rect(page, '.title-hint');
    const alt = await page.evaluate(() => {
      const el = document.getElementById('menu-logo');
      return { alt: el.getAttribute('alt'), tag: el.tagName, natW: el.naturalWidth,
               natH: el.naturalHeight, complete: el.complete,
               href: el.closest('a') ? 'in-a-link' : null,
               ratio: el.getBoundingClientRect().width / el.getBoundingClientRect().height };
    });
    check(`${vp.name}: the wordmark loaded`, alt.complete === true && alt.natW > 0, alt);
    check(`${vp.name}: it has meaningful alt text and is not a link`,
      typeof alt.alt === 'string' && alt.alt.trim().length > 0 && alt.href === null, alt);
    check(`${vp.name}: it keeps its aspect ratio`,
      Math.abs(alt.ratio - alt.natW / alt.natH) < 0.05, { ratio: alt.ratio, natural: alt.natW / alt.natH });
    check(`${vp.name}: it does not overlap the CTA`, !overlaps(logo, cta),
      { logo, cta });
    check(`${vp.name}: it does not overlap the SETTINGS button`, !overlaps(logo, settingsBtn),
      { logo, settingsBtn });
    check(`${vp.name}: it does not overlap the control hints`, !overlaps(logo, hint),
      { logo, hint });
    // #mobile-controls is BEHIND the overlay, so this is not a hit-testing problem - it is a
    // legibility one. The launch button is drawn across the bottom of a phone screen and is
    // plainly visible through the title screen's graded scrim; the wordmark was landing straight
    // on its label at both phone sizes before #menu-overlay reserved that height.
    const launch = await rect(page, '#launch-btn');
    const launchShown = await page.evaluate(
      () => getComputedStyle(document.getElementById('mobile-controls')).display !== 'none');
    check(`${vp.name}: it does not sit on the launch button`,
      !launchShown || !overlaps(logo, launch), { logo, launch, launchShown });
    check(`${vp.name}: it stays inside the viewport`,
      logo.x >= 0 && logo.right <= vp.w + 0.5 && logo.bottom <= vp.h + 0.5,
      { logo, vp: { w: vp.w, h: vp.h } });
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth
    }));
    check(`${vp.name}: the title screen does not scroll sideways`,
      overflow.doc <= overflow.win + 1, overflow);

    // And the panel itself at this width.
    await page.click('#menu-settings-btn');
    await page.waitForTimeout(200);
    const panel = await page.evaluate(() => {
      const card = document.querySelector('#controls-overlay .overlay-card');
      const r = card.getBoundingClientRect();
      const ov = document.getElementById('controls-overlay');
      return { cardW: r.width, cardRight: r.right, cardLeft: r.left,
               scrollW: ov.scrollWidth, clientW: ov.clientWidth,
               rangeW: document.getElementById('music-volume').getBoundingClientRect().width };
    });
    check(`${vp.name}: the settings card fits its width`,
      panel.cardLeft >= -0.5 && panel.cardRight <= vp.w + 0.5
      && panel.scrollW <= panel.clientW + 1, panel);
    check(`${vp.name}: the sliders are wide enough to use`, panel.rangeW >= 120, panel);

    // The card is now tall enough to overflow a short screen, and the specific failure that
    // creates is not "it scrolls" - it is that a CENTRED overflowing flex item has its top pushed
    // above the scroll origin, where no amount of scrolling can reach it. Asserted as geometry:
    // scrolled fully up, the card's top edge must be at or below the overlay's own padding.
    const reach = await page.evaluate(() => {
      const ov = document.getElementById('controls-overlay');
      const card = ov.querySelector('.overlay-card');
      const pad = parseFloat(getComputedStyle(ov).paddingTop) || 0;
      ov.scrollTop = 0;
      const top = card.getBoundingClientRect().top;
      ov.scrollTop = ov.scrollHeight;
      const bottom = card.getBoundingClientRect().bottom;
      return { top, bottom, pad, clientH: ov.clientHeight, scrollH: ov.scrollHeight };
    });
    check(`${vp.name}: the top of the settings card is reachable`,
      reach.top >= reach.pad - 1, reach);
    check(`${vp.name}: and so is the bottom`, reach.bottom <= reach.clientH + 1, reach);
    check(`${vp.name}: no page errors`, errors.length === 0, errors);
    await context.close();
  }

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
