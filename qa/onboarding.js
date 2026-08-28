// SPIRITBALL first-play readability guard.
//
// The brief was to make a new player understand the game without a tutorial screen, using only
// what already exists. So the thing worth guarding is not "is there a hint" but "does the hint
// track the state the player is actually in" - a static instruction is just a tutorial page that
// never closes, and a contextual one that stops updating is worse than none.
//
// What a new player has to pick up, and where each is answered:
//   launch ball        title-screen hint, then the backglass VISION window while a ball waits
//   flippers           title-screen hint (already present before this pass)
//   glowing targets    the mission-target lamps PULSE while no vision is running
//   vision objective   the same backglass window, which the running vision takes over
//   score / lives      the player HUD, already labelled Score and Balls
//   pause              title-screen hint plus the always-visible pause button
//
// This file walks that whole sequence in one boot and asserts the window says the right thing at
// each step, that the lamps invite and then stop inviting, and that nothing modal was added.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/onboarding.js
//   PORT=8971 node qa/onboarding.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8971;
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

let passed = 0, failed = 0;
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  OK   ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
  else { failed++; console.log('  FAIL ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });

  // ---------------------------------------------------------------- title screen
  console.log('\n=== TITLE SCREEN TEACHES THE CONTROLS ===');
  const menu = await page.evaluate(() => {
    const el = document.querySelector('.title-hint');
    const overlay = document.getElementById('menu-overlay');
    return {
      visible: !!overlay && getComputedStyle(overlay).display !== 'none',
      desktop: el ? (el.querySelector('.hint-desktop') || {}).textContent : null,
      touch: el ? (el.querySelector('.hint-touch') || {}).textContent : null,
      start: (document.getElementById('menu-start-label') || {}).textContent,
      touchControls: document.documentElement.dataset.touchControls
    };
  });
  console.log('  ' + JSON.stringify(menu));
  check('the title screen is showing on first load', menu.visible === true);
  check('the desktop hint names flippers, launch and pause',
    /FLIPPER/i.test(menu.desktop) && /LAUNCH/i.test(menu.desktop) && /PAUSE/i.test(menu.desktop),
    { hint: menu.desktop });
  check('the touch hint names flip and launch',
    /FLIP/i.test(menu.touch) && /LAUNCH/i.test(menu.touch), { hint: menu.touch });
  check('the start prompt says how to start', /START/i.test(menu.start || ''), { start: menu.start });

  // ---------------------------------------------------------------- ball waiting to launch
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2600);
  console.log('\n=== BALL WAITING: THE BACKGLASS SAYS HOW TO LAUNCH ===');
  const ready = await page.evaluate(() => {
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const lamp = (i) => { const m = scene.getMeshByName('missionTarget' + i + 'Lamp');
      if (!m) return null; const e = m.material.emissiveColor; return +(e.r + e.g + e.b).toFixed(4); };
    return { hint: window.__backglassDebug.idleHint, lamps: [lamp(0), lamp(1), lamp(2)],
             menuGone: getComputedStyle(document.getElementById('menu-overlay')).display === 'none',
             inPlay: window.__flipperDebug.isBallInPlay(),
             touchControls: document.documentElement.dataset.touchControls };
  });
  check('the title screen is gone (the hint has to survive it)', ready.menuGone === true);
  check('the ball is not yet in play', ready.inPlay === false);
  check('the backglass window tells the player to launch',
    typeof ready.hint === 'string' && /LAUNCH/i.test(ready.hint), { hint: ready.hint });
  check('the wording matches the controls this device actually shows',
    ready.touchControls === 'on' ? /BUTTON/i.test(ready.hint) : /SPACE/i.test(ready.hint),
    { touchControls: ready.touchControls, hint: ready.hint });
  check('the launch instruction is short enough to read at a glance (<= 22 chars)',
    ready.hint.length <= 22, { len: ready.hint.length, hint: ready.hint });

  // ---------------------------------------------------------------- targets invite a shot
  console.log('\n=== MISSION TARGETS INVITE A SHOT WHILE NO VISION RUNS ===');
  const pulse = await page.evaluate(async () => {
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const lamp = (i) => { const m = scene.getMeshByName('missionTarget' + i + 'Lamp');
      if (!m) return null; const e = m.material.emissiveColor; return +(e.r + e.g + e.b).toFixed(4); };
    // A PULSE is only real if the value MOVES. Sampled across more than one full period
    // (LAMP_PULSE_PERIOD_MS is 1100) so a slow sine cannot be mistaken for a static value.
    const seen = [[], [], []];
    for (let k = 0; k < 26; k++) { for (let i = 0; i < 3; i++) seen[i].push(lamp(i)); await sleep(70); }
    return seen.map((v) => ({ min: Math.min(...v), max: Math.max(...v), swing: +(Math.max(...v) - Math.min(...v)).toFixed(4) }));
  });
  pulse.forEach((p, i) => console.log('  target ' + i + '  ' + JSON.stringify(p)));
  check('all three targets are visibly pulsing, not statically lit',
    pulse.every((p) => p.swing > 0.05), pulse.map((p) => p.swing));

  // ---------------------------------------------------------------- in play, still no vision
  await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
  await page.waitForTimeout(2000);
  console.log('\n=== BALL IN PLAY, NO VISION: THE WINDOW SAYS WHAT TO AIM AT ===');
  const inPlay = await page.evaluate(() => ({ hint: window.__backglassDebug.idleHint,
    inPlay: window.__flipperDebug.isBallInPlay() }));
  check('the ball is in play', inPlay.inPlay === true);
  check('the window now points at the targets rather than the plunger',
    typeof inPlay.hint === 'string' && /TARGET/i.test(inPlay.hint), { hint: inPlay.hint });
  check('that instruction is short too (<= 22 chars)', inPlay.hint.length <= 22,
    { len: inPlay.hint.length, hint: inPlay.hint });

  // ---------------------------------------------------------------- vision takes the window
  console.log('\n=== A RUNNING VISION TAKES OVER THE WINDOW AND STOPS THE INVITATION ===');
  const active = await page.evaluate(async () => {
    const dbg = window.__flipperDebug, scene = dbg.scene;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = scene.getMeshByName('missionTarget1');
    const ball = dbg.mainBall, body = ball.aggregate.body;
    const from = t.absolutePosition.clone(); from.z -= 0.05; from.y = 0.0135;
    ball.mesh.setAbsolutePosition(from);
    ball.mesh.computeWorldMatrix(true);
    body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
    body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.9));
    for (let k = 0; k < 40 && !window.__backglassDebug.missionName; k++) await sleep(60);
    const lamp = (i) => { const m = scene.getMeshByName('missionTarget' + i + 'Lamp');
      if (!m) return null; const e = m.material.emissiveColor; return +(e.r + e.g + e.b).toFixed(4); };
    const seen = [[], [], []];
    for (let k = 0; k < 20; k++) { for (let i = 0; i < 3; i++) seen[i].push(lamp(i)); await sleep(70); }
    return { missionName: window.__backglassDebug.missionName, hint: window.__backglassDebug.idleHint,
             progress: window.__backglassDebug.missionProgress, required: window.__backglassDebug.missionRequired,
             swings: seen.map((v) => +(Math.max(...v) - Math.min(...v)).toFixed(4)) };
  });
  console.log('  ' + JSON.stringify(active));
  check('a vision actually started (the probe exercised the real path)',
    !!active.missionName, { name: active.missionName });
  check('the window is handed to the running vision (idle hint cleared)',
    active.hint === null || active.hint === undefined, { hint: active.hint });
  check('the vision shows a countable objective, not just a name',
    Number.isFinite(active.required) && active.required > 0,
    { progress: active.progress, required: active.required });
  check('the targets stop pulsing once the invitation is taken up',
    active.swings.every((s) => s <= 0.05), active.swings);

  // ---------------------------------------------------------------- score / lives / pause
  console.log('\n=== SCORE, LIVES AND PAUSE ARE ALREADY LEGIBLE ===');
  const hud = await page.evaluate(() => {
    const lab = (id) => {
      const el = document.getElementById(id);
      const block = el && el.closest('.hud-block');
      const l = block && block.querySelector('.hud-label');
      return { label: l ? l.textContent.trim() : null, value: el ? el.textContent.trim() : null,
               visible: !!block && getComputedStyle(block).display !== 'none' };
    };
    const pause = document.getElementById('pause-btn');
    return { score: lab('hud-score'), balls: lab('hud-lives'),
             pauseVisible: !!pause && getComputedStyle(pause).display !== 'none',
             pauseLabel: pause ? (pause.getAttribute('aria-label') || pause.title || '') : null };
  });
  console.log('  ' + JSON.stringify(hud));
  check('score is labelled and visible', hud.score.visible && /score/i.test(hud.score.label || ''), hud.score);
  check('lives are labelled and visible', hud.balls.visible && /ball/i.test(hud.balls.label || ''), hud.balls);
  check('the pause control is visible with an accessible name',
    hud.pauseVisible && /pause/i.test(hud.pauseLabel || ''), { visible: hud.pauseVisible, label: hud.pauseLabel });

  console.log('\n=== NO TUTORIAL SCREEN WAS ADDED ===');
  const modals = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog, .screen-overlay')]
      .map((e) => ({ id: e.id || e.className, shown: getComputedStyle(e).display !== 'none' }));
    return { dialogs, shownNow: dialogs.filter((d) => d.shown).map((d) => d.id) };
  });
  console.log('  overlays: ' + JSON.stringify(modals.dialogs.map((d) => d.id)));
  check('no overlay is on screen during play', modals.shownNow.length === 0, modals.shownNow);
  check('no new tutorial/help overlay exists in the document',
    !modals.dialogs.some((d) => /tutorial|howto|help|onboard/i.test(String(d.id))),
    modals.dialogs.map((d) => d.id));
  check('no uncaught page errors', pageErrors.length === 0, pageErrors);

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
