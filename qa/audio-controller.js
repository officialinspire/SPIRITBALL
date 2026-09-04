// SPIRITBALL audio-controller guard (Phase 1).
//
// Covers the properties that are easy to break silently and impossible to see in a screenshot:
// the three gain stages and how mute/volumes compose across them, the autoplay rule (no
// AudioContext before a real gesture), the load cache (no duplicate fetch/decode for one track),
// single-source playback (no overlapping copies of the same track), cancellable crossfades, and
// defensive persistence including the legacy 'spiritball-muted' migration.
//
// Network requests for the two MP3s are counted per URL, which is how "no duplicate fetches" is
// asserted rather than assumed.
//
// Usage:
//   python3 -m http.server 8991            (serve the repo root, from any directory)
//   node qa/audio-controller.js
//   PORT=8991 node qa/audio-controller.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8991;
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

const audio = (page, fn, arg) => page.evaluate(fn, arg);

// Decoding a 2.7MB MP3 takes multiple seconds on this CI CPU, and varies run to run. Polling for
// the expected state rather than sleeping a fixed time is what keeps these assertions about the
// CONTROLLER instead of about the decoder's speed - a fixed sleep here produced false failures
// that the same build passed with a longer one.
async function waitForTrack(page, key, timeoutMs = 25000) {
  try {
    await page.waitForFunction((want) => {
      const s = window.__flipperDebug.audio.musicState();
      return want === null ? s.key === null : s.key === want;
    }, key, { timeout: timeoutMs, polling: 120 });
  } catch (e) { /* fall through - the caller asserts on the state it reads next */ }
  return audio(page, () => window.__flipperDebug.audio.musicState());
}

async function newPage(browser, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  const musicRequests = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (/\.mp3(\?|$)/i.test(r.url())) musicRequests.push(decodeURIComponent(r.url())); });
  if (opts.seedStorage) {
    await context.addInitScript(opts.seedStorage);
  }
  await page.goto(`${BASE}?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__flipperDebug && window.__flipperDebug.audio), null, { timeout: 40000 });
  return { context, page, errors, musicRequests };
}

(async () => {
  const browser = await chromium.launch(LAUNCH);

  // ---------------------------------------------------------------- autoplay + defaults
  console.log('\n=== NO AUDIO BEFORE A REAL GESTURE ===');
  {
    const { context, page, errors, musicRequests } = await newPage(browser);
    await page.waitForTimeout(2500);
    const before = await audio(page, () => window.__flipperDebug.audio.musicState());
    check('no AudioContext exists before any gesture', before.contextState === null, before);
    check('no music was fetched before any gesture', musicRequests.length === 0, musicRequests);

    // A scene asked for pre-gesture must be remembered, not played, and must not build a context.
    await audio(page, () => window.__flipperDebug.audio.setAudioScene('menu'));
    await page.waitForTimeout(400);
    const queued = await audio(page, () => ({
      state: window.__flipperDebug.audio.musicState(),
      scene: window.__flipperDebug.audio.getAudioScene(),
      unlocked: window.__flipperDebug.audio.isAudioUnlocked()
    }));
    check('setAudioScene before a gesture creates no AudioContext', queued.state.contextState === null, queued.state);
    check('setAudioScene before a gesture records the scene', queued.scene === 'menu' && !queued.unlocked, queued);
    check('no page errors before any gesture', errors.length === 0, errors);
    await context.close();
  }

  // ---------------------------------------------------------------- unlock, buses, scenes
  console.log('\n=== GAIN STAGES AND SCENES ===');
  {
    const { context, page, errors, musicRequests } = await newPage(browser);
    // A real gesture, then unlock from inside that gesture's task.
    await page.evaluate(() => {
      window.__unlockResult = null;
      document.addEventListener('pointerdown', () => {
        window.__unlockResult = window.__flipperDebug.audio.unlockAudio();
      }, { once: true });
    });
    await page.mouse.click(450, 350);
    await page.waitForTimeout(300);
    const unlocked = await audio(page, () => ({
      result: window.__unlockResult,
      unlocked: window.__flipperDebug.audio.isAudioUnlocked(),
      gains: window.__flipperDebug.audio.gains(),
      state: window.__flipperDebug.audio.musicState()
    }));
    check('unlockAudio() from a gesture builds the context', unlocked.result === true && unlocked.unlocked, {
      result: unlocked.result, ctx: unlocked.state.contextState });
    check('three gain stages exist', unlocked.gains.master !== null && unlocked.gains.music !== null
      && unlocked.gains.sfx !== null, unlocked.gains);

    // Independent volumes.
    await audio(page, () => { window.__flipperDebug.audio.setMusicVolume(0.3); window.__flipperDebug.audio.setSfxVolume(0.8); });
    let g = await audio(page, () => ({ gains: window.__flipperDebug.audio.gains(),
      music: window.__flipperDebug.audio.getMusicVolume(), sfx: window.__flipperDebug.audio.getSfxVolume() }));
    check('music and SFX volumes are independent', Math.abs(g.gains.music - 0.3) < 1e-6
      && Math.abs(g.gains.sfx - 0.8) < 1e-6, g.gains);
    check('volume getters agree with the gain nodes', Math.abs(g.music - 0.3) < 1e-6 && Math.abs(g.sfx - 0.8) < 1e-6, g);

    // Out-of-range input is clamped rather than written into a gain node.
    await audio(page, () => { window.__flipperDebug.audio.setMusicVolume(9); window.__flipperDebug.audio.setSfxVolume(-4); });
    g = await audio(page, () => window.__flipperDebug.audio.gains());
    check('volumes clamp to 0-1', g.music === 1 && g.sfx === 0, g);
    await audio(page, () => { window.__flipperDebug.audio.setMusicVolume(0.5); window.__flipperDebug.audio.setSfxVolume(1); });

    // Master mute is one multiplication at the end - the two bus volumes are untouched by it.
    await audio(page, () => window.__flipperDebug.audio.setMasterMuted(true));
    g = await audio(page, () => ({ gains: window.__flipperDebug.audio.gains(), muted: window.__flipperDebug.audio.isMasterMuted() }));
    check('master mute zeroes the master stage only', g.gains.master === 0 && g.gains.music === 0.5
      && g.gains.sfx === 1 && g.muted === true, g);
    await audio(page, () => window.__flipperDebug.audio.setMasterMuted(false));
    g = await audio(page, () => window.__flipperDebug.audio.gains());
    check('unmute restores the master stage', g.master === 1, g);

    // Scenes.
    await audio(page, () => window.__flipperDebug.audio.setAudioScene('menu'));
    const menu = await waitForTrack(page, 'cosmicDrift');
    check('menu scene plays the menu track', menu.key === 'cosmicDrift', menu);
    check('menu track faded in rather than starting at full gain', menu.trackGain > 0, menu);

    await audio(page, () => window.__flipperDebug.audio.setAudioScene('gameplay'));
    const play = await waitForTrack(page, 'multiverseVelocity');
    check('gameplay scene crossfades to the gameplay track', play.key === 'multiverseVelocity', play);

    // paused must DUCK the same source, not restart it - a new source would show as a new
    // cachedBuffers-independent restart and a gain jump back to 0.
    await audio(page, () => window.__flipperDebug.audio.setAudioScene('paused'));
    await page.waitForTimeout(1800); // a duck is a ramp on the LIVE source - no load to wait on
    const paused = await audio(page, () => window.__flipperDebug.audio.musicState());
    check('paused ducks the same track instead of restarting it',
      paused.key === 'multiverseVelocity' && paused.duck < 1 && paused.trackGain < play.trackGain + 0.01, paused);

    await audio(page, () => window.__flipperDebug.audio.setAudioScene('silent'));
    const silent = await waitForTrack(page, null);
    check('silent scene stops music', silent.key === null, silent);

    // Both tracks were used; each must have been fetched exactly once.
    const perUrl = {};
    musicRequests.forEach((u) => { const f = u.split('/').pop(); perUrl[f] = (perUrl[f] || 0) + 1; });
    const dupes = Object.entries(perUrl).filter(([, n]) => n > 1);
    check('each track was fetched exactly once (no duplicate fetches)', dupes.length === 0, perUrl);
    check('both tracks resolved from the cache, not re-decoded', silent.cachedBuffers === 2, { cachedBuffers: silent.cachedBuffers });
    check('no page errors across the whole scene cycle', errors.length === 0, errors);
    await context.close();
  }

  // ---------------------------------------------------------------- no overlapping copies
  console.log('\n=== NO DUPLICATE SOURCES OR OVERLAPPING COPIES ===');
  {
    const { context, page, errors, musicRequests } = await newPage(browser);
    await page.evaluate(() => {
      document.addEventListener('pointerdown', () => window.__flipperDebug.audio.unlockAudio(), { once: true });
    });
    await page.mouse.click(450, 350);
    await page.waitForTimeout(200);

    // Hammer the same scene, then thrash between scenes mid-fade. Neither may start a second
    // copy of a track or a second fetch.
    await audio(page, () => {
      const a = window.__flipperDebug.audio;
      for (let i = 0; i < 12; i++) a.setAudioScene('gameplay');
    });
    const same = await waitForTrack(page, 'multiverseVelocity');
    check('repeating the current scene keeps one source', same.key === 'multiverseVelocity', same);

    await audio(page, () => {
      const a = window.__flipperDebug.audio;
      a.setAudioScene('menu'); a.setAudioScene('gameplay'); a.setAudioScene('menu');
      a.setAudioScene('gameplay'); a.setAudioScene('menu');
    });
    const thrash = await waitForTrack(page, 'cosmicDrift');
    await page.waitForTimeout(600); // let the fade-in get off zero before reading its gain
    check('rapid scene changes settle on the last one requested', thrash.key === 'cosmicDrift', thrash);
    check('a cancelled fade does not leave the track silent', thrash.trackGain > 0, thrash);

    const perUrl = {};
    musicRequests.forEach((u) => { const f = u.split('/').pop(); perUrl[f] = (perUrl[f] || 0) + 1; });
    const dupes = Object.entries(perUrl).filter(([, n]) => n > 1);
    check('thrashing scenes never re-fetches a track', dupes.length === 0, perUrl);
    check('no page errors while thrashing scenes', errors.length === 0, errors);
    await context.close();
  }

  // ---------------------------------------------------------------- persistence + migration
  console.log('\n=== PERSISTENCE AND LEGACY MIGRATION ===');
  {
    const { context, page } = await newPage(browser, {
      seedStorage: () => {
        try {
          localStorage.clear();
          localStorage.setItem('spiritball-muted', 'true'); // the ONLY key a pre-Phase-1 build wrote
        } catch (e) { /* ignore */ }
      }
    });
    const migrated = await audio(page, () => window.__flipperDebug.audio.isMasterMuted());
    check('a legacy spiritball-muted value is adopted, not ignored', migrated === true, { muted: migrated });

    await audio(page, () => {
      const a = window.__flipperDebug.audio;
      a.setMasterMuted(false); a.setMusicVolume(0.42); a.setSfxVolume(0.66);
    });
    const stored = await audio(page, () => ({
      newKey: localStorage.getItem('spiritball-audio-muted'),
      legacy: localStorage.getItem('spiritball-muted'),
      music: localStorage.getItem('spiritball-audio-music-volume'),
      sfx: localStorage.getItem('spiritball-audio-sfx-volume')
    }));
    check('mute persists under the new key', stored.newKey === 'false', stored);
    check('the legacy key is kept in sync for older cached builds', stored.legacy === 'false', stored);
    check('music and SFX volumes persist', stored.music === '0.42' && stored.sfx === '0.66', stored);
    await context.close();
  }
  {
    // Fresh page: the persisted values must be applied to the buses on unlock.
    const { context, page } = await newPage(browser, {
      seedStorage: () => {
        try {
          localStorage.setItem('spiritball-audio-music-volume', '0.42');
          localStorage.setItem('spiritball-audio-sfx-volume', '0.66');
          localStorage.setItem('spiritball-audio-muted', 'false');
        } catch (e) { /* ignore */ }
      }
    });
    await page.evaluate(() => {
      document.addEventListener('pointerdown', () => window.__flipperDebug.audio.unlockAudio(), { once: true });
    });
    await page.mouse.click(450, 350);
    await page.waitForTimeout(300);
    const g = await audio(page, () => window.__flipperDebug.audio.gains());
    check('persisted volumes are applied to the buses on unlock',
      Math.abs(g.music - 0.42) < 1e-6 && Math.abs(g.sfx - 0.66) < 1e-6, g);
    await context.close();
  }
  {
    // A hostile/garbage stored value must fall back, not poison a gain node.
    const { context, page } = await newPage(browser, {
      seedStorage: () => {
        try {
          localStorage.setItem('spiritball-audio-music-volume', 'not-a-number');
          localStorage.setItem('spiritball-audio-sfx-volume', '999');
        } catch (e) { /* ignore */ }
      }
    });
    const v = await audio(page, () => ({ music: window.__flipperDebug.audio.getMusicVolume(),
                                         sfx: window.__flipperDebug.audio.getSfxVolume() }));
    check('a non-numeric stored volume falls back to the default', v.music > 0 && v.music <= 1, v);
    check('an out-of-range stored volume is clamped', v.sfx === 1, v);
    await context.close();
  }

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
