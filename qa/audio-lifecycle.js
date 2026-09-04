// SPIRITBALL music-lifecycle guard (Phase 3).
//
// Phase 1 built the controller and Phase 2 built the startup phase machine; this covers the wiring
// between them - that each real screen transition asks for the right scene, with the right shape of
// fade, and that nothing in that wiring can produce the two failures this kind of code always grows:
//
//   1. A SECOND SOURCE. Pause, game over and PLAY AGAIN all keep the SAME gameplay track running
//      and only move its gain. If any of them ever restarts the track instead, the player hears two
//      copies drifting apart. Asserted by counting decoded buffers and per-URL network requests
//      across a whole run, not by listening.
//   2. A STALE FADE WINNING. A scene requested while a previous one's 2.7MB decode is still in
//      flight must not be overtaken by it when it lands. Asserted by thrashing the scene faster
//      than a decode can complete and checking what is playing once it settles.
//
// Every transition is driven through the REAL UI - the gate button, the menu, #pause-btn,
// #pause-controls-btn, #controls-back-btn, #pause-resume-btn, a played-out run to Game Over, a
// click to restart - so this fails if a call site is removed, which asserting through
// setAudioScene() directly would not.
//
// CODEC NOTE. This headless Chromium is the open-source build with no H.264 decoder, so the intro
// mp4 fails to decode and the intro exits immediately - the correct behaviour, and the same one a
// missing file produces. Where a test needs the intro held OPEN (to read the video element's own
// volume), the request is routed to a handler that never responds, exactly as qa/startup-intro.js
// does.
//
// Usage:
//   python3 -m http.server 8993            (serve the repo root, from any directory)
//   node qa/audio-lifecycle.js
//   PORT=8993 node qa/audio-lifecycle.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8993;
const BASE = `http://localhost:${PORT}/index.html`;
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

const state = (page) => page.evaluate(() => window.__flipperDebug.audio.musicState());

// Same reasoning as qa/audio-controller.js's own helper: a 2.7MB decode takes multiple seconds on
// this CPU and varies run to run, so every wait here is on the CONDITION, never on a clock.
async function waitUntil(page, predicate, arg, timeoutMs = 30000) {
  try {
    await page.waitForFunction(predicate, arg, { timeout: timeoutMs, polling: 120 });
  } catch (e) { /* the caller asserts on whatever it reads next */ }
  return state(page);
}
const settledAt = (want, duck) => `(() => {
  const s = window.__flipperDebug.audio.musicState();
  return s.key === ${JSON.stringify(want)} && Math.abs(s.trackGain - ${duck}) < 0.02;
})()`;

async function newPage(browser, opts = {}) {
  const w = opts.w || 1100, h = opts.h || 800;
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const jsErrors = [];
  const musicRequests = [];
  page.on('pageerror', (e) => jsErrors.push(String(e.message)));
  page.on('request', (r) => { if (/\.mp3(\?|$)/i.test(r.url())) musicRequests.push(decodeURIComponent(r.url())); });
  if (opts.seedStorage) await context.addInitScript(opts.seedStorage);
  if (opts.hangIntro) {
    await context.route('**/inspiresoftwareintro.mp4', () => { /* never responds */ });
  }
  await page.goto(`${BASE}${opts.query || '?dev=1'}`, { waitUntil: 'load' });
  if (!opts.noHook) {
    await page.waitForFunction(() => !!(window.__flipperDebug && window.__flipperDebug.audio),
      null, { timeout: 40000 });
  }
  return { context, page, jsErrors, musicRequests, w, h };
}

// The one gesture that unlocks audio in a ?dev=1 session, which skips the gate and so never runs
// the gate's own unlockAudio() call. unlockAudio() has to run inside the gesture's own task or the
// browser refuses to build a context at all.
//
// A KEY, deliberately, and specifically one the game does not bind: a click anywhere is the title
// screen's own dismiss-and-start gesture, so unlocking that way would leave the menu music with
// about one frame to exist before hideMenuScreen() correctly crossfaded away from it - and the
// menu-music assertions would be testing a screen the test had already left. ArrowLeft/ArrowRight
// are the flippers and Space starts the game; KeyJ is bound to nothing.
async function unlockByKey(page) {
  await page.evaluate(() => {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyJ') window.__flipperDebug.audio.unlockAudio();
    }, { once: true, capture: true });
  });
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(250);
}

const FORCE_DRAIN = `
  const dbg = window.__flipperDebug; const ball = dbg.mainBall;
  const engine = dbg.scene.getPhysicsEngine();
  const dm = dbg.scene.getMeshByName('drainZone');
  const bb = dm.getBoundingInfo().boundingBox;
  ball.mesh.position.set(dm.position.x, dm.position.y, bb.minimumWorld.z - 0.03);
  ball.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.5));
  ball.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
  for (let i = 0; i < 30 && dbg.isBallInPlay(); i++) {
    dbg.updateHitCooldowns(16);
    dbg.updateBallPhysics(ball, 16);
    engine._step(16 / 1000);
  }
`;
const BALL_IS_BACK = `(!window.__endOfBallDebug.sequence.active
   && window.__flipperDebug.mainBall.mesh.position.y > 0.005)`;
const isOver = (page) => page.evaluate(
  () => getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none');

async function playToGameOver(page) {
  for (let i = 0; i < 14; i++) {
    if (await isOver(page)) return true;
    const st = await page.evaluate(`({ inPlay: window.__flipperDebug.isBallInPlay(), back: ${BALL_IS_BACK} })`);
    if (!st.inPlay) {
      if (!st.back) { await page.waitForTimeout(600); continue; }
      await page.keyboard.down('Space');
      await page.waitForTimeout(200);
      await page.keyboard.up('Space');
      await page.waitForTimeout(400);
    }
    await page.evaluate(FORCE_DRAIN);
    try {
      await page.waitForFunction(
        `getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none' || ${BALL_IS_BACK}`,
        null, { timeout: 20000, polling: 80 });
    } catch (e) { /* fall through and re-read */ }
    await page.waitForTimeout(300);
  }
  return isOver(page);
}

(async () => {
  const browser = await chromium.launch(LAUNCH);

  // ------------------------------------------------------- gate and intro are silent
  console.log('\n=== GATE AND INTRO ARE SILENT ===');
  {
    const { context, page, jsErrors, musicRequests } = await newPage(browser,
      { query: '?dev=1&intro=1', hangIntro: true });
    const atGate = await page.evaluate(() => ({
      phase: window.__flipperDebug.startup.getStartupPhase(),
      music: window.__flipperDebug.audio.musicState(),
      scene: window.__flipperDebug.audio.getAudioScene()
    }));
    check('gate: phase is gate and the scene is silent',
      atGate.phase === 'gate' && atGate.scene === 'silent', { phase: atGate.phase, scene: atGate.scene });
    check('gate: no AudioContext and no music fetched',
      atGate.music.contextState === null && musicRequests.length === 0, musicRequests);

    await page.click('#startup-gate-btn');
    await page.waitForTimeout(1200);
    const inIntro = await page.evaluate(() => ({
      phase: window.__flipperDebug.startup.getStartupPhase(),
      unlocked: window.__flipperDebug.audio.isAudioUnlocked(),
      music: window.__flipperDebug.audio.musicState(),
      scene: window.__flipperDebug.audio.getAudioScene()
    }));
    check('gate gesture unlocks audio', inIntro.unlocked === true && inIntro.music.contextState !== null,
      { unlocked: inIntro.unlocked, ctx: inIntro.music.contextState });
    check('intro: still the silent scene', inIntro.phase === 'intro' && inIntro.scene === 'silent',
      { phase: inIntro.phase, scene: inIntro.scene });
    check('intro: no music track started or fetched',
      inIntro.music.key === null && inIntro.music.targetTrack === null && musicRequests.length === 0,
      { key: inIntro.music.key, target: inIntro.music.targetTrack, requests: musicRequests.length });
    check('gate/intro: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  // ------------------------------------------------------- intro audio honours persisted settings
  console.log('\n=== INTRO VIDEO RESPECTS MUTE AND MUSIC VOLUME ===');
  {
    const { context, page } = await newPage(browser, {
      query: '?dev=1&intro=1', hangIntro: true,
      seedStorage: () => {
        try {
          localStorage.setItem('spiritball-audio-muted', 'true');
          localStorage.setItem('spiritball-audio-music-volume', '0.4');
        } catch (e) { /* ignore */ }
      }
    });
    await page.click('#startup-gate-btn');
    await page.waitForTimeout(600);
    const v = await page.evaluate(() => {
      const el = document.getElementById('intro-video');
      return { muted: el.muted, volume: el.volume, storedMute: window.__flipperDebug.audio.isMasterMuted(),
               storedVol: window.__flipperDebug.audio.getMusicVolume() };
    });
    check('a persisted master mute mutes the intro video', v.muted === true && v.storedMute === true, v);
    check('the intro video plays at the persisted music volume', Math.abs(v.volume - 0.4) < 1e-6, v);
    await context.close();
  }
  {
    // The default (unmuted) case, so the assertion above cannot pass by the element simply never
    // being touched.
    const { context, page } = await newPage(browser, { query: '?dev=1&intro=1', hangIntro: true });
    await page.click('#startup-gate-btn');
    await page.waitForTimeout(600);
    const v = await page.evaluate(() => {
      const el = document.getElementById('intro-video');
      return { muted: el.muted, volume: el.volume, vol: window.__flipperDebug.audio.getMusicVolume() };
    });
    check('an unmuted session leaves the intro video unmuted', v.muted === false, v);
    check('and at the default music volume', Math.abs(v.volume - v.vol) < 1e-6, v);
    await context.close();
  }

  // ------------------------------------------------------- intro exit -> menu music
  console.log('\n=== INTRO EXIT FADES THE MENU TRACK IN ===');
  {
    // No route interception: the codec failure IS one of the required exits (missing file / decode
    // failure), so this is the real path a browser without the decoder takes.
    const { context, page, musicRequests } = await newPage(browser, { query: '?dev=1&intro=1' });
    await page.click('#startup-gate-btn');
    await page.waitForFunction(() => window.__flipperDebug.startup.getStartupPhase() === 'menu',
      null, { timeout: 20000, polling: 100 });
    const asked = await page.evaluate(() => window.__flipperDebug.audio.musicState());
    check('reaching the menu targets the menu track immediately',
      asked.targetTrack === 'cosmicDrift' && asked.scene === 'menu',
      { target: asked.targetTrack, scene: asked.scene });
    const menu = await waitUntil(page, settledAt('cosmicDrift', 1));
    check('the menu track reaches full gain', menu.key === 'cosmicDrift' && Math.abs(menu.trackGain - 1) < 0.02, menu);
    check('exactly one fetch for it', musicRequests.filter((u) => /Cosmic Drift/.test(u)).length === 1, musicRequests);
    check('the gameplay track was not fetched at the menu',
      musicRequests.filter((u) => /Multiverse/.test(u)).length === 0, musicRequests);
    await context.close();
  }

  // ------------------------------------------------------- the whole in-game lifecycle
  console.log('\n=== MENU -> GAMEPLAY -> PAUSE -> CONTROLS -> RESUME ===');
  {
    const { context, page, jsErrors, musicRequests, w, h } = await newPage(browser);
    await unlockByKey(page);
    const menu = await waitUntil(page, settledAt('cosmicDrift', 1));
    check('the title screen plays the menu track', menu.key === 'cosmicDrift', menu);

    // Dismiss the menu the way a player does.
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    const asked = await state(page);
    check('starting a game targets the gameplay track on the same tick',
      asked.targetTrack === 'multiverseVelocity' && asked.scene === 'gameplay',
      { target: asked.targetTrack, scene: asked.scene });
    const play = await waitUntil(page, settledAt('multiverseVelocity', 1));
    check('the gameplay track takes over at full gain', play.key === 'multiverseVelocity'
      && Math.abs(play.trackGain - 1) < 0.02, play);
    check('one buffer per track, and no third decode', play.cachedBuffers === 2, play);
    check('each track fetched exactly once', musicRequests.length === 2
      && new Set(musicRequests).size === 2, musicRequests);

    // Pause: ducked, same source.
    await page.click('#pause-btn');
    const paused = await waitUntil(page, settledAt('multiverseVelocity', 0.35));
    check('pause ducks the gameplay track to 35%', Math.abs(paused.trackGain - 0.35) < 0.02, paused);
    check('pause does NOT restart the track', paused.key === 'multiverseVelocity'
      && paused.cachedBuffers === 2 && musicRequests.length === 2, { s: paused, req: musicRequests.length });

    await page.click('#pause-controls-btn');
    await page.waitForTimeout(500);
    const ctrls = await state(page);
    check('the controls screen stays ducked', ctrls.scene === 'paused'
      && Math.abs(ctrls.trackGain - 0.35) < 0.03, ctrls);
    await page.click('#controls-back-btn');
    await page.waitForTimeout(500);
    const back = await state(page);
    check('coming back from controls stays ducked', back.scene === 'paused'
      && Math.abs(back.trackGain - 0.35) < 0.03, back);

    await page.click('#pause-resume-btn');
    const resumed = await waitUntil(page, settledAt('multiverseVelocity', 1));
    check('resume restores full gameplay volume', Math.abs(resumed.trackGain - 1) < 0.02, resumed);
    check('resume created no new source or fetch', resumed.cachedBuffers === 2
      && musicRequests.length === 2, { s: resumed, req: musicRequests.length });
    check('lifecycle: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  // ------------------------------------------------------- idempotency and stale fades
  console.log('\n=== IDEMPOTENCY AND STALE-FADE PROTECTION ===');
  {
    const { context, page, musicRequests, w, h } = await newPage(browser);
    await unlockByKey(page);
    await waitUntil(page, settledAt('cosmicDrift', 1));
    await page.keyboard.press('Space');
    await waitUntil(page, settledAt('multiverseVelocity', 1));

    // Re-requesting the scene that is already the target must be a genuine no-op: no second
    // source, no re-fetch, and no re-issued ramp restarting a fade that already finished. (The
    // pause button itself cannot be clicked twice - the overlay it opens covers it - so the
    // repetition is driven at the API the screen transitions call.)
    await page.click('#pause-btn');
    await waitUntil(page, settledAt('multiverseVelocity', 0.35));
    await page.evaluate(() => {
      const a = window.__flipperDebug.audio;
      for (let i = 0; i < 5; i++) a.setAudioScene('paused');
    });
    await page.waitForTimeout(400);
    const twice = await state(page);
    check('re-requesting the current scene leaves one ducked source', twice.key === 'multiverseVelocity'
      && twice.cachedBuffers === 2 && musicRequests.length === 2, { s: twice, req: musicRequests.length });
    check('and does not disturb the gain it already reached',
      Math.abs(twice.trackGain - 0.35) < 0.02, twice);
    await page.click('#pause-resume-btn');
    await waitUntil(page, settledAt('multiverseVelocity', 1));

    // Thrash faster than a decode could ever complete. Whatever is asked for LAST is what must be
    // playing once it settles - a slow load resolving late must not win.
    const before = musicRequests.length;
    await page.evaluate(() => {
      const a = window.__flipperDebug.audio;
      a.setAudioScene('menu'); a.setAudioScene('gameplay'); a.setAudioScene('menu');
      a.setAudioScene('gameplay'); a.setAudioScene('menu');
    });
    const thrashed = await waitUntil(page, settledAt('cosmicDrift', 1));
    check('the LAST scene requested is the one that plays', thrashed.key === 'cosmicDrift'
      && thrashed.scene === 'menu', thrashed);
    check('thrashing re-fetched nothing', musicRequests.length === before, musicRequests);
    await page.waitForTimeout(1500);
    const after = await state(page);
    check('and nothing overtakes it afterwards', after.key === 'cosmicDrift'
      && Math.abs(after.trackGain - 1) < 0.02, after);
    await context.close();
  }

  // ------------------------------------------------------- settings panel (Phase 4)
  console.log('\n=== SETTINGS KEEPS THE SCENE IT WAS OPENED OVER ===');
  {
    // The panel is one card behind two doors, and the two doors sit over two different scenes.
    // Opening it must not change what is playing by either route - a settings screen that stops
    // the music to talk about the music is the specific failure here.
    const { context, page, musicRequests } = await newPage(browser);
    await unlockByKey(page);
    await waitUntil(page, settledAt('cosmicDrift', 1));

    await page.click('#menu-settings-btn');
    await page.waitForTimeout(600);
    const inSettings = await state(page);
    check('settings from the menu keeps the menu track at full gain',
      inSettings.key === 'cosmicDrift' && inSettings.scene === 'menu'
      && Math.abs(inSettings.trackGain - 1) < 0.02, inSettings);
    check('and started nothing new', inSettings.cachedBuffers === 1 && musicRequests.length === 1,
      { s: inSettings, req: musicRequests.length });

    await page.click('#controls-back-btn');
    await page.waitForTimeout(600);
    const backAtMenu = await state(page);
    check('BACK to the menu restores the menu scene', backAtMenu.key === 'cosmicDrift'
      && backAtMenu.scene === 'menu' && Math.abs(backAtMenu.trackGain - 1) < 0.02, backAtMenu);

    // Now the other door, over the ducked gameplay track.
    await page.keyboard.press('Space');
    await waitUntil(page, settledAt('multiverseVelocity', 1));
    await page.click('#pause-btn');
    await waitUntil(page, settledAt('multiverseVelocity', 0.35));
    await page.click('#pause-controls-btn');
    await page.waitForTimeout(600);
    const fromPause = await state(page);
    check('settings from pause keeps the gameplay track ducked, not stopped or restarted',
      fromPause.key === 'multiverseVelocity' && fromPause.scene === 'paused'
      && Math.abs(fromPause.trackGain - 0.35) < 0.03, fromPause);
    await page.click('#controls-back-btn');
    await page.waitForTimeout(600);
    const backAtPause = await state(page);
    check('BACK to pause is still the ducked gameplay scene',
      backAtPause.key === 'multiverseVelocity' && backAtPause.scene === 'paused'
      && Math.abs(backAtPause.trackGain - 0.35) < 0.03, backAtPause);
    check('the whole settings detour created no new source or fetch',
      backAtPause.cachedBuffers === 2 && musicRequests.length === 2,
      { s: backAtPause, req: musicRequests.length });
    await context.close();
  }

  // ------------------------------------------------------- declared fade lengths
  console.log('\n=== TRANSITION LENGTHS ===');
  {
    // Two assertions, deliberately: the DECLARED lengths (which is what a later edit would
    // silently change) and one empirical check that the duck really is a short ramp and not the
    // crossfade length wearing its name - a timing assertion tight enough to pin 300ms exactly
    // would be measuring this CI box's CDP round-trip, not the ramp.
    const { context, page, w, h } = await newPage(browser);
    const f = await page.evaluate(() => window.__flipperDebug.audio.fades());
    check('menu fades in over ~900ms', Math.abs(f.menu.enter - 0.9) < 1e-6, f.menu);
    check('gameplay crossfades in over ~700ms', Math.abs(f.gameplay.enter - 0.7) < 1e-6, f.gameplay);
    check('pause ducks to 35% over ~300ms',
      Math.abs(f.paused.duck - 0.35) < 1e-6 && Math.abs(f.paused.adjust - 0.3) < 1e-6, f.paused);
    check('resume restores over ~350ms',
      Math.abs(f.gameplay.duck - 1) < 1e-6 && Math.abs(f.gameplay.adjust - 0.35) < 1e-6, f.gameplay);
    check('game over stays on the run track, well down',
      f.gameover.duck === 0.15 && f.gameover.duck < f.paused.duck, f.gameover);

    await unlockByKey(page);
    await waitUntil(page, settledAt('cosmicDrift', 1));
    await page.keyboard.press('Space');
    await waitUntil(page, settledAt('multiverseVelocity', 1));
    // ONE sample at a fixed offset, rather than a stopwatch. Measuring how long the ramp takes
    // means measuring how often this box can sample it - a frame here is ~560ms, so a 300ms ramp
    // and a 700ms one both read as "already finished by the first sample". A single read at
    // ~500ms is the discriminator instead, and it is one-sided: the declared 300ms ramp is at
    // 0.35 by then, while the crossfade length this must not silently become would still be
    // around 0.7, and any sampling delay only pushes the reading further DOWN, never up.
    const gainAt500 = await page.evaluate(async () => {
      document.getElementById('pause-btn').click();
      await new Promise((r) => setTimeout(r, 500));
      return window.__flipperDebug.audio.musicState().trackGain;
    });
    check('the duck is a short ramp, not the crossfade length', gainAt500 < 0.45, { gainAt500 });
    await context.close();
  }

  // ------------------------------------------------------- tab visibility
  console.log('\n=== VISIBILITY: SILENCE WHILE HIDDEN, CORRECT SCENE BACK ===');
  {
    const { context, page, musicRequests, w, h } = await newPage(browser);
    await unlockByKey(page);
    await waitUntil(page, settledAt('cosmicDrift', 1));
    await page.keyboard.press('Space');
    await waitUntil(page, settledAt('multiverseVelocity', 1));

    await page.evaluate(() => window.__flipperDebug.audio.setAudioHidden(true));
    const hidden = await waitUntil(page, () => window.__flipperDebug.audio.musicState().contextState === 'suspended');
    check('hidden: the context is suspended', hidden.contextState === 'suspended' && hidden.hidden === true, hidden);
    check('hidden: the music is silenced', hidden.trackGain < 0.02, hidden);

    // A scene change WHILE hidden is recorded, not played - and it is the one restored.
    await page.evaluate(() => window.__flipperDebug.audio.setAudioScene('paused'));
    const still = await state(page);
    check('a scene change while hidden stays silent', still.contextState === 'suspended'
      && still.trackGain < 0.02 && still.targetDuck === 0.35, still);

    await page.evaluate(() => window.__flipperDebug.audio.setAudioHidden(false));
    const shown = await waitUntil(page, settledAt('multiverseVelocity', 0.35));
    check('visible: the context resumes', shown.contextState === 'running' && shown.hidden === false, shown);
    check('visible: it restores the scene reached while hidden, not the one left behind',
      shown.scene === 'paused' && Math.abs(shown.trackGain - 0.35) < 0.03, shown);
    check('visibility created no new source or fetch', shown.key === 'multiverseVelocity'
      && shown.cachedBuffers === 2 && musicRequests.length === 2, { s: shown, req: musicRequests.length });
    await context.close();
  }
  {
    // The mute rule: coming back must never undo a mute the player chose.
    const { context, page, w, h } = await newPage(browser);
    await unlockByKey(page);
    await waitUntil(page, settledAt('cosmicDrift', 1));
    await page.evaluate(() => window.__flipperDebug.audio.setMasterMuted(true));
    await page.evaluate(() => window.__flipperDebug.audio.setAudioHidden(true));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__flipperDebug.audio.setAudioHidden(false));
    await page.waitForTimeout(600);
    const g = await page.evaluate(() => ({ gains: window.__flipperDebug.audio.gains(),
                                           muted: window.__flipperDebug.audio.isMasterMuted() }));
    check('returning from hidden does not resume over a chosen mute',
      g.gains.master === 0 && g.muted === true, g);
    await context.close();
  }

  // ------------------------------------------------------- game over and play again
  console.log('\n=== GAME OVER FADES DOWN; PLAY AGAIN REUSES THE SOURCE ===');
  {
    const { context, page, jsErrors, musicRequests, w, h } = await newPage(browser);
    await unlockByKey(page);
    await waitUntil(page, settledAt('cosmicDrift', 1));
    await page.keyboard.press('Space');
    await waitUntil(page, settledAt('multiverseVelocity', 1));
    const reached = await playToGameOver(page);
    check('reached the Game Over screen', reached === true);
    if (reached) {
      const over = await waitUntil(page, settledAt('multiverseVelocity', 0.15));
      check('game over does NOT switch to the menu track', over.key === 'multiverseVelocity'
        && over.scene === 'gameover', over);
      check('game over fades the run music substantially down',
        over.trackGain > 0 && over.trackGain < 0.2, over);
      check('game over started nothing new', over.cachedBuffers === 2 && musicRequests.length === 2,
        { s: over, req: musicRequests.length });

      await page.click('#gameover-play-again-btn');
      const again = await waitUntil(page, settledAt('multiverseVelocity', 1));
      check('play again restores gameplay music', again.key === 'multiverseVelocity'
        && again.scene === 'gameplay' && Math.abs(again.trackGain - 1) < 0.02, again);
      check('play again created no duplicate source or fetch', again.cachedBuffers === 2
        && musicRequests.length === 2, { s: again, req: musicRequests.length });
    }
    check('game over: no page errors', jsErrors.length === 0, jsErrors);
    await context.close();
  }

  // ------------------------------------------------------- fatal screen
  console.log('\n=== FATAL SCREEN FADES TO SILENCE ===');
  {
    const { context, page, w, h } = await newPage(browser);
    await unlockByKey(page);
    await waitUntil(page, settledAt('cosmicDrift', 1));
    // The real path: the module's own window 'error' listener is what calls showFatalError().
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('qa: forced fatal'),
                                                     message: 'qa: forced fatal' }));
    });
    const gone = await waitUntil(page, () => {
      const s = window.__flipperDebug.audio.musicState();
      return s.scene === 'silent' && s.key === null;
    });
    check('a fatal error silences the music', gone.scene === 'silent' && gone.key === null, gone);
    const panel = await page.evaluate(
      () => getComputedStyle(document.getElementById('error-panel')).display !== 'none');
    check('and the fatal panel is the thing on screen', panel === true);
    await context.close();
  }

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
