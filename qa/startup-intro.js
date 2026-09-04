// SPIRITBALL startup-gate + INSPIRE intro guard (Phase 2).
//
// Asserts the phase machine, not element visibility - the phase is the authority and the overlays
// are its consequence, so a test that read display would be re-introducing exactly the coupling
// this pass removed.
//
// Covers: the full sequence on a normal URL; ?dev=1 still landing on the menu (which is what every
// pre-existing suite was written against) and ?dev=1&intro=1 opting back in; the gate accepting
// click/Enter/Space exactly once while never dismissing the menu, charging the plunger, flipping a
// flipper or starting gameplay; every intro exit converging on one idempotent finishIntro(); and
// the video being stopped and released afterwards.
//
// CODEC NOTE, and why the exit tests hold the video open. The headless Chromium used here is the
// open-source build, which ships without the proprietary H.264/AAC decoders - loading the real
// inspiresoftwareintro.mp4 in it produces MediaError code 4 (SRC_NOT_SUPPORTED) immediately.
// Real Chrome/Safari/Firefox decode it fine. That is not a problem to work around so much as a
// free test case: it exercises the decode-failure exit for real, and it is asserted as such
// below. To test the OTHER exits in isolation, those cases route the request to a handler that
// never responds, so the element neither plays nor errors and the intro stays up long enough for
// Skip/Space/Enter to be the thing under test.
//
// Usage:
//   python3 -m http.server 8991
//   node qa/startup-intro.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8991;
const LAUNCH = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
         '--enable-webgl', '--no-sandbox', '--autoplay-policy=document-user-activation-required']
};

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  OK   ${name}`, detail === undefined ? '' : JSON.stringify(detail)); }
  else { failed++; console.log(`  FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail)); }
}

const phase = (page) => page.evaluate(() => window.__flipperDebug.startup.getStartupPhase());
const snapshot = (page) => page.evaluate(() => {
  const d = window.__flipperDebug;
  return {
    phase: d.startup.getStartupPhase(),
    blocks: d.startup.startupBlocksInput(),
    ballInPlay: d.isBallInPlay(),
    leftActive: !!d.leftFlipper.active,
    rightActive: !!d.rightFlipper.active,
    menuShown: getComputedStyle(document.getElementById('menu-overlay')).display !== 'none',
    gateHidden: document.getElementById('startup-gate').hidden,
    introHidden: document.getElementById('intro-overlay').hidden,
    videoSrc: document.getElementById('intro-video').getAttribute('src'),
    videoPaused: document.getElementById('intro-video').paused,
    videoTime: document.getElementById('intro-video').currentTime
  };
});

async function open(browser, query, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  const errors = [];      // uncaught JS + console errors
  const jsErrors = [];    // uncaught JS only
  page.on('pageerror', (e) => { errors.push(String(e.message)); jsErrors.push(String(e.message)); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (opts.route) await page.route(...opts.route);
  await page.goto(`http://localhost:${PORT}/index.html${query}`, { waitUntil: 'load' });
  if (opts.noHook) {
    // A normal URL has no ?dev=1, so __flipperDebug does not exist - by design. The one thing
    // worth asserting on that URL is the ROUTING, and that is observable from the DOM.
    await page.waitForFunction(() => {
      const g = document.getElementById('startup-gate');
      return g && !g.hidden;
    }, null, { timeout: 40000 }).catch(() => {});
  } else {
    await page.waitForFunction(() => !!(window.__flipperDebug && window.__flipperDebug.startup),
      null, { timeout: 40000 });
  }
  return { context, page, errors, jsErrors };
}

const waitPhase = (page, want, timeout = 20000) =>
  page.waitForFunction((w) => window.__flipperDebug.startup.getStartupPhase() === w, want,
    { timeout, polling: 100 }).catch(() => {});

(async () => {
  const browser = await chromium.launch(LAUNCH);

  console.log('\n=== ROUTING: WHICH URL GETS WHICH FLOW ===');
  {
    const { context, page } = await open(browser, '?dev=1');
    await page.waitForTimeout(500);
    const s = await snapshot(page);
    check('?dev=1 goes straight to the menu (what existing suites expect)',
      s.phase === 'menu' && s.menuShown && s.gateHidden && s.introHidden, s);
    check('?dev=1 does not block input at the menu', s.blocks === false, { blocks: s.blocks });
    await context.close();
  }
  {
    const { context, page } = await open(browser, '?dev=1&intro=1');
    await page.waitForTimeout(500);
    const s = await snapshot(page);
    check('?dev=1&intro=1 forces the full sequence', s.phase === 'gate' && !s.gateHidden, s);
    await context.close();
  }
  {
    // No ?dev=1 at all - the real player's URL. Asserted through the DOM because the dev hook
    // deliberately does not exist here.
    const { context, page, errors } = await open(browser, '', { noHook: true });
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({
      gateHidden: document.getElementById('startup-gate').hidden,
      introHidden: document.getElementById('intro-overlay').hidden,
      menuShown: getComputedStyle(document.getElementById('menu-overlay')).display !== 'none',
      loadingShown: getComputedStyle(document.getElementById('loading-panel')).display !== 'none',
      label: document.getElementById('startup-gate-label').textContent
    }));
    check('a normal URL shows the gate, not the menu',
      s.gateHidden === false && s.menuShown === false && s.introHidden === true, s);
    check('the loading panel is gone by the time the gate is up', s.loadingShown === false, s);
    check('the gate names the right gesture for the platform', /CLICK TO START/.test(s.label), s);
    check('no page errors on a normal URL', errors.length === 0, errors);
    await context.close();
  }

  console.log('\n=== THE GATE GESTURE DOES ONLY WHAT IT SHOULD ===');
  {
    const { context, page, errors } = await open(browser, '?dev=1&intro=1', {
      // Held open so the assertions below are about the GATE, not about how fast this browser
      // rejects the codec - see the CODEC NOTE. The decode path has its own test further down.
      route: ['**/inspiresoftwareintro.mp4', () => { /* never respond */ }]
    });
    // Gameplay input must be inert while the gate is up.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await page.keyboard.down('Space'); await page.waitForTimeout(120); await page.keyboard.up('Space');
    await page.waitForTimeout(200);
    let s = await snapshot(page);
    check('arrows do not flip a flipper at the gate', !s.leftActive && !s.rightActive, s);
    check('Space at the gate does not dismiss a menu or start gameplay',
      s.phase === 'gate' && !s.menuShown && !s.ballInPlay, s);

    await page.click('#startup-gate-btn');
    await waitPhase(page, 'intro');
    s = await snapshot(page);
    check('the gate advances to the intro', s.phase === 'intro', s);
    check('the gate hides itself and shows the intro', s.gateHidden && !s.introHidden, s);
    check('the gate did not start gameplay', !s.ballInPlay && !s.menuShown, s);
    const unlocked = await page.evaluate(() => window.__flipperDebug.audio.isAudioUnlocked());
    check('the gate gesture unlocked audio', unlocked === true, { unlocked });
    const scene = await page.evaluate(() => window.__flipperDebug.audio.musicState());
    check('no music is started during the intro', scene.key === null, scene);

    check('no page errors through the gate', errors.length === 0, errors);
    await context.close();
  }
  {
    // "Exactly once" measured synchronously: three activations in one task, then read the phase
    // in the same task, so no async exit can land in between and confuse the result.
    const { context, page, errors } = await open(browser, '?dev=1&intro=1', {
      route: ['**/inspiresoftwareintro.mp4', () => { /* never respond - hold the intro open */ }]
    });
    const after = await page.evaluate(() => {
      const b = document.getElementById('startup-gate-btn');
      b.click(); b.click(); b.click();
      return {
        phase: window.__flipperDebug.startup.getStartupPhase(),
        introHidden: document.getElementById('intro-overlay').hidden,
        gateHidden: document.getElementById('startup-gate').hidden
      };
    });
    check('three gate activations advance exactly one phase',
      after.phase === 'intro' && !after.introHidden && after.gateHidden, after);
    check('a consumed gate raises no page errors', errors.length === 0, errors);
    await context.close();
  }

  console.log('\n=== INTRO EXITS ALL CONVERGE ON ONE PATH ===');
  for (const [label, exit] of [
    ['ended', async (page) => page.evaluate(() => {
      const v = document.getElementById('intro-video');
      v.dispatchEvent(new Event('ended'));
    })],
    ['Skip button', async (page) => page.click('#intro-skip-btn')],
    ['Space', async (page) => page.keyboard.press('Space')],
    ['Enter', async (page) => page.keyboard.press('Enter')],
    ['error event', async (page) => page.evaluate(() => {
      document.getElementById('intro-video').dispatchEvent(new Event('error'));
    })]
  ]) {
    const { context, page, errors } = await open(browser, '?dev=1&intro=1', {
      route: ['**/inspiresoftwareintro.mp4', () => { /* never respond - see the CODEC NOTE */ }]
    });
    await page.click('#startup-gate-btn');
    await waitPhase(page, 'intro');
    await exit(page);
    await waitPhase(page, 'menu');
    const s = await snapshot(page);
    check(`intro exits to the menu on ${label}`, s.phase === 'menu' && s.menuShown && s.introHidden, s);
    check(`video is stopped and released after ${label}`,
      s.videoPaused === true && !s.videoSrc && s.videoTime === 0,
      { paused: s.videoPaused, src: s.videoSrc, t: s.videoTime });
    check(`no page errors on the ${label} exit`, errors.length === 0, errors);
    await context.close();
  }

  console.log('\n=== DECODE FAILURE / MISSING FILE ===');
  {
    // No route stub: the browser fetches the real file and cannot decode it (see the CODEC NOTE).
    // This is the unsupported-codec path a real player on an odd browser would hit.
    const { context, page, errors } = await open(browser, '?dev=1&intro=1');
    await page.click('#startup-gate-btn');
    await waitPhase(page, 'menu', 20000);
    const s = await snapshot(page);
    check('a decode failure falls through to the menu', s.phase === 'menu' && s.menuShown, s);
    check('a decode failure leaves the video released', s.videoPaused && !s.videoSrc, s);
    check('a decode failure raises no page errors', errors.length === 0, errors);
    await context.close();
  }
  {
    // The real failure a bad deploy produces: the asset 404s.
    const { context, page, jsErrors } = await open(browser, '?dev=1&intro=1', {
      route: ['**/inspiresoftwareintro.mp4', (r) => r.fulfill({ status: 404, body: '' })]
    });
    await page.click('#startup-gate-btn');
    await waitPhase(page, 'menu', 20000);
    const s = await snapshot(page);
    check('a missing intro file still reaches the menu', s.phase === 'menu' && s.menuShown, s);
    // A 404 makes the BROWSER log a resource-load error to the console - that is the network
    // layer reporting a real 404, not the page throwing, and it is unavoidable and correct.
    // What must be true is that nothing throws: assert on uncaught JS only here.
    check('a missing intro file throws no uncaught error', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  console.log('\n=== SKIP DOES NOT BUBBLE, AND THE MENU STILL WORKS AFTER ===');
  {
    const { context, page, errors } = await open(browser, '?dev=1&intro=1', {
      route: ['**/inspiresoftwareintro.mp4', () => { /* never respond */ }]
    });
    await page.click('#startup-gate-btn');
    await waitPhase(page, 'intro');
    await page.click('#intro-skip-btn');
    await waitPhase(page, 'menu');
    let s = await snapshot(page);
    check('Skip did not fall through and start gameplay',
      s.phase === 'menu' && !s.ballInPlay && s.menuShown, s);

    // The menu must behave exactly as it always has once reached through the intro.
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    s = await snapshot(page);
    check('Space dismisses the menu normally after the intro', s.phase === 'gameplay' && !s.blocks, s);
    check('no page errors across the whole sequence', errors.length === 0, errors);
    await context.close();
  }

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
