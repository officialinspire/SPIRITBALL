// SPIRITBALL vision-selection feedback guard.
//
// Selecting a vision used to change only TEXT. Nothing on the playfield moved, so the objective's
// own hardware - the thing the player now has to aim at - looked exactly as it had a moment
// earlier. "HIT THE POP BUMPERS" is only useful if you already know which lumps on the table are
// pop bumpers.
//
// The pass lights the objective's elements once, briefly, and this file guards the three ways that
// can go wrong:
//
//   1. THE CUE DOESN'T FIRE, or fires on the wrong hardware. Each of the three visions is started
//      for real (a staged ball into that target) and the elements are watched by emissive level.
//   2. THE CUE STICKS. A cue that does not fully restore becomes exactly the permanent marker this
//      pass was told not to create, so every element is checked back at its resting value.
//   3. THE CUE SPREADS. Selecting the bumper vision must not light the lanes. Non-objective
//      hardware is watched alongside the objective's and must stay put.
//
// It also pins the timing budget - "understand what to hit next within ~1 second" - and that the
// mechanics the pass was not allowed to touch are unchanged.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/mission-select-feedback.js
//   PORT=8971 node qa/mission-select-feedback.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8971;
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

// Which playfield hardware each vision index owns, and what it must NOT disturb. Index order is
// MISSION_DEFS' own: 0 bumper, 1 comet, 2 lane.
// The bumper objective is watched on the CAPS, because that is the shared material the cue lifts -
// see cueMissionObjective()'s own comment on why it deliberately avoids the per-bumper materials
// the hit reaction owns. The bumper BODIES are watched too, as non-objective hardware: if the cue
// ever moves back onto them it reintroduces the stuck-bright bug, and this catches that.
const OBJECTIVE = [
  ['bumper0Cap', 'bumper1Cap', 'bumper2Cap', 'bumper3Cap'],
  ['comet'],
  ['reentryLane0', 'reentryLane1', 'reentryLane2']
];
const ALL_WATCHED = ['bumper0Cap', 'bumper1Cap', 'bumper2Cap', 'bumper3Cap',
                     'bumper0', 'bumper1', 'bumper2', 'bumper3', 'comet',
                     'reentryLane0', 'reentryLane1', 'reentryLane2'];

let passed = 0, failed = 0;
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  OK   ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
  else { failed++; console.log('  FAIL ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
}

async function runSelection(browser, index) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(2200);
  await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
  await page.waitForTimeout(2200);

  const result = await page.evaluate(async ({ index, watched }) => {
    const cfg = await import('./js/config.js');
    const dbg = window.__flipperDebug, scene = dbg.scene;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const level = (n) => {
      const m = scene.getMeshByName(n);
      if (!m || !m.material || !m.material.emissiveColor) return null;
      const e = m.material.emissiveColor;
      return +(e.r + e.g + e.b).toFixed(4);
    };
    const rest = Object.fromEntries(watched.map((n) => [n, level(n)]));
    // Mission-target lamp levels too - they pulse while idle and must go steady on selection,
    // which is the previous pass' behaviour this one must not have broken.
    const targetLamp = (i) => level('missionTarget' + i + 'Lamp');

    const t = scene.getMeshByName('missionTarget' + index);
    const targetY0 = +t.position.y.toFixed(5);
    const ball = dbg.mainBall, body = ball.aggregate.body;
    const from = t.absolutePosition.clone(); from.z -= 0.05; from.y = 0.0135;
    ball.mesh.setAbsolutePosition(from);
    ball.mesh.computeWorldMatrix(true);
    body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
    body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.9));

    const t0 = performance.now();
    const peak = Object.fromEntries(watched.map((n) => [n, 0]));
    const cuePeak = Object.fromEntries(watched.map((n) => [n, 0]));
    const litFrom = {}, litTo = {};
    let startedName = null, startedAtMs = -1, msgAtStart = null;
    let scoreAtStart = null, requiredAtStart = null, progressAtStart = null;
    const readScore = () => parseInt(document.getElementById('hud-score').textContent, 10) || 0;
    let targetLampsDuringVision = null;
    // Latched, because the drop is transient: the flag sinks, then the bank resets and pops it
    // back up. Reading position.y at the END of the run reported "never dropped" for all three.
    let everDropped = false;

    for (let k = 0; k < 170; k++) {
      const now = performance.now() - t0;
      watched.forEach((n) => {
        const v = level(n);
        if (v === null) return;
        peak[n] = Math.max(peak[n], v);
        // A separate, WINDOWED peak used for the no-clutter check. Watching the whole run cannot
        // tell a cue from a legitimate hit: measured, the comet vision "spread to reentryLane0"
        // because the ball rolled through that lane seconds later. Restricted to the first 250ms
        // after selection - long enough to contain any cue, too short for the ball to have
        // travelled to unrelated hardware.
        if (startedName && now - startedAtMs <= 250) cuePeak[n] = Math.max(cuePeak[n], v);
        const lifted = v > rest[n] * 1.25 + 0.02;
        if (lifted && litFrom[n] === undefined) litFrom[n] = now;
        if (!lifted && litFrom[n] !== undefined && litTo[n] === undefined) litTo[n] = now;
      });
      if (!startedName && window.__backglassDebug.missionName) {
        startedName = window.__backglassDebug.missionName;
        startedAtMs = now;
        msgAtStart = window.__backglassDebug.message;
        scoreAtStart = readScore();
        requiredAtStart = window.__backglassDebug.missionRequired;
        progressAtStart = window.__backglassDebug.missionProgress;
      }
      if (+t.position.y.toFixed(5) < targetY0) everDropped = true;
      await sleep(12);
    }
    // Sampled AFTER the duration loop, never inside it. The first version ran this 720ms block
    // in the middle of the sampling loop, which starved every duration reading and reported the
    // 620ms cue as 1270-1286ms - a timing failure invented entirely by the probe.
    {
      const s = [[], [], []];
      for (let q = 0; q < 12; q++) { for (let i = 0; i < 3; i++) s[i].push(targetLamp(i)); await sleep(60); }
      targetLampsDuringVision = s.map((v) => +(Math.max(...v) - Math.min(...v)).toFixed(4));
    }
    return {
      rest, peak, cuePeak, after: Object.fromEntries(watched.map((n) => [n, level(n)])),
      durations: Object.fromEntries(watched.map((n) => [n,
        (litFrom[n] !== undefined && litTo[n] !== undefined) ? Math.round(litTo[n] - litFrom[n]) : -1])),
      startedName, startedAtMs: Math.round(startedAtMs), msgAtStart,
      scoreAtStart, requiredAtStart, progressAtStart,
      targetLampsDuringVision,
      targetDropped: everDropped,
      targetHasBody: !!t.physicsBody,
      consts: { cue: cfg.MISSION_CUE_MS, msg: cfg.MISSION_SELECT_MESSAGE_MS,
                name: cfg.MISSION_DEFS[index].name, objective: cfg.MISSION_DEFS[index].objective }
    };
  }, { index, watched: ALL_WATCHED });

  await page.close();
  return { ...result, pageErrors };
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await runSelection(browser, i));

  for (let i = 0; i < 3; i++) {
    const r = runs[i];
    const mine = OBJECTIVE[i];
    const others = ALL_WATCHED.filter((n) => !mine.includes(n));
    console.log(`\n=== INDEX ${i}: ${r.consts.name} ===`);
    console.log('  started at ' + r.startedAtMs + 'ms   message: ' + JSON.stringify(r.msgAtStart));
    mine.forEach((n) => console.log('    [objective] ' + n.padEnd(14)
      + 'rest ' + String(r.rest[n]).padStart(8) + '  peak ' + String(r.peak[n]).padStart(8)
      + '  after ' + String(r.after[n]).padStart(8) + '  lit ' + r.durations[n] + 'ms'));

    check(`index ${i} starts the right vision`, r.startedName === r.consts.name,
      { got: r.startedName, expected: r.consts.name });
    check(`index ${i} message carries BOTH the name and the objective`,
      typeof r.msgAtStart === 'string' && r.msgAtStart.includes(r.consts.name)
        && r.msgAtStart.includes(r.consts.objective), { msg: r.msgAtStart });

    // 1. the cue fires on the objective's own hardware
    check(`index ${i} lights every element of its objective`,
      mine.every((n) => r.peak[n] > r.rest[n] * 1.25 + 0.02),
      Object.fromEntries(mine.map((n) => [n, { rest: r.rest[n], peak: r.peak[n] }])));

    // 2. it does not stick
    check(`index ${i} restores every element to rest (no permanent marker)`,
      mine.every((n) => Math.abs(r.after[n] - r.rest[n]) < 1e-4),
      Object.fromEntries(mine.map((n) => [n, { rest: r.rest[n], after: r.after[n] }])));

    // 3. it does not spread to hardware the objective does not own
    const spread = others.filter((n) => r.cuePeak[n] > r.rest[n] * 1.25 + 0.02);
    check(`index ${i} leaves non-objective hardware alone (no clutter)`, spread.length === 0,
      Object.fromEntries(spread.map((n) => [n, { rest: r.rest[n], peak: r.peak[n] }])));

    // timing budget
    const durs = mine.map((n) => r.durations[n]).filter((d) => d > 0);
    check(`index ${i} cue is long enough to notice and short enough to stay a cue`,
      durs.length === mine.length && durs.every((d) => d >= r.consts.cue * 0.8 && d <= 1000),
      { durations: durs, configured: r.consts.cue });

    // the previous pass' invitation pulse must have stopped
    check(`index ${i} stops the mission targets pulsing once a vision is running`,
      r.targetLampsDuringVision && r.targetLampsDuringVision.every((s) => s <= 0.05),
      r.targetLampsDuringVision);

    check(`index ${i} raises no page errors`, r.pageErrors.length === 0, r.pageErrors);
  }

  console.log('\n=== CUE TIMING IS CONSISTENT ACROSS OBJECTIVES ===');
  // The first version borrowed pulseBumperLamp() for the bumper branch, which gave that objective
  // a 90ms blink against the lanes' 620ms - the one vision a new player is most likely to be shown
  // first was also the one whose cue was easiest to miss. This is what stops that returning.
  const perIndex = runs.map((r, i) => {
    const d = OBJECTIVE[i].map((n) => r.durations[n]).filter((x) => x > 0);
    return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : -1;
  });
  console.log('  mean lit duration per objective: ' + JSON.stringify(perIndex) + ' ms');
  check('no objective is cued for less than half as long as another',
    Math.min(...perIndex) > 0 && Math.max(...perIndex) / Math.min(...perIndex) < 2,
    { perIndex, ratio: +(Math.max(...perIndex) / Math.min(...perIndex)).toFixed(2) });
  check('every cue resolves inside the one-second understanding budget',
    perIndex.every((d) => d > 0 && d <= 1000), perIndex);

  console.log('\n=== MECHANICS UNCHANGED ===');
  runs.forEach((r, i) => {
    check(`index ${i} still scores and drops its target`,
      r.scoreAtStart > 0 && r.targetDropped === true,
      { score: r.scoreAtStart, dropped: r.targetDropped });
    check(`index ${i} still starts at progress 0 with a real requirement`,
      r.progressAtStart === 0 && r.requiredAtStart > 0,
      { progress: r.progressAtStart, required: r.requiredAtStart });
    check(`index ${i} target keeps its physics body`, r.targetHasBody === true);
  });

  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
