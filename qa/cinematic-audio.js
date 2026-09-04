// SPIRITBALL cinematic startup + audio hardening guard (final pass).
//
// The three features Phases 2-5 added - the startup gate, the INSPIRE intro, and the music/SFX
// buses behind them - are the parts of this build a player meets FIRST and the parts a headless
// suite is least likely to notice breaking. This is the end-to-end guard for them: it walks the
// real sequence a real player walks, on the real URL, and asserts the properties that would ruin
// that sequence if they regressed.
//
// WHAT IT ACTUALLY MEASURES, and why each choice:
//
//   * AUTOPLAY. Asserted as "no AudioContext object exists", not "nothing is audible". A context
//     created before a gesture lands in 'suspended' on a real browser and never recovers, so the
//     only safe assertion is that none was constructed at all.
//   * MUSIC vs SFX. Counted at the constructor (createBufferSource / createOscillator) and at the
//     network (per-URL .mp3 requests), because both are AudioBufferSourceNodes and a suite that
//     counts one kind catches the other by accident - a real false failure this project already
//     hit once and fixed in qa/sfx-layer.js.
//   * FAILURE PATHS. The missing-file cases are driven by ROUTING the request to a 404 or to a
//     handler that never responds, not by renaming files on disk, so the suite is non-destructive
//     and can assert the exact failure it means.
//   * ERRORS. Uncaught page errors are separated from console errors: a 404 makes the BROWSER log
//     a console error that no amount of correct application code can prevent, and conflating the
//     two makes the "no errors" assertion unfalsifiable in exactly the tests that need it most.
//
// CODEC NOTE. This headless Chromium is the open-source build, with no H.264/AAC decoder, so
// inspiresoftwareintro.mp4 fails to decode and the intro exits immediately - which is itself one
// of the required exits (decode failure). Real Chrome/Safari/Firefox play the file.
//
// HOLDING THE INTRO OPEN IS NOT RELIABLE, and the tests are written around that rather than
// against it. Routing the request to a handler that never responds makes Chromium fire 'stalled'
// with readyState 0, which beginIntro() correctly treats as "this intro is not going to happen" -
// so the intro can exit within a few hundred milliseconds, and the 6s start watchdog closes it
// regardless. Both are the product behaving correctly. Any assertion that needs the intro still
// open therefore does its work inside ONE page.evaluate, with no CDP round trip in the middle -
// a round trip here is ~560ms on this SwiftShader box, easily longer than the window.
//
// Usage:
//   python3 -m http.server 8997            (serve the repo root, from any directory)
//   node qa/cinematic-audio.js
//   PORT=8997 node qa/cinematic-audio.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8997;
const ROOT = `http://localhost:${PORT}/index.html`;
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

// Counts every node the audio graph builds, split by kind. Installed before any page script runs.
const INSTRUMENT = () => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  window.__nodes = { osc: 0, buf: 0, ctx: 0 };
  const proto = Ctx.prototype;
  const ro = proto.createOscillator, rb = proto.createBufferSource;
  proto.createOscillator = function () { window.__nodes.osc++; return ro.apply(this, arguments); };
  proto.createBufferSource = function () { window.__nodes.buf++; return rb.apply(this, arguments); };
  // Constructed contexts, counted without preventing construction.
  const Wrapped = new Proxy(Ctx, {
    construct(target, args) { window.__nodes.ctx++; return new target(...args); }
  });
  window.AudioContext = Wrapped;
  if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
};

async function newPage(browser, opts = {}) {
  const w = opts.w || 1100, h = opts.h || 800;
  const context = await browser.newContext({
    viewport: { width: w, height: h }, hasTouch: !!opts.touch, isMobile: !!opts.touch
  });
  const page = await context.newPage();
  // jsErrors are the ones application code controls. consoleErrors include browser-generated
  // resource failures, which a deliberate 404 test must be allowed to produce.
  const jsErrors = [], consoleErrors = [], mp3 = [], mp4 = [];
  page.on('pageerror', (e) => jsErrors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('request', (r) => {
    const u = decodeURIComponent(r.url());
    if (/\.mp3(\?|$)/i.test(u)) mp3.push(u);
    if (/\.mp4(\?|$)/i.test(u)) mp4.push(u);
  });
  await context.addInitScript(INSTRUMENT);
  if (opts.seedStorage) await context.addInitScript(opts.seedStorage);
  if (opts.hangIntro) await context.route('**/*.mp4', () => { /* never responds */ });
  if (opts.missingIntro) await context.route('**/*.mp4', (route) => route.fulfill({ status: 404, body: '' }));
  if (opts.missingMusic) await context.route('**/*.mp3', (route) => route.fulfill({ status: 404, body: '' }));
  if (opts.corruptMusic) {
    await context.route('**/*.mp3', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/mpeg', body: 'not actually an mp3' }));
  }
  await page.goto(`${ROOT}${opts.query || ''}`, { waitUntil: 'load' });
  return { context, page, jsErrors, consoleErrors, mp3, mp4, w, h };
}

// The gate button is in the document from first paint, so this needs no debug hook and works on
// the production URL where none exists.
const gateVisible = (page) => page.evaluate(() => {
  const g = document.getElementById('startup-gate');
  return !!g && !g.hidden && getComputedStyle(g).display !== 'none';
});
const menuVisible = (page) => page.evaluate(
  () => getComputedStyle(document.getElementById('menu-overlay')).display !== 'none');
const introVisible = (page) => page.evaluate(() => {
  const o = document.getElementById('intro-overlay');
  return !!o && !o.hidden;
});
const nodes = (page) => page.evaluate(() => window.__nodes);

async function waitForMenu(page, timeout = 25000) {
  try {
    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('menu-overlay')).display !== 'none',
      null, { timeout, polling: 100 });
  } catch (e) { /* the caller asserts */ }
  return menuVisible(page);
}
// Waits for the gate to be up. main() shows it only after the scene is built.
async function waitForGate(page, timeout = 45000) {
  try {
    await page.waitForFunction(() => {
      const g = document.getElementById('startup-gate');
      return !!g && !g.hidden;
    }, null, { timeout, polling: 100 });
  } catch (e) { /* the caller asserts */ }
  return gateVisible(page);
}
const dbg = (page, fn) => page.evaluate(fn);

(async () => {
  const browser = await chromium.launch(LAUNCH);

  // ============================================================ 1. production load
  console.log('\n=== A NORMAL LOAD STOPS AT THE GATE, SILENT, WITH NO GLOBALS ===');
  {
    const { context, page, jsErrors, consoleErrors, mp3, mp4 } = await newPage(browser, { hangIntro: true });
    const atGate = await waitForGate(page);
    check('the start gate is shown', atGate === true);
    check('the menu is NOT shown behind it', (await menuVisible(page)) === false);
    check('the intro has not started', (await introVisible(page)) === false);

    const n = await nodes(page);
    check('no AudioContext was constructed before any gesture', n.ctx === 0, n);
    check('no music or SFX node was built', n.osc === 0 && n.buf === 0, n);
    check('no music was fetched', mp3.length === 0, mp3);
    check('the intro video was not fetched before the gate was used', mp4.length === 0, mp4);

    // Production must not carry the QA hooks. This is the "no production globals" assertion.
    const globals = await page.evaluate(
      () => Object.keys(window).filter((k) => k.indexOf('__') === 0 && k !== '__nodes'));
    check('a production load exposes no diagnostics globals', globals.length === 0, globals);
    const devPanel = await page.evaluate(
      () => getComputedStyle(document.getElementById('status-panel')).display);
    check('and no dev panel', devPanel === 'none', { devPanel });
    check('no uncaught page errors', jsErrors.length === 0, jsErrors);
    check('no console errors', consoleErrors.length === 0, consoleErrors);
    await context.close();
  }

  // ============================================================ 2. one gesture
  console.log('\n=== ONE GESTURE OPENS THE INTRO AND NOTHING ELSE ===');
  {
    const { context, page, jsErrors, mp3, mp4 } = await newPage(browser, { hangIntro: true, query: '?dev=1&intro=1' });
    await waitForGate(page);
    // Gate click AND the reads that must happen while the intro is up, in one round trip.
    const st = await page.evaluate(async () => {
      document.getElementById('startup-gate-btn').click();
      await new Promise((r) => setTimeout(r, 120));
      return {
        phase: window.__flipperDebug.startup.getStartupPhase(),
        introUp: !document.getElementById('intro-overlay').hidden,
        unlocked: window.__flipperDebug.audio.isAudioUnlocked(),
        ball: window.__flipperDebug.isBallInPlay(),
        charge: window.__flipperDebug.plunger ? window.__flipperDebug.plunger.chargePercent : 0,
        left: window.__flipperDebug.leftFlipper.active,
        right: window.__flipperDebug.rightFlipper.active,
        menuUp: getComputedStyle(document.getElementById('menu-overlay')).display !== 'none',
        music: window.__flipperDebug.audio.musicState()
      };
    });
    check('the gesture advanced to the intro', st.phase === 'intro' && st.introUp === true, st.phase);
    check('and unlocked audio', st.unlocked === true, { unlocked: st.unlocked });
    check('the ball was not launched', st.ball === false, { ball: st.ball });
    check('the plunger was not charged', !st.charge, { charge: st.charge });
    check('no flipper fired', st.left === false && st.right === false, st);
    check('the menu was NOT dismissed by the starting gesture', st.menuUp === false, { menuUp: st.menuUp });
    check('no music started during the intro', st.music.key === null && mp3.length === 0,
      { key: st.music.key, mp3: mp3.length });

    // Exactly once. Measured as the number of intro-video REQUESTS, not as "the phase is still
    // intro N milliseconds later": beginIntro() is what sets the video src, so a second
    // consumption is a second request, and that count is immune to the intro legitimately having
    // exited in the meantime (see the note at the top of this file).
    await page.evaluate(() => {
      const b = document.getElementById('startup-gate-btn');
      b.click(); b.click(); b.click();
    });
    await page.waitForTimeout(400);
    check('the gate is consumed exactly once, however many times it is pressed',
      mp4.length === 1, { requests: mp4.length });
    check('gate: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  // ============================================================ 3. the intro exits
  console.log('\n=== EVERY INTRO EXIT REACHES THE MENU THROUGH ONE PATH ===');
  {
    // (a) SKIP
    const { context, page, jsErrors } = await newPage(browser, { hangIntro: true, query: '?dev=1&intro=1' });
    await waitForGate(page);
    // Gate, then Skip, in one round trip - see the note at the top of this file. Skip is pressed
    // while the intro is verifiably still up, which is the only way this asserts Skip rather than
    // whichever exit happened to win the race.
    const skipRun = await page.evaluate(async () => {
      document.getElementById('startup-gate-btn').click();
      await new Promise((r) => setTimeout(r, 100));
      const introUp = !document.getElementById('intro-overlay').hidden;
      const phaseBefore = window.__flipperDebug.startup.getStartupPhase();
      document.getElementById('intro-skip-btn').click();
      await new Promise((r) => setTimeout(r, 100));
      return { introUp, phaseBefore, phaseAfter: window.__flipperDebug.startup.getStartupPhase() };
    });
    check('Skip was pressed while the intro was genuinely up',
      skipRun.introUp === true && skipRun.phaseBefore === 'intro', skipRun);
    check('Skip reaches the menu', skipRun.phaseAfter === 'menu' && (await waitForMenu(page)) === true,
      skipRun);
    const afterSkip = await dbg(page, () => ({
      phase: window.__flipperDebug.startup.getStartupPhase(),
      introHidden: document.getElementById('intro-overlay').hidden,
      src: document.getElementById('intro-video').getAttribute('src')
    }));
    check('the phase is MENU, not merely "the overlay is hidden"', afterSkip.phase === 'menu', afterSkip);
    check('and the video was released, not just hidden',
      afterSkip.introHidden === true && !afterSkip.src, afterSkip);
    check('Skip did not start the game', (await dbg(page, () => window.__flipperDebug.isBallInPlay())) === false);
    check('skip: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }
  {
    // (b) a synthetic 'ended', the natural completion
    const { context, page, jsErrors } = await newPage(browser, { hangIntro: true, query: '?dev=1&intro=1' });
    await waitForGate(page);
    const endedRun = await page.evaluate(async () => {
      document.getElementById('startup-gate-btn').click();
      await new Promise((r) => setTimeout(r, 100));
      const phaseBefore = window.__flipperDebug.startup.getStartupPhase();
      document.getElementById('intro-video').dispatchEvent(new Event('ended'));
      await new Promise((r) => setTimeout(r, 100));
      return { phaseBefore, phaseAfter: window.__flipperDebug.startup.getStartupPhase() };
    });
    check("'ended' was fired while the intro was up", endedRun.phaseBefore === 'intro', endedRun);
    check("a synthetic 'ended' reaches the menu",
      endedRun.phaseAfter === 'menu' && (await waitForMenu(page)) === true, endedRun);
    check('through the same phase transition',
      (await dbg(page, () => window.__flipperDebug.startup.getStartupPhase())) === 'menu');

    // Idempotence: firing every other exit afterwards must change nothing.
    const music = await dbg(page, () => window.__flipperDebug.audio.musicState());
    await page.evaluate(() => {
      const v = document.getElementById('intro-video');
      v.dispatchEvent(new Event('ended'));
      v.dispatchEvent(new Event('error'));
      const s = document.getElementById('intro-skip-btn'); if (s) s.click();
    });
    await page.waitForTimeout(500);
    const after = await dbg(page, () => ({
      phase: window.__flipperDebug.startup.getStartupPhase(),
      music: window.__flipperDebug.audio.musicState()
    }));
    check('re-firing every exit path changes nothing', after.phase === 'menu'
      && after.music.targetTrack === music.targetTrack, { before: music.targetTrack, after: after.music.targetTrack });
    check('ended: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }
  {
    // (c) a playback rejection / decode failure - the real path on this browser
    const { context, page, jsErrors } = await newPage(browser, { query: '?dev=1&intro=1' });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    check('a video that cannot play still reaches the menu', (await waitForMenu(page)) === true);
    check('phase is MENU', (await dbg(page, () => window.__flipperDebug.startup.getStartupPhase())) === 'menu');
    check('decode failure: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }
  {
    // (d) a MISSING video file (404)
    const { context, page, jsErrors, consoleErrors } = await newPage(browser,
      { missingIntro: true, query: '?dev=1&intro=1' });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    check('a missing intro file still reaches the menu', (await waitForMenu(page)) === true);
    check('a missing intro does not block gameplay',
      (await dbg(page, () => window.__flipperDebug.startup.getStartupPhase())) === 'menu');
    check('missing video: no uncaught page errors', jsErrors.length === 0, jsErrors);
    // The browser's own 404 log is expected here and is NOT an application error.
    check('the only console error is the resource 404 itself',
      consoleErrors.every((e) => /mp4|404|Failed to load/i.test(e)), consoleErrors);
    await context.close();
  }

  // ============================================================ 4. music follows the screens
  console.log('\n=== MUSIC IS REQUESTED ONLY AFTER THE INTRO, AND FOLLOWS THE SCREENS ===');
  {
    const { context, page, jsErrors, mp3 } = await newPage(browser, { query: '?dev=1&intro=1' });
    await waitForGate(page);
    check('no music requested at the gate', mp3.length === 0, mp3);
    await page.click('#startup-gate-btn');
    await waitForMenu(page);
    const atMenu = await page.waitForFunction(
      () => window.__flipperDebug.audio.musicState().key === 'cosmicDrift',
      null, { timeout: 30000, polling: 150 }).then(() => true).catch(() => false);
    check('the menu track starts only once the menu is reached', atMenu === true);
    check('exactly one request for it, and no gameplay track yet',
      mp3.filter((u) => /Cosmic Drift/.test(u)).length === 1
      && mp3.filter((u) => /Multiverse/.test(u)).length === 0, mp3);

    // Starting the game crossfades to the gameplay track.
    await page.keyboard.press('Space');
    const inPlay = await page.waitForFunction(
      () => window.__flipperDebug.audio.musicState().key === 'multiverseVelocity',
      null, { timeout: 30000, polling: 150 }).then(() => true).catch(() => false);
    check('starting the game switches to the gameplay track', inPlay === true);

    // Pause ducks; resume restores. Same source throughout.
    await page.click('#pause-btn');
    const ducked = await page.waitForFunction(
      () => Math.abs(window.__flipperDebug.audio.musicState().trackGain - 0.35) < 0.02,
      null, { timeout: 10000, polling: 80 }).then(() => true).catch(() => false);
    const duckState = await dbg(page, () => window.__flipperDebug.audio.musicState());
    check('pause ducks the gameplay track', ducked === true && duckState.scene === 'paused', duckState);
    check('and does not restart it', duckState.key === 'multiverseVelocity'
      && duckState.cachedBuffers === 2 && mp3.length === 2, { s: duckState, mp3: mp3.length });
    await page.click('#pause-resume-btn');
    const restored = await page.waitForFunction(
      () => Math.abs(window.__flipperDebug.audio.musicState().trackGain - 1) < 0.02,
      null, { timeout: 10000, polling: 80 }).then(() => true).catch(() => false);
    check('resume restores full volume', restored === true);
    check('music: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  // ============================================================ 5. repeated transitions
  console.log('\n=== REPEATED TRANSITIONS ADD NO SOURCES AND NO LISTENERS ===');
  {
    const { context, page, jsErrors, mp3 } = await newPage(browser, { query: '?dev=1&intro=1' });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    await waitForMenu(page);
    await page.waitForFunction(() => window.__flipperDebug.audio.musicState().key === 'cosmicDrift',
      null, { timeout: 30000, polling: 150 }).catch(() => {});
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__flipperDebug.audio.musicState().key === 'multiverseVelocity',
      null, { timeout: 30000, polling: 150 }).catch(() => {});

    // Ten pause/resume cycles, driven IN-PAGE rather than through page.click().
    //
    // Same buttons, same handlers - .click() on the real element dispatches a real click that
    // runs openPauseMenu()/resumeGame() exactly as a player's does. What it skips is Playwright's
    // actionability machinery, and that is the point: those checks wait for an element to be
    // "visible, enabled and stable", and on a canvas game rendering at ~560ms per frame on this
    // SwiftShader box the stability check does not reliably settle. Measured: this loop sat on
    // one iteration with zero output growth over 45 real seconds. Driving the clicks in-page
    // makes the loop deterministic without weakening what it asserts.
    const perCycle = await page.evaluate(async () => {
      const out = [];
      const click = (id) => document.getElementById(id).click();
      for (let i = 0; i < 10; i++) {
        click('pause-btn');
        await new Promise((r) => setTimeout(r, 220));
        window.__nodes.osc = 0; window.__nodes.buf = 0;
        click('pause-resume-btn');
        await new Promise((r) => setTimeout(r, 220));
        out.push(window.__nodes.buf);
      }
      return out;
    });
    const st = await dbg(page, () => window.__flipperDebug.audio.musicState());
    check('ten pause/resume cycles create no new music source',
      perCycle.every((n) => n === 0), perCycle);
    check('and no new fetch or decode', mp3.length === 2 && st.cachedBuffers === 2,
      { mp3: mp3.length, cached: st.cachedBuffers });
    check('one track is still live', st.key === 'multiverseVelocity', st);

    // Reopening the settings card five times must not accumulate click handlers - measured as
    // the sound cost of one press, which would grow with every duplicate listener.
    const perVisit = await page.evaluate(async () => {
      const out = [];
      const click = (id) => document.getElementById(id).click();
      for (let i = 0; i < 5; i++) {
        click('pause-btn');
        await new Promise((r) => setTimeout(r, 200));
        click('pause-controls-btn');
        await new Promise((r) => setTimeout(r, 200));
        window.__nodes.osc = 0; window.__nodes.buf = 0;
        click('controls-back-btn');
        await new Promise((r) => setTimeout(r, 350));
        out.push(window.__nodes.osc + window.__nodes.buf);
        click('pause-resume-btn');
        await new Promise((r) => setTimeout(r, 200));
      }
      return out;
    });
    check('reopening a screen does not accumulate listeners',
      perVisit.every((c) => c === perVisit[0]) && perVisit[0] > 0, perVisit);
    check('repeat: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  // ============================================================ 6. settings
  console.log('\n=== SETTINGS ARE LIVE, PERSISTED, AND MUTE SILENCES BOTH BUSES ===');
  {
    const { context, page, jsErrors } = await newPage(browser, { query: '?dev=1&intro=1' });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    await waitForMenu(page);
    await page.click('#menu-settings-btn');
    await page.waitForTimeout(400);

    const live = await page.evaluate(() => {
      const set = (id, v) => {
        const el = document.getElementById(id);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('music-volume', 25);
      set('sfx-volume', 80);
      return { gains: window.__flipperDebug.audio.gains(),
               shownMusic: document.getElementById('music-volume-value').textContent.trim(),
               shownSfx: document.getElementById('sfx-volume-value').textContent.trim() };
    });
    check('the sliders move the gain nodes immediately',
      Math.abs(live.gains.music - 0.25) < 1e-6 && Math.abs(live.gains.sfx - 0.8) < 1e-6, live.gains);
    check('and the visible numbers track them',
      live.shownMusic === '25' && live.shownSfx === '80', live);

    // MUTE must silence BOTH buses - checked at the master stage they share, and by confirming a
    // deliberately fired SFX is inaudible rather than merely un-built.
    await page.evaluate(() => document.getElementById('mute-toggle-btn').click());
    const muted = await dbg(page, () => ({
      gains: window.__flipperDebug.audio.gains(),
      muted: window.__flipperDebug.audio.isMasterMuted(),
      pressed: document.getElementById('mute-toggle-btn').getAttribute('aria-pressed')
    }));
    check('mute zeroes the one stage music and SFX share',
      muted.gains.master === 0 && muted.muted === true, muted.gains);
    check('while leaving both bus volumes intact',
      Math.abs(muted.gains.music - 0.25) < 1e-6 && Math.abs(muted.gains.sfx - 0.8) < 1e-6, muted.gains);
    check('and the toggle reports its state to assistive tech', muted.pressed === 'true', muted);
    await page.evaluate(() => document.getElementById('mute-toggle-btn').click());

    // Reload: the values come back without being told.
    await page.reload({ waitUntil: 'load' });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    await waitForMenu(page);
    await page.click('#menu-settings-btn');
    await page.waitForTimeout(400);
    const restored = await page.evaluate(() => ({
      music: document.getElementById('music-volume').value,
      sfx: document.getElementById('sfx-volume').value,
      gains: window.__flipperDebug.audio.gains()
    }));
    check('volumes persist across a reload', restored.music === '25' && restored.sfx === '80', restored);
    check('and are applied to the buses on the next unlock',
      Math.abs(restored.gains.music - 0.25) < 1e-6
      && Math.abs(restored.gains.sfx - 0.8) < 1e-6, restored.gains);
    check('settings: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }
  {
    // The legacy key. A player who muted on a shipped build must stay muted here.
    const { context, page } = await newPage(browser, {
      query: '?dev=1&intro=1',
      seedStorage: () => {
        try {
          localStorage.removeItem('spiritball-audio-muted');
          localStorage.setItem('spiritball-muted', 'true');   // the ONLY key an old build wrote
        } catch (e) { /* ignore */ }
      }
    });
    const migrated = await dbg(page, () => window.__flipperDebug.audio.isMasterMuted());
    check('a legacy spiritball-muted=true is adopted', migrated === true, { migrated });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    await page.waitForTimeout(600);
    const g = await dbg(page, () => window.__flipperDebug.audio.gains());
    check('and the master stage comes up muted', g.master === 0, g);
    // Writing through must keep both keys in step, so an older cached build still agrees.
    await page.evaluate(() => window.__flipperDebug.audio.setMasterMuted(false));
    const keys = await page.evaluate(() => ({
      modern: localStorage.getItem('spiritball-audio-muted'),
      legacy: localStorage.getItem('spiritball-muted')
    }));
    check('both keys stay in step on write', keys.modern === 'false' && keys.legacy === 'false', keys);
    await context.close();
  }

  // ============================================================ 7. broken audio assets
  console.log('\n=== A MISSING OR CORRUPT MP3 NEVER BLOCKS THE GAME ===');
  {
    const { context, page, jsErrors, consoleErrors } = await newPage(browser,
      { missingMusic: true, query: '?dev=1&intro=1' });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    check('a 404 on every track still reaches the menu', (await waitForMenu(page)) === true);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1500);
    const st = await dbg(page, () => ({
      phase: window.__flipperDebug.startup.getStartupPhase(),
      music: window.__flipperDebug.audio.musicState()
    }));
    check('and the game still starts', st.phase === 'gameplay', st.phase);
    check('with silence rather than a stall', st.music.key === null, st.music);
    // A failed load must be attempted ONCE, then cached as a failure.
    const cached = st.music.cachedBuffers;
    await page.evaluate(() => {
      const a = window.__flipperDebug.audio;
      a.setAudioScene('menu'); a.setAudioScene('gameplay'); a.setAudioScene('menu');
    });
    await page.waitForTimeout(800);
    const after = await dbg(page, () => window.__flipperDebug.audio.musicState());
    check('a failed track is not re-fetched on every scene change',
      after.cachedBuffers === cached, { before: cached, after: after.cachedBuffers });
    check('missing music: no uncaught page errors', jsErrors.length === 0, jsErrors);
    check('the only console errors are the resource 404s',
      consoleErrors.every((e) => /mp3|mp4|404|Failed to load/i.test(e)), consoleErrors);
    await context.close();
  }
  {
    // Bytes that arrive but are not decodable - the other half of the failure surface.
    const { context, page, jsErrors } = await newPage(browser,
      { corruptMusic: true, query: '?dev=1&intro=1' });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    await waitForMenu(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(2500);
    const st = await dbg(page, () => ({
      phase: window.__flipperDebug.startup.getStartupPhase(),
      music: window.__flipperDebug.audio.musicState()
    }));
    check('an undecodable track leaves the game playable', st.phase === 'gameplay', st.phase);
    check('and silent, not stuck', st.music.key === null, st.music);
    check('corrupt music: no uncaught page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  // ============================================================ 8. hidden tab
  console.log('\n=== A HIDDEN TAB COMES BACK TO THE RIGHT SCENE ===');
  {
    const { context, page, jsErrors, mp3 } = await newPage(browser, { query: '?dev=1&intro=1' });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    await waitForMenu(page);
    await page.waitForFunction(() => window.__flipperDebug.audio.musicState().key === 'cosmicDrift',
      null, { timeout: 30000, polling: 150 }).catch(() => {});
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => Math.abs(window.__flipperDebug.audio.musicState().trackGain - 1) < 0.02
        && window.__flipperDebug.audio.musicState().key === 'multiverseVelocity',
      null, { timeout: 30000, polling: 150 }).catch(() => {});

    await page.evaluate(() => window.__flipperDebug.audio.setAudioHidden(true));
    const hidden = await page.waitForFunction(
      () => window.__flipperDebug.audio.musicState().contextState === 'suspended',
      null, { timeout: 8000, polling: 100 }).then(() => true).catch(() => false);
    const hs = await dbg(page, () => window.__flipperDebug.audio.musicState());
    check('hiding the tab suspends the context', hidden === true && hs.hidden === true, hs);
    check('and silences the music', hs.trackGain < 0.02, hs);

    // A scene change while hidden is what must be restored, not what was playing on the way out.
    await page.evaluate(() => window.__flipperDebug.audio.setAudioScene('paused'));
    await page.evaluate(() => window.__flipperDebug.audio.setAudioHidden(false));
    const back = await page.waitForFunction(
      () => Math.abs(window.__flipperDebug.audio.musicState().trackGain - 0.35) < 0.03,
      null, { timeout: 10000, polling: 100 }).then(() => true).catch(() => false);
    const bs = await dbg(page, () => window.__flipperDebug.audio.musicState());
    check('returning restores the scene reached WHILE hidden',
      back === true && bs.scene === 'paused', bs);
    check('the context is running again', bs.contextState === 'running', bs);
    check('and nothing was re-fetched or re-sourced',
      mp3.length === 2 && bs.cachedBuffers === 2 && bs.key === 'multiverseVelocity',
      { mp3: mp3.length, s: bs });
    check('hidden tab: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }
  {
    // Never resume over a mute the player chose.
    const { context, page } = await newPage(browser, { query: '?dev=1&intro=1' });
    await waitForGate(page);
    await page.click('#startup-gate-btn');
    await waitForMenu(page);
    await page.evaluate(() => window.__flipperDebug.audio.setMasterMuted(true));
    await page.evaluate(() => window.__flipperDebug.audio.setAudioHidden(true));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__flipperDebug.audio.setAudioHidden(false));
    await page.waitForTimeout(600);
    const g = await dbg(page, () => ({ gains: window.__flipperDebug.audio.gains(),
                                       muted: window.__flipperDebug.audio.isMasterMuted() }));
    check('coming back does not undo a chosen mute', g.gains.master === 0 && g.muted === true, g);
    await context.close();
  }

  // ============================================================ 9. the two dev URLs
  console.log('\n=== ?dev=1 KEEPS THE OLD FLOW; ?dev=1&intro=1 EXERCISES THE NEW ONE ===');
  {
    const { context, page, jsErrors, mp3, mp4 } = await newPage(browser, { query: '?dev=1' });
    await page.waitForFunction(() => !!(window.__flipperDebug && window.__flipperDebug.startup),
      null, { timeout: 45000 });
    const st = await dbg(page, () => window.__flipperDebug.startup.getStartupPhase());
    check('?dev=1 lands straight on the menu', st === 'menu' && (await menuVisible(page)), { phase: st });
    check('with no gate shown', (await gateVisible(page)) === false);
    check('and no intro fetched', mp4.length === 0, mp4);
    // The flow every pre-existing suite was written against: Space starts the game.
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    check('Space still starts the game directly',
      (await dbg(page, () => window.__flipperDebug.startup.getStartupPhase())) === 'gameplay');
    check('and no music autoplays without a gesture', mp3.length === 0, mp3);
    check('dev flow: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }
  {
    const { context, page, jsErrors } = await newPage(browser, { hangIntro: true, query: '?dev=1&intro=1' });
    check('?dev=1&intro=1 shows the gate', (await waitForGate(page)) === true);
    await page.click('#startup-gate-btn');
    await page.waitForTimeout(600);
    check('and plays the intro', (await introVisible(page)) === true);
    check('intro flow: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  // ============================================================ 10. keyboard + 320px
  console.log('\n=== KEYBOARD-ONLY AND 320px REMAIN USABLE ===');
  {
    // The whole sequence with no pointer at all.
    // The real mp4 deliberately, not a stub: on this browser it fails to decode and the intro
    // exits on its own, which is exactly the sequence a keyboard-only player would sit through.
    // What is asserted is that the keyboard alone carries the player from the gate to gameplay -
    // pressing Space DURING the intro is covered, with the intro held open, in
    // qa/startup-intro.js, and repeating it here would only re-run that race.
    const { context, page, jsErrors } = await newPage(browser, { query: '?dev=1&intro=1' });
    await waitForGate(page);
    const focused = await page.evaluate(() => {
      document.getElementById('startup-gate-btn').focus();
      return document.activeElement && document.activeElement.id;
    });
    check('the gate button is focusable', focused === 'startup-gate-btn', { focused });
    await page.keyboard.press('Enter');          // activate it - no pointer involved
    check('Enter alone gets past the gate', (await waitForMenu(page)) === true);
    await page.keyboard.press('Space');          // start the game
    await page.waitForTimeout(400);
    check('and Space starts the game',
      (await dbg(page, () => window.__flipperDebug.startup.getStartupPhase())) === 'gameplay');

    // Settings, reached and operated by keyboard.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('pause-controls-btn').focus());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('music-volume').focus());
    const before = await page.evaluate(() => document.getElementById('music-volume').value);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      v: document.getElementById('music-volume').value,
      left: window.__flipperDebug.leftFlipper.active,
      right: window.__flipperDebug.rightFlipper.active
    }));
    check('a focused slider owns the arrow keys',
      Number(after.v) === Number(before) + 2 && !after.left && !after.right,
      { before, after });
    // Read WITHOUT re-focusing. :focus-visible is a browser heuristic about how focus was
    // acquired, and calling .focus() again inside the read is exactly the programmatic path that
    // can fail to match it - the arrow presses above are what make this a genuine keyboard focus.
    const focusRing = await page.evaluate(() => {
      const el = document.getElementById('music-volume');
      const cs = getComputedStyle(el);
      return { active: document.activeElement === el, matches: el.matches(':focus-visible'),
               outline: cs.outlineStyle, width: cs.outlineWidth };
    });
    check('and shows a keyboard focus indicator',
      focusRing.active === true && focusRing.matches === true
      && focusRing.outline !== 'none' && parseFloat(focusRing.width) > 0, focusRing);
    check('keyboard: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }
  {
    // 320x568, the narrowest supported phone.
    const { context, page, jsErrors } = await newPage(browser,
      { w: 320, h: 568, touch: true, hangIntro: true, query: '?dev=1&intro=1' });
    await waitForGate(page);
    const gate = await page.evaluate(() => {
      const b = document.getElementById('startup-gate-btn');
      const r = b.getBoundingClientRect();
      return { label: document.getElementById('startup-gate-label').textContent.trim(),
               w: r.width, h: r.height,
               overflow: document.documentElement.scrollWidth <= window.innerWidth + 1 };
    });
    check('320px: the gate names the touch gesture', /TOUCH/i.test(gate.label), gate.label);
    check('320px: it fills the screen and does not overflow',
      gate.w >= 300 && gate.h >= 500 && gate.overflow === true, gate);

    // Consume the gate and measure Skip in one round trip, then press it - the intro is only
    // reliably up for a few hundred milliseconds here (see the note at the top of this file).
    const skip = await page.evaluate(async () => {
      document.getElementById('startup-gate-btn').click();
      await new Promise((r) => setTimeout(r, 100));
      const b = document.getElementById('intro-skip-btn');
      const r = b.getBoundingClientRect();
      const out = { w: r.width, h: r.height, right: r.right, bottom: r.bottom,
                    introUp: !document.getElementById('intro-overlay').hidden };
      b.click();
      return out;
    });
    check('320px: Skip is a real touch target inside the viewport',
      skip.introUp === true && skip.h >= 40 && skip.right <= 320.5 && skip.bottom <= 568.5, skip);
    check('320px: Skip reaches the menu', (await waitForMenu(page)) === true);
    const menu = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      cta: document.getElementById('menu-start-instructions').getBoundingClientRect().height,
      settings: document.getElementById('menu-settings-btn').getBoundingClientRect().height
    }));
    check('320px: the menu does not scroll sideways', menu.overflow === true, menu);
    check('320px: the CTA and SETTINGS are both real touch targets',
      menu.cta >= 44 && menu.settings >= 44, menu);

    await page.tap('#menu-settings-btn');
    await page.waitForTimeout(400);
    const panel = await page.evaluate(() => {
      const ov = document.getElementById('controls-overlay');
      const card = ov.querySelector('.overlay-card');
      ov.scrollTop = 0;
      const top = card.getBoundingClientRect().top;
      const pad = parseFloat(getComputedStyle(ov).paddingTop) || 0;
      return { top, pad, sideways: ov.scrollWidth <= ov.clientWidth + 1,
               range: document.getElementById('music-volume').getBoundingClientRect().height };
    });
    check('320px: the settings card top is reachable', panel.top >= panel.pad - 1, panel);
    check('320px: it does not scroll sideways', panel.sideways === true, panel);
    check('320px: the sliders keep a 44px target', panel.range >= 44, panel);
    check('320px: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
