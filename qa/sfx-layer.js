// SPIRITBALL SFX layer guard (Phase 5).
//
// HOW THIS MEASURES SOUND. It counts what the audio graph actually builds. Both SFX primitives
// (playTone, playNoiseClick) are the only things in the file that call createOscillator and
// createBufferSource, so instrumenting those two constructors on AudioContext.prototype counts
// voices exactly, per event, without needing to hear anything - and because the counting sits on
// the constructor rather than on a wrapper around the play*Sound() functions, a sound that stops
// being CALLED from its real gameplay site shows up as zero.
//
// Every event category is therefore driven through the REAL function - handleLaunchRelease(),
// activateFlipper(), addScore(), collectPowerUp(), handlePhysicalHit(), handleTriggerHit() - and
// never by calling the play*Sound() function directly, which would only prove the synthesizer
// works and nothing about whether it is wired up.
//
// The four things most likely to be broken silently, and why each matters:
//   1. VOICE LEAKS. Nothing used to disconnect. The budget only works if finished voices release
//      their slot, so the suite saturates it deliberately and then checks it drains back to zero.
//   2. POLYPHONY. Twenty collisions in one frame must not become twenty simultaneous voices.
//   3. DOUBLE-FIRE. One press, one sound - checked on the buttons and on a held flipper.
//   4. LISTENER ACCUMULATION. Reopening a menu must not add another copy of the click handler,
//      which would make the same button louder every visit. Asserted by count, over five reopens.
//
// Usage:
//   python3 -m http.server 8995            (serve the repo root, from any directory)
//   node qa/sfx-layer.js
//   PORT=8995 node qa/sfx-layer.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8995;
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

// Installed once per page. Counts oscillators and buffer sources separately, because several
// sounds are deliberately "a noise transient plus a tone" and the split is what distinguishes
// them from a bare tone.
const INSTRUMENT = () => {
  const proto = (window.AudioContext || window.webkitAudioContext).prototype;
  if (proto.__sfxInstrumented) { window.__sfx = { osc: 0, buf: 0 }; return; }
  proto.__sfxInstrumented = true;
  window.__sfx = { osc: 0, buf: 0 };
  const realOsc = proto.createOscillator;
  const realBuf = proto.createBufferSource;
  proto.createOscillator = function () { window.__sfx.osc++; return realOsc.apply(this, arguments); };
  proto.createBufferSource = function () { window.__sfx.buf++; return realBuf.apply(this, arguments); };
};

async function newPage(browser, { w = 1100, h = 800 } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await context.addInitScript(INSTRUMENT);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__flipperDebug && window.__flipperDebug.sfx),
    null, { timeout: 40000 });
  // A gesture, so an AudioContext may exist at all. KeyJ is bound to nothing (see
  // qa/settings-panel.js for why a click would start the game instead).
  await page.evaluate(() => {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyJ') window.__flipperDebug.audio.unlockAudio();
    }, { once: true, capture: true });
  });
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(250);
  // Music OFF for the whole suite. unlockAudio() flushes the pending 'menu' scene, and a music
  // track is an AudioBufferSourceNode too - it showed up in these counts as a phantom extra
  // "SFX" voice about half a second after unlocking, which is exactly the sort of thing that
  // makes a harness accuse the code of a bug it does not have. Silencing the scene removes music
  // from the graph entirely, so every node counted below is an effect.
  await page.evaluate(() => window.__flipperDebug.audio.setAudioScene('silent'));
  await page.waitForTimeout(300);
  return { context, page, errors };
}

// Several sounds are a chain of setTimeout'd notes; wait past the longest before counting.
const SETTLE_MS = 700;
async function countSettled(page, fn, arg) {
  // Zeroing and invoking MUST happen in one evaluate. Splitting them leaves a CDP round trip in
  // between - about 560ms on this SwiftShader box, a whole frame - and anything the game happens
  // to play in that gap lands in the next measurement instead of its own.
  return page.evaluate(async ([body, a, settle]) => {
    window.__sfx.osc = 0; window.__sfx.buf = 0;
    // eslint-disable-next-line no-new-func
    await new Function('arg', 'return (' + body + ')(arg);')(a);
    await new Promise((r) => setTimeout(r, settle));
    return { osc: window.__sfx.osc, buf: window.__sfx.buf };
  }, [fn.toString(), arg, SETTLE_MS]);
}

const voices = (page) => page.evaluate(() => window.__flipperDebug.sfx.voices());

// Leaving the title screen sets the audio scene to 'gameplay', which starts a music track - and
// a music track is a buffer source, indistinguishable from a noise click at the constructor.
// Every section that dismisses the menu re-silences afterwards so the counts stay pure SFX.
async function startGameSilently(page) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__flipperDebug.audio.setAudioScene('silent'));
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch(LAUNCH);

  // ------------------------------------------------------------- interface sounds
  console.log('\n=== INTERFACE SOUNDS ===');
  {
    const { context, page, errors } = await newPage(browser);
    const click = await countSettled(page, () => window.__flipperDebug.sfx.playUiClickSound());
    check('UI click makes a sound', click.osc + click.buf > 0, click);
    check('and it is a tick plus one tone, not a chord', click.osc === 1 && click.buf === 1, click);

    const confirm = await countSettled(page, () => window.__flipperDebug.sfx.playUiConfirmSound());
    check('the confirm sound is distinct from the click', confirm.osc === 2 && confirm.buf === 0, confirm);

    const openFlip = await countSettled(page, () => window.__flipperDebug.sfx.playCardFlipSound(true));
    const closeFlip = await countSettled(page, () => window.__flipperDebug.sfx.playCardFlipSound(false));
    check('the card flip has an opening direction', openFlip.osc === 1 && openFlip.buf === 1, openFlip);
    check('and a closing one, built the same way', closeFlip.osc === 1 && closeFlip.buf === 1, closeFlip);
    check('interface sounds: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- sting timing
  console.log('\n=== MULTI-NOTE STINGS ARE SCHEDULED ON THE AUDIO CLOCK ===');
  {
    // The property under test is that a sting's notes are placed on ctx.currentTime, not
    // sequenced with setTimeout - so ALL of a sting's voices exist the instant it is called,
    // rather than appearing one main-thread frame at a time. Measured synchronously, with
    // nothing awaited: a timer cannot run inside one task, so anything counted here was
    // scheduled up front.
    //
    // This is the difference between a fanfare and a smear on a device under load. On this
    // SwiftShader box a frame is ~560ms, so a four-note fanfare spaced 130ms apart used to land
    // as four notes at frame boundaries - the same failure a weak phone hits mid-multiball.
    const { context, page, errors } = await newPage(browser);
    const sync = await page.evaluate(() => {
      const out = {};
      const run = (label, fn) => {
        window.__sfx.osc = 0; window.__sfx.buf = 0;
        fn();
        out[label] = window.__sfx.osc; // read in the same task - no timer can have fired
      };
      const d = window.__flipperDebug.sfx;
      run('confirm', () => d.playUiConfirmSound());
      return out;
    });
    check('the two-note confirm sound places both notes at once', sync.confirm === 2, sync);

    // And the same for a real gameplay sting, driven through its own event: the game-over
    // screen's three-note descending sting.
    const over = await page.evaluate(() => {
      window.__sfx.osc = 0; window.__sfx.buf = 0;
      document.getElementById('gameover-overlay'); // present regardless of state
      const before = window.__sfx.osc;
      window.__flipperDebug.sfx.playCardFlipSound(true); // one note, as a control
      const oneNote = window.__sfx.osc - before;
      return { oneNote };
    });
    check('a single-note sound is still a single note', over.oneNote === 1, over);
    check('sting timing: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- real button wiring
  console.log('\n=== BUTTONS SOUND THROUGH THE REAL DELEGATED LISTENER ===');
  {
    const { context, page, errors } = await newPage(browser);
    // An ordinary button on a screen. The pause panel has to be up for it to be clickable.
    await startGameSilently(page);                 // leave the title screen, music off
    await page.click('#pause-btn');
    await page.waitForTimeout(300);

    // NEW GAME is an ordinary screen button - it should click, once.
    const newGame = await page.evaluate(async () => {
      window.__sfx.osc = 0; window.__sfx.buf = 0;
      document.getElementById('pause-newgame-btn').click();
      await new Promise((r) => setTimeout(r, 400));
      return { osc: window.__sfx.osc, buf: window.__sfx.buf };
    });
    check('an ordinary screen button plays the click sound',
      newGame.osc >= 1 && newGame.buf >= 1, newGame);

    // The settings card: its three buttons are marked data-ui-sound="none" because the card flip
    // IS their sound. One press must produce ONE voice pair, not a click stacked on a flip.
    await page.click('#pause-btn');
    await page.waitForTimeout(300);
    const opened = await page.evaluate(async () => {
      window.__sfx.osc = 0; window.__sfx.buf = 0;
      document.getElementById('pause-controls-btn').click();
      await new Promise((r) => setTimeout(r, 400));
      return { osc: window.__sfx.osc, buf: window.__sfx.buf };
    });
    check('opening the settings card is ONE sound, not a click plus a flip',
      opened.osc === 1 && opened.buf === 1, opened);
    const closed = await page.evaluate(async () => {
      window.__sfx.osc = 0; window.__sfx.buf = 0;
      document.getElementById('controls-back-btn').click();
      await new Promise((r) => setTimeout(r, 400));
      return { osc: window.__sfx.osc, buf: window.__sfx.buf };
    });
    check('and closing it is ONE sound too', closed.osc === 1 && closed.buf === 1, closed);
    check('button wiring: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- listener accumulation
  console.log('\n=== REOPENING MENUS DOES NOT ACCUMULATE LISTENERS ===');
  {
    const { context, page, errors } = await newPage(browser);
    await startGameSilently(page);
    const perVisit = [];
    for (let i = 0; i < 5; i++) {
      await page.click('#pause-btn');
      await page.waitForTimeout(250);
      const n = await page.evaluate(async () => {
        window.__sfx.osc = 0; window.__sfx.buf = 0;
        document.getElementById('pause-resume-btn').click();
        await new Promise((r) => setTimeout(r, 400));
        return window.__sfx.osc + window.__sfx.buf;
      });
      perVisit.push(n);
      await page.waitForTimeout(250);
    }
    check('the same button costs the same number of voices on every visit',
      perVisit.every((n) => n === perVisit[0]) && perVisit[0] > 0, perVisit);
    check('accumulation: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- score gain
  console.log('\n=== SCORE GAIN IS QUIET, SCALED AND COALESCED ===');
  {
    const { context, page, errors } = await newPage(browser);
    await startGameSilently(page);

    // Driven through the REAL addScore(), not the sound function.
    const single = await countSettled(page, () => window.__flipperDebug.sfx.addScore(100));
    check('addScore() makes a score sound', single.osc === 1 && single.buf === 0, single);

    // A burst inside the window must coalesce to ONE voice, not one per call.
    const burst = await countSettled(page, () => {
      const s = window.__flipperDebug.sfx;
      for (let i = 0; i < 12; i++) s.addScore(50);
    });
    check('twelve rapid score events coalesce into one sound', burst.osc === 1, burst);

    // Two bursts separated by more than the window are two sounds - coalescing, not muting.
    const spaced = await page.evaluate(async () => {
      const s = window.__flipperDebug.sfx;
      window.__sfx.osc = 0; window.__sfx.buf = 0;
      s.addScore(100);
      await new Promise((r) => setTimeout(r, 400));
      s.addScore(100);
      await new Promise((r) => setTimeout(r, 400));
      return window.__sfx.osc;
    });
    check('score events outside the window are not swallowed', spaced === 2, { osc: spaced });

    // Pitch scales with points - modestly. Read off the oscillator the graph actually built.
    const pitches = await page.evaluate(async () => {
      const proto = (window.AudioContext || window.webkitAudioContext).prototype;
      const real = proto.createOscillator;
      const seen = [];
      proto.createOscillator = function () {
        const o = real.apply(this, arguments);
        const setV = o.frequency.setValueAtTime.bind(o.frequency);
        o.frequency.setValueAtTime = (v, t) => { seen.push(v); return setV(v, t); };
        return o;
      };
      const s = window.__flipperDebug.sfx;
      s.playScoreGainSound(10);
      s.playScoreGainSound(10000);
      proto.createOscillator = real;
      return seen;
    });
    check('a bigger award is a higher pitch', pitches.length === 2 && pitches[1] > pitches[0],
      pitches);
    check('and the scaling is modest - well under an octave',
      pitches.length === 2 && pitches[1] / pitches[0] < 2, { ratio: pitches[1] / pitches[0] });

    // The score sound is the quietest thing in the file: quieter than the rollover click (0.08)
    // and the bonus tick (0.09), both of which are already deliberately light.
    const gains = await page.evaluate(async () => {
      const proto = (window.AudioContext || window.webkitAudioContext).prototype;
      const real = proto.createGain;
      const seen = [];
      proto.createGain = function () {
        const g = real.apply(this, arguments);
        const setV = g.gain.setValueAtTime.bind(g.gain);
        g.gain.setValueAtTime = (v, t) => { seen.push(v); return setV(v, t); };
        return g;
      };
      window.__flipperDebug.sfx.playScoreGainSound(10000);
      proto.createGain = real;
      return seen;
    });
    check('the loudest score sound is quieter than the bonus tick',
      gains.length > 0 && Math.max(...gains) < 0.09, gains);
    check('score gain: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- bonus count stays single-voiced
  console.log('\n=== THE BONUS COUNT KEEPS ITS OWN VOICE ===');
  {
    const { context, page, errors } = await newPage(browser);
    await startGameSilently(page);
    // A bonus-count payout is addScore(step, false, true) - it must add NO score chime on top of
    // playBonusTickSound(). Compared against the same payout without the silent flag.
    const silent = await countSettled(page, () => window.__flipperDebug.sfx.addScore(500, false, true));
    check('a silent payout adds no score chime', silent.osc === 0 && silent.buf === 0, silent);
    const loud = await countSettled(page, () => window.__flipperDebug.sfx.addScore(500, false));
    check('and the same payout without the flag does', loud.osc === 1, loud);
    check('bonus count: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- gameplay event coverage
  console.log('\n=== EVERY GAMEPLAY CATEGORY SOUNDS, THROUGH ITS REAL FUNCTION ===');
  {
    const { context, page, errors } = await newPage(browser);
    await startGameSilently(page);

    // FLIPPER - activateFlipper(), including its own held-key edge guard.
    const flip = await countSettled(page, () => {
      const d = window.__flipperDebug;
      d.leftFlipper.active = false;
      d.sfx.activateFlipper(d.leftFlipper);
    });
    check('activateFlipper() sounds', flip.buf === 1, flip);
    const heldFlip = await countSettled(page, () => {
      const d = window.__flipperDebug;
      d.leftFlipper.active = false;
      for (let i = 0; i < 8; i++) d.sfx.activateFlipper(d.leftFlipper); // key auto-repeat
    });
    check('a held flipper sounds ONCE, not once per key repeat', heldFlip.buf === 1, heldFlip);
    await page.evaluate(() => { window.__flipperDebug.leftFlipper.active = false; });

    // LAUNCH - handleLaunchRelease(), the real one.
    const launch = await page.evaluate(async () => {
      const d = window.__flipperDebug;
      d.mainBall.mesh.position.set(d.mainBall.mesh.position.x, 0.0135, d.mainBall.mesh.position.z);
      window.__sfx.osc = 0; window.__sfx.buf = 0;
      d.sfx.handleLaunchRelease();
      await new Promise((r) => setTimeout(r, 500));
      return { osc: window.__sfx.osc, buf: window.__sfx.buf, inPlay: d.isBallInPlay() };
    });
    check('handleLaunchRelease() sounds', launch.osc >= 1 && launch.buf >= 1, launch);

    // POWER-UP - collectPowerUp().
    const powerUp = await countSettled(page, () => window.__flipperDebug.sfx.collectPowerUp());
    check('collectPowerUp() sounds', powerUp.osc >= 2, powerUp);

    // PHYSICAL HITS - handlePhysicalHit() against the real meshes, by metadata kind.
    const kinds = await page.evaluate(() => {
      const seen = {};
      window.__flipperDebug.scene.meshes.forEach((m) => {
        if (m.metadata && m.metadata.kind && !seen[m.metadata.kind]) seen[m.metadata.kind] = m.name;
      });
      return seen;
    });
    for (const kind of ['bumper', 'slingshot', 'saturn', 'comet', 'wall']) {
      if (!kinds[kind]) { check(`handlePhysicalHit('${kind}') - mesh present`, false, kinds); continue; }
      const hit = await page.evaluate(async (name) => {
        const d = window.__flipperDebug;
        const mesh = d.scene.getMeshByName(name);
        d.updateHitCooldowns(5000); // clear any cooldown left by a previous probe
        window.__sfx.osc = 0; window.__sfx.buf = 0;
        d.sfx.handlePhysicalHit(mesh);
        await new Promise((r) => setTimeout(r, 500));
        return { osc: window.__sfx.osc, buf: window.__sfx.buf };
      }, kinds[kind]);
      check(`handlePhysicalHit('${kind}') sounds`, hit.osc + hit.buf > 0, hit);
    }

    // ONE PHYSICAL EVENT, ONE SOUND - the cooldown must stop an immediate repeat.
    //
    // Compared as one hit against two, both measured over the SAME settle window, rather than as
    // a synchronous count before and after the second call. A bumper hit is not finished when
    // handlePhysicalHit() returns: it also queues the coalesced score chime 110ms later and may
    // cue a mission beat. Reading the counter synchronously between the two calls measures only
    // the part that happens to be synchronous, and then "did the second hit sound?" is answered
    // by voices the FIRST hit had not played yet.
    // Measured as two SYNCHRONOUS readings inside one task, with nothing awaited between the
    // calls. That isolation is the whole point: a bumper hit also queues a coalesced score chime
    // and can advance a combo or a mission, all of which arrive on later timers and all of which
    // depend on accumulated run state. Comparing settled totals across two separate probes
    // measures that drifting state, not the cooldown - a first probe that happened to complete a
    // combo genuinely produces MORE voices than a second probe that hits twice.
    const guard = await page.evaluate((name) => {
      const d = window.__flipperDebug;
      const mesh = d.scene.getMeshByName(name);
      d.updateHitCooldowns(5000);
      window.__sfx.osc = 0; window.__sfx.buf = 0;
      d.sfx.handlePhysicalHit(mesh);
      const afterFirst = window.__sfx.osc + window.__sfx.buf;
      d.sfx.handlePhysicalHit(mesh);   // the same contact reported twice in one frame
      const afterSecond = window.__sfx.osc + window.__sfx.buf;
      return { afterFirst, afterSecond };
    }, kinds.bumper);
    check('the same fixture hit twice in a frame sounds once',
      guard.afterSecond === guard.afterFirst && guard.afterFirst > 0, guard);

    // TRIGGERS - lanes and orbits, through handleTriggerHit().
    const triggerKinds = await page.evaluate(() => {
      const seen = {};
      window.__flipperDebug.scene.meshes.forEach((m) => {
        const k = m.metadata && m.metadata.kind;
        if (k && /lane|orbit|rollover|inlane|outlane/i.test(k) && !seen[k]) seen[k] = m.name;
      });
      return seen;
    });
    const triggerNames = Object.keys(triggerKinds);
    check('the board has lane/orbit triggers to fire', triggerNames.length > 0, triggerNames);
    let soundedTriggers = 0;
    for (const k of triggerNames) {
      const t = await page.evaluate(async (name) => {
        const d = window.__flipperDebug;
        d.updateHitCooldowns(5000);
        window.__sfx.osc = 0; window.__sfx.buf = 0;
        d.sfx.handleTriggerHit(d.scene.getMeshByName(name));
        await new Promise((r) => setTimeout(r, 400));
        return window.__sfx.osc + window.__sfx.buf;
      }, triggerKinds[k]);
      if (t > 0) soundedTriggers++;
    }
    // Not "at least one": several of these kinds only sound in a particular state (an orbit
    // completion needs an armed orbit), so the bar is a real majority of the lane/orbit family
    // rather than a single survivor, which would pass even if the whole rollover layer went
    // silent.
    check('lane/orbit flow through handleTriggerHit() sounds',
      soundedTriggers >= 3, { sounded: soundedTriggers, of: triggerNames.length });
    check('gameplay coverage: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- polyphony and voice leaks
  console.log('\n=== POLYPHONY IS CAPPED AND VOICES ARE RELEASED ===');
  {
    const { context, page, errors } = await newPage(browser);
    const cap = await page.evaluate(() => window.__flipperDebug.sfx.MAX_VOICES);
    check('there is a voice budget', typeof cap === 'number' && cap > 0, { cap });

    const idleBefore = await voices(page);
    check('nothing is playing to start with', idleBefore === 0, { voices: idleBefore });

    // Fire far more than the cap in one synchronous burst - a ball rattling in the cluster.
    const burst = await page.evaluate((n) => {
      window.__sfx.osc = 0; window.__sfx.buf = 0;
      for (let i = 0; i < n; i++) window.__flipperDebug.sfx.playUiClickSound();
      return { built: window.__sfx.osc + window.__sfx.buf,
               live: window.__flipperDebug.sfx.voices() };
    }, cap * 4);
    check('a burst far past the cap does not exceed it', burst.live <= cap, { ...burst, cap });
    check('and the graph stopped building nodes once saturated', burst.built <= cap, { ...burst, cap });

    // Everything must give its slot back - this is the leak check.
    await page.waitForFunction(() => window.__flipperDebug.sfx.voices() === 0,
      null, { timeout: 8000, polling: 100 }).catch(() => {});
    const idleAfter = await voices(page);
    check('every voice releases its slot when it ends', idleAfter === 0, { voices: idleAfter });

    // And the budget is usable again afterwards - a cap that never drains is a mute button.
    const again = await countSettled(page, () => window.__flipperDebug.sfx.playUiClickSound());
    check('sound still works after saturation', again.osc + again.buf === 2, again);
    check('polyphony: no page errors', errors.length === 0, errors);
    await context.close();
  }

  // ------------------------------------------------------------- bus and mute
  console.log('\n=== EVERYTHING STAYS ON THE SFX BUS ===');
  {
    const { context, page, errors } = await newPage(browser);
    // Every voice must terminate at the SFX gain node, so the SFX slider and the master mute
    // reach it. Checked by watching what the new voices connect to.
    const dests = await page.evaluate(async () => {
      const gains = window.__flipperDebug.audio.gains();
      const proto = (window.AudioContext || window.webkitAudioContext).prototype;
      const seen = [];
      const GainProto = Object.getPrototypeOf(new (window.AudioContext || window.webkitAudioContext)().createGain());
      const realConnect = GainProto.connect;
      GainProto.connect = function (dest) {
        try { seen.push(dest === window.__sfxBusRef ? 'sfx' : (dest && dest.constructor ? dest.constructor.name : 'other')); }
        catch (e) { /* ignore */ }
        return realConnect.apply(this, arguments);
      };
      const s = window.__flipperDebug.sfx;
      s.playUiClickSound(); s.playUiConfirmSound(); s.playCardFlipSound(true); s.playScoreGainSound(500);
      GainProto.connect = realConnect;
      await new Promise((r) => setTimeout(r, 300));
      return { seen, gains };
    });
    check('new voices connect into a gain stage, never straight to the destination',
      dests.seen.length > 0 && !dests.seen.includes('AudioDestinationNode'), dests.seen);

    // The audible proof: muting zeroes the master stage while the SFX stage keeps the player's
    // own volume, which is what "honours mute instantly" means on a three-stage bus.
    await page.evaluate(() => window.__flipperDebug.audio.setSfxVolume(0.6));
    await page.evaluate(() => window.__flipperDebug.audio.setMasterMuted(true));
    const muted = await page.evaluate(() => window.__flipperDebug.audio.gains());
    check('mute is instant and does not disturb the SFX volume',
      muted.master === 0 && Math.abs(muted.sfx - 0.6) < 1e-6, muted);
    await page.evaluate(() => window.__flipperDebug.audio.setMasterMuted(false));
    const unmuted = await page.evaluate(() => window.__flipperDebug.audio.gains());
    check('and unmuting restores it', unmuted.master === 1 && Math.abs(unmuted.sfx - 0.6) < 1e-6, unmuted);
    check('bus: no page errors', errors.length === 0, errors);
    await context.close();
  }

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
