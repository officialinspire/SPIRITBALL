// SPIRITBALL end-of-ball flow guard.
//
// A ball change used to say one thing and then go quiet: 'DRAINED!', a silent delay, a bonus count
// that only happened if this ball had earned something, and then the ball silently reappearing at
// the plunger. Three of the four things a player needs at a ball change were missing or
// conditional. This file guards the four beats that replaced it, and the things they must not
// have cost:
//
//   1. THE BEATS MUST ALL HAPPEN, IN ORDER. BALL LOST -> BONUS -> STATE/VISION -> NEXT BALL, on a
//      ball that earned a bonus and on one that earned nothing (where the old flow had no bonus
//      beat at all).
//   2. THE SEQUENCE MUST NOT HANG. It is render-loop driven now, so a beat parked on a subsystem
//      that never signals back would block launch input for the rest of the run.
//   3. IT MUST STAY BRISK. The budget is pinned against the config constants, and the live run has
//      to reach a launchable ball rather than merely start.
//   4. IT MUST FREEZE WITH A PAUSE. That is the whole reason it is not a setTimeout chain.
//   5. MOBILE AND DESKTOP MUST BE IDENTICAL. The same drain is run at a phone viewport with touch
//      controls on, and the beat/message sequence is compared against desktop's.
//   6. SCORING MUST BE UNCHANGED. The bonus still pays exactly points * multiplierX, once.
//
// Timing note: this sandbox renders at ~1.6fps, so wall-clock beat durations are quantised to
// whole frames and are useless as assertions. Beat LENGTHS are therefore read from the sequence's
// own remainingMs at beat entry (which is the configured value, untouched by frame rate) and the
// wall-clock side is asserted only as "it finished at all, inside a generous ceiling".
//
// Usage:
//   python3 -m http.server 8973            (serve the repo root, from any directory)
//   node qa/end-of-ball.js
//   PORT=8973 node qa/end-of-ball.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8973;
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

// Beat identity comes from the sequence object, never from guessing at the message: several beats
// can produce similar-length strings, and "waiting on the bonus count" is invisible from outside.
const BEAT_NAME = { '-1': 'idle', 0: 'lost', 1: 'bonus', 2: 'state' };

async function newGamePage(browser, { touch = false } = {}) {
  const page = await browser.newPage({
    viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    hasTouch: touch, isMobile: touch
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug && !!window.__endOfBallDebug, null, { timeout: 40000 });
  await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height / 2);
  await page.waitForTimeout(2200);
  return { page, pageErrors };
}

// Stages a real Saturn contact so this ball has a real, non-zero bonus pool to pay out. Deliberately
// a staged HIT rather than writing ballBonus directly: the point is that the pool the sequence pays
// is the one real play fills, so the payout assertion below is measuring the shipped path.
const EARN_BONUS = `
  const dbg = window.__flipperDebug, scene = dbg.scene;
  const saturn = scene.getMeshByName('saturn');
  const ball = dbg.mainBall, body = ball.aggregate.body;
  const from = saturn.absolutePosition.clone(); from.z -= 0.06; from.y = 0.0135;
  ball.mesh.setAbsolutePosition(from);
  ball.mesh.computeWorldMatrix(true);
  body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
  body.setLinearVelocity(new BABYLON.Vector3(0, 0, 1.1));
`;

// Drives the ball into the real drain trigger with real velocity, stepping physics by hand so this
// costs negligible wall clock - the render-loop-driven sequence it kicks off then has its whole
// real-time window ahead of it. Same staging qa/regression-suite.js already uses.
const FORCE_DRAIN = `
  const dbg = window.__flipperDebug;
  const ball = dbg.mainBall;
  const engine = dbg.scene.getPhysicsEngine();
  const drainMesh = dbg.scene.getMeshByName('drainZone');
  const bounds = drainMesh.getBoundingInfo().boundingBox;
  ball.mesh.position.set(drainMesh.position.x, drainMesh.position.y, bounds.minimumWorld.z - 0.03);
  ball.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.5));
  ball.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
  for (let i = 0; i < 30 && dbg.isBallInPlay(); i++) {
    dbg.updateHitCooldowns(16);
    dbg.updateBallPhysics(ball, 16);
    engine._step(16 / 1000);
  }
`;

async function launchBall(page) {
  await page.keyboard.down('Space');
  await page.waitForTimeout(220);
  await page.keyboard.up('Space');
  await page.waitForTimeout(400);
}

// Every launch arms a BALL_SAVE_WINDOW_MS ball save, and a saved drain is deliberately NOT a ball
// change - no life, no sequence, none of the per-ball resets. The first version of this file drained
// straight after launching and measured 'BALL SAVED!' six times over, reporting the sequence as
// missing on every scenario. Waiting the 7s window out instead would leave a live ball loose on the
// table for seven seconds, scoring and possibly draining on its own, so the save is spent
// deliberately: drain once to consume it, let the ball come back, relaunch. armBallSave()'s own
// usedThisLife gate means the relaunch cannot re-arm it, so the NEXT drain is a real one.
//
// Asserted rather than assumed - if ball-save behaviour ever changes, this must fail loudly instead
// of quietly measuring the wrong drain.
async function launchWithBallSaveSpent(page, label) {
  await launchBall(page);
  const livesBefore = await page.evaluate(() => parseInt(document.getElementById('hud-lives').textContent, 10));
  await page.evaluate(FORCE_DRAIN);
  const saved = await page.waitForFunction(
    () => window.__backglassDebug.message === 'BALL SAVED!', null, { timeout: 4000, polling: 50 }
  ).then(() => true).catch(() => false);
  await page.waitForFunction(
    () => Math.abs(window.__flipperDebug.mainBall.mesh.position.y) < 0.05, null, { timeout: 8000, polling: 60 }
  );
  await page.waitForTimeout(300);
  const livesAfter = await page.evaluate(() => parseInt(document.getElementById('hud-lives').textContent, 10));
  check('[' + label + '] the launch ball save is spent, not a life', saved && livesAfter === livesBefore,
    { saved, livesBefore, livesAfter });
  await launchBall(page);
}

// Records the sequence from INSIDE the render loop, one guaranteed sample per frame, rather than
// from a setTimeout poll.
//
// The poll was the first version and it produced false failures on unchanged code: this sandbox
// renders at ~1.6fps with frame deltas up to 677ms, and a frame that long saturates the main
// thread, so timer callbacks land in whatever slack is left between frames rather than every 10ms.
// The sequence advances at most one beat per frame, so a beat lives for exactly one inter-frame
// gap - and the 380ms NO BONUS beat, which never spans more than one, was simply never sampled.
// Confirmed by running this file unchanged against the previous commit, where it failed the same
// checks (worse, in fact: 39/47 there against 42/47 here) - a test failing on code it passed on
// before is the test's bug.
//
// scene.onBeforeRenderObservable fires inside scene.render(), which the render loop calls AFTER
// its update block - so an observer here sees the post-update state of every single frame and
// cannot be starved. __flipperDebug.scene is exposed for exactly this ("so a test can hook
// scene.onBeforeRenderObservable for per-physics-tick sampling, immune to the render loop's own
// throttling under slow/headless rendering"). It also reads remainingMs at the true moment of
// entry, before any frame has decremented it, which the poll could only approximate.
//
// Armed BEFORE the drain: FORCE_DRAIN steps physics by hand and so starts the sequence
// synchronously inside its own evaluate, and the first beat should not have to survive until the
// recorder shows up.
async function armSequenceTrace(page) {
  await page.evaluate(() => {
    const seq = window.__endOfBallDebug.sequence, bg = window.__backglassDebug;
    const rec = {
      beats: [], messages: [], t0: performance.now(),
      lastBeat: null, lastMsg: null, sawActive: false, finishedAtMs: -1
    };
    rec.observer = window.__flipperDebug.scene.onBeforeRenderObservable.add(() => {
      const now = performance.now() - rec.t0;
      if (seq.active) rec.sawActive = true;
      const beat = seq.active ? seq.beat : -1;
      if (beat !== rec.lastBeat) {
        rec.beats.push({ beat, atMs: Math.round(now), lengthMs: Math.round(seq.remainingMs), waiting: seq.waiting });
        rec.lastBeat = beat;
      }
      if (bg.message && bg.message !== rec.lastMsg) {
        rec.messages.push({ text: bg.message, atMs: Math.round(now) });
        rec.lastMsg = bg.message;
      }
      if (rec.sawActive && !seq.active && rec.finishedAtMs < 0) rec.finishedAtMs = now;
    });
    window.__eobTrace = rec;
  });
}

// Waits for the sequence to finish, then reads the trace back and detaches the observer.
async function watchSequence(page, ceilingMs) {
  await page.waitForFunction(
    () => window.__eobTrace.sawActive && window.__eobTrace.finishedAtMs >= 0,
    null, { timeout: ceilingMs, polling: 100 }
  ).catch(() => {});
  // A short tail past the finish, so the NEXT BALL message - posted in the same statement that
  // clears the sequence - is captured by at least one more frame.
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const rec = window.__eobTrace;
    window.__flipperDebug.scene.onBeforeRenderObservable.remove(rec.observer);
    const seq = window.__endOfBallDebug.sequence;
    return {
      beats: rec.beats, messages: rec.messages,
      finishedAtMs: Math.round(rec.finishedAtMs),
      stillActive: seq.active,
      score: parseInt(document.getElementById('hud-score').textContent, 10) || 0,
      lives: parseInt(document.getElementById('hud-lives').textContent, 10) || 0,
      gameOverShown: getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none',
      ballAtPlunger: window.__flipperDebug.mainBall.mesh.position.y > 0.005
    };
  });
}

// Each beat's entry countdown against the constant that beat is supposed to arm. The BONUS beat is
// excluded while it is WAITING: it arms no countdown of its own at all when a real bonus is
// running (it parks on the count with remainingMs left at 0), and the NO BONUS branch is the only
// case where it owns a clock. The pre-drain idle sample carries no budget and is skipped.
function budgetOf(r, cfg) {
  const budget = { 0: cfg.lost, 2: cfg.state };
  const seen = [];
  let ok = true;
  r.beats.forEach((b) => {
    const cap = b.beat === 1 ? (b.waiting ? null : cfg.noBonus) : budget[b.beat];
    if (cap === null || cap === undefined) return;
    seen.push({ beat: BEAT_NAME[b.beat], armed: b.lengthMs, cap });
    if (!(b.lengthMs > 0 && b.lengthMs <= cap)) ok = false;
  });
  return { ok: ok && seen.length >= 2, seen };
}

// The beats of the SEQUENCE, which is not the same as every state the recorder saw. The trace is
// armed before the drain (so the first beat does not have to survive until the recorder shows up),
// which means its first entry is the idle state the game was already in. Dropping it here keeps
// that arming detail out of every assertion downstream - the trailing idle is kept, because "the
// sequence ended" is a real thing to assert.
function beatOrder(r) {
  const names = r.beats.map((b) => BEAT_NAME[b.beat]);
  return names[0] === 'idle' ? names.slice(1) : names;
}
function msgTexts(r) { return r.messages.map((m) => m.text); }

async function main() {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const cfg = {};
  {
    // Budget arithmetic, pinned against the real constants rather than restated here.
    const p = (await browser.newPage());
    await p.goto(`http://localhost:${PORT}/index.html?dev=1`, { waitUntil: 'load' });
    Object.assign(cfg, await p.evaluate(async () => {
      const c = await import('./js/config.js');
      return {
        lost: c.END_OF_BALL_LOST_MS, noBonus: c.END_OF_BALL_NO_BONUS_MS,
        state: c.END_OF_BALL_STATE_MS, nextBall: c.END_OF_BALL_NEXT_BALL_MS,
        ticks: c.BONUS_COUNT_TICKS, tickMs: c.BONUS_COUNT_TICK_MS, hold: c.BONUS_COUNT_HOLD_MS,
        reduced: c.BONUS_COUNT_REDUCED_MOTION_MS, major: c.BONUS_MAJOR_SHOT_AMOUNT,
        startingLives: c.STARTING_LIVES
      };
    }));
    await p.close();
  }

  console.log('\n=== BUDGET (config) ===');
  const bonusBeat = cfg.ticks * cfg.tickMs + cfg.hold;
  const toPlayableWithBonus = cfg.lost + bonusBeat + cfg.state;
  const toPlayableNoBonus = cfg.lost + cfg.noBonus + cfg.state;
  console.log(`  lost ${cfg.lost} | bonus ${bonusBeat} (or noBonus ${cfg.noBonus}) | state ${cfg.state} | nextBall ${cfg.nextBall} (not a step)`);
  console.log(`  drain -> launchable: ${toPlayableWithBonus}ms with a bonus, ${toPlayableNoBonus}ms without`);
  // The flow this replaced spent a fixed 1500ms silent delay plus a 720+500ms count before the
  // ball came back. Two more beats of information must not have made the ball change slower.
  check('brisk: reaching a launchable ball is no slower than the flow this replaced',
    toPlayableWithBonus <= 1500 + cfg.ticks * cfg.tickMs + 500 + 120,
    { now: toPlayableWithBonus, before: 1500 + cfg.ticks * cfg.tickMs + 500 });
  check('brisk: no beat is long enough to read as bookkeeping',
    [cfg.lost, cfg.noBonus, cfg.state, cfg.nextBall, bonusBeat].every((v) => v <= 1500),
    { lost: cfg.lost, noBonus: cfg.noBonus, state: cfg.state, nextBall: cfg.nextBall, bonus: bonusBeat });
  check('reduced motion still leaves the bonus readable',
    cfg.reduced >= 400 && cfg.reduced < bonusBeat, { reduced: cfg.reduced, animated: bonusBeat });

  // --- A ball that earned a bonus --------------------------------------------------------------
  console.log('\n=== BALL WITH A BONUS ===');
  let desktopWithBonus;
  {
    const { page, pageErrors } = await newGamePage(browser);
    await launchWithBallSaveSpent(page, 'bonus');
    await page.evaluate(EARN_BONUS);
    await page.waitForTimeout(1400);
    const before = await page.evaluate(() => ({
      score: parseInt(document.getElementById('hud-score').textContent, 10) || 0,
      total: window.__endOfBallDebug.bonusTotal()
    }));
    await armSequenceTrace(page);
    await page.evaluate(FORCE_DRAIN);
    const r = await watchSequence(page, 12000);
    desktopWithBonus = r;
    console.log('  beats  :', JSON.stringify(r.beats));
    console.log('  msgs   :', JSON.stringify(msgTexts(r)));

    check('a staged major shot really filled the bonus pool', before.total > 0, before);
    check('beats run BALL LOST -> BONUS -> STATE, in order',
      JSON.stringify(beatOrder(r)) === JSON.stringify(['lost', 'bonus', 'state', 'idle']), beatOrder(r));
    check('BALL LOST is the first thing said', msgTexts(r)[0] === 'BALL LOST', msgTexts(r)[0]);
    check('the bonus beat shows a running total, not a bare label',
      msgTexts(r).some((m) => /^BONUS x\d+: [\d,]+$/.test(m)), msgTexts(r).filter((m) => m.startsWith('BONUS')));
    check('the completed total is the LAST thing the bonus beat shows',
      /^BONUS x\d+: [\d,]+$/.test(msgTexts(r).filter((m) => m.startsWith('BONUS')).pop() || ''),
      msgTexts(r).filter((m) => m.startsWith('BONUS')).pop());
    check('STATE beat names the state and the vision progress',
      msgTexts(r).some((m) => /^STATE .+ VISION (READY|\d+\/\d+)$/.test(m)),
      msgTexts(r).find((m) => m.startsWith('STATE ')));
    // drawMessage() wraps greedily on ASCII spaces, so a multi-word rank name would be split
    // across the two lines - measured, COSMIC SELF with a vision running became ['STATE COSMIC',
    // 'SELF VISION 3/3']. The fix is that the rank goes in as ONE token. Asserted against the
    // panel's own rank string rather than by re-implementing the wrap here: a test that
    // duplicated drawMessage()'s fit loop would drift from it the first time that loop changed.
    // Trivially true at INITIATE, which is where a live run starts - the guard that bites is that
    // the substitution happens at all, so it is checked on the exact string the beat produced.
    {
      const stateMsg = msgTexts(r).find((m) => m.startsWith('STATE ')) || '';
      const rank = await page.evaluate(() => window.__backglassDebug.rank);
      const unbreakable = rank.replace(/ /g, String.fromCharCode(0x00a0));
      check('the STATE beat carries the rank as one unbreakable token',
        stateMsg.indexOf(unbreakable) >= 0 && (rank === unbreakable || stateMsg.indexOf(rank) < 0),
        { stateMsg: stateMsg.replace(/\u00a0/g, '<nbsp>'), rank });
    }
    check('NEXT BALL beat names the ball number',
      msgTexts(r).some((m) => new RegExp('^BALL \\d OF ' + cfg.startingLives + '$').test(m)),
      msgTexts(r).find((m) => m.startsWith('BALL ') && m !== 'BALL LOST'));
    check('the sequence ends, and ends with the ball back at the plunger',
      !r.stillActive && r.ballAtPlunger, { stillActive: r.stillActive, ballAtPlunger: r.ballAtPlunger });
    check('bonus paid exactly points x multiplier, once', r.score - before.score === before.total,
      { before: before.score, after: r.score, expected: before.total });
    check('a life was lost', r.lives === cfg.startingLives - 1, r.lives);
    // Not "the beat lasted 800ms" - at ~1.6fps a beat is one or two frames and its wall-clock
    // duration is frame time, not budget. What IS checkable here is that the machine never arms a
    // countdown LONGER than the constant it is supposed to use: lengthMs is remainingMs sampled
    // after entry, so it can only have been decremented, never inflated. A miswired constant (or a
    // beat re-arming itself) shows up as an entry countdown over budget.
    check('no beat arms a countdown longer than its configured budget',
      budgetOf(r, cfg).ok, budgetOf(r, cfg).seen);
    check('no page errors (ball with a bonus)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // --- A ball that earned nothing --------------------------------------------------------------
  console.log('\n=== BALL WITH NO BONUS ===');
  let desktopNoBonus;
  {
    const { page, pageErrors } = await newGamePage(browser);
    await launchWithBallSaveSpent(page, 'no bonus');
    await armSequenceTrace(page);
    await page.evaluate(FORCE_DRAIN);
    const r = await watchSequence(page, 12000);
    desktopNoBonus = r;
    console.log('  beats  :', JSON.stringify(beatOrder(r)));
    console.log('  msgs   :', JSON.stringify(msgTexts(r)));
    check('the bonus beat still happens on a ball that earned nothing',
      msgTexts(r).includes('NO BONUS'), msgTexts(r));
    check('all four beats are present', beatOrder(r).join(',') === 'lost,bonus,state,idle' &&
      msgTexts(r).some((m) => m.startsWith('STATE ')) &&
      msgTexts(r).some((m) => /^BALL \d OF \d$/.test(m)), { beats: beatOrder(r), msgs: msgTexts(r) });
    check('the sequence ends with the ball back at the plunger',
      !r.stillActive && r.ballAtPlunger, { stillActive: r.stillActive, ballAtPlunger: r.ballAtPlunger });
    check('no page errors (no bonus)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // --- Launch gating ---------------------------------------------------------------------------
  console.log('\n=== LAUNCH GATING ===');
  {
    const { page, pageErrors } = await newGamePage(browser);
    await launchWithBallSaveSpent(page, 'launch gating');
    await armSequenceTrace(page);
    await page.evaluate(FORCE_DRAIN);
    // Mid-sequence: the ball is still down the drain, so a launch here would fire from a
    // sub-table position - the exact bug the old drainTimeoutHandle guard existed to stop.
    const mid = await page.evaluate(() => ({ active: window.__endOfBallDebug.sequence.active, beat: window.__endOfBallDebug.sequence.beat }));
    await page.keyboard.down('Space');
    await page.waitForTimeout(40);
    await page.keyboard.up('Space');
    const during = await page.evaluate(() => ({
      inPlay: window.__flipperDebug.isBallInPlay(), y: window.__flipperDebug.mainBall.mesh.position.y
    }));
    check('sequence was actually running when launch was pressed', mid.active === true, mid);
    check('launch mid-sequence does not fire from a sub-table position',
      !(during.inPlay === true && during.y < -0.02), during);
    // Now let it finish and launch during the NEXT BALL message - the beat that is deliberately
    // NOT a step, precisely so the player does not have to wait it out.
    //
    // Read from the trace, not by racing the message's own timer. The first version waited for the
    // sequence to go idle and THEN asked the page what the message was, which at ~1.6fps can
    // easily land after the 900ms message has already cleared - it failed on unchanged code, on
    // both this tree and the previous commit. The recorder samples every frame, so whether the
    // message was posted at all is a fact about the run rather than a race against it.
    const gateTrace = await watchSequence(page, 15000);
    const msgUp = (gateTrace.messages[gateTrace.messages.length - 1] || {}).text || '';
    await launchBall(page);
    const after = await page.evaluate(() => window.__flipperDebug.isBallInPlay());
    check('the NEXT BALL message is posted as the sequence ends',
      /^BALL \d OF \d$/.test(msgUp), { last: msgUp, all: gateTrace.messages.map((m) => m.text) });
    check('the player can launch through the NEXT BALL message', after === true, { launched: after });
    check('no page errors (launch gating)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // --- Pause -----------------------------------------------------------------------------------
  console.log('\n=== PAUSE FREEZES THE SEQUENCE ===');
  {
    const { page, pageErrors } = await newGamePage(browser);
    await launchWithBallSaveSpent(page, 'pause');
    await page.evaluate(FORCE_DRAIN);
    await page.keyboard.press('Escape');
    const a = await page.evaluate(() => ({ beat: window.__endOfBallDebug.sequence.beat, active: window.__endOfBallDebug.sequence.active, rem: window.__endOfBallDebug.sequence.remainingMs }));
    await page.waitForTimeout(2500);
    const b = await page.evaluate(() => ({ beat: window.__endOfBallDebug.sequence.beat, active: window.__endOfBallDebug.sequence.active, rem: window.__endOfBallDebug.sequence.remainingMs }));
    check('the sequence is still mid-flight when paused', a.active === true, a);
    // 2500ms of wall clock is longer than the whole sequence. A setTimeout chain would have run
    // to completion underneath the overlay; this must not have moved at all.
    check('a pause freezes the sequence rather than letting it run underneath the overlay',
      b.active === true && b.beat === a.beat && b.rem === a.rem, { before: a, after: b });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__endOfBallDebug.sequence.active, null, { timeout: 15000 });
    const done = await page.evaluate(() => ({
      active: window.__endOfBallDebug.sequence.active,
      atPlunger: Math.abs(window.__flipperDebug.mainBall.mesh.position.y) < 0.05
    }));
    check('resuming carries the sequence through to the end', done.active === false && done.atPlunger, done);
    check('no page errors (pause)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // --- Game over -------------------------------------------------------------------------------
  console.log('\n=== LAST BALL ===');
  {
    const { page, pageErrors } = await newGamePage(browser);
    let last = null;
    let lastBallBonus = null;
    for (let ball = 0; ball < cfg.startingLives; ball++) {
      // A fresh ball save is armed on every new life, so every ball needs its own spent first.
      await launchWithBallSaveSpent(page, 'last ball #' + (ball + 1));
      const isLast = ball === cfg.startingLives - 1;
      if (isLast) {
        // The final ball earns a real bonus on purpose. The old flow paid the bonus BEFORE the
        // lives check specifically so a last-ball payout is never swallowed by the game ending,
        // and the sequence has to keep that: it is the one place where "skip the remaining beats"
        // could plausibly have skipped a scoring one too.
        await page.evaluate(EARN_BONUS);
        await page.waitForTimeout(1400);
        lastBallBonus = await page.evaluate(() => ({
          score: parseInt(document.getElementById('hud-score').textContent, 10) || 0,
          total: window.__endOfBallDebug.bonusTotal()
        }));
      }
      await armSequenceTrace(page);
      await page.evaluate(FORCE_DRAIN);
      last = await watchSequence(page, 14000);
      if (last.gameOverShown) break;
      await page.waitForTimeout(300);
    }
    console.log('  final beats:', JSON.stringify(beatOrder(last)));
    console.log('  final msgs :', JSON.stringify(msgTexts(last)));
    check('the last ball still gets BALL LOST and its bonus beat',
      beatOrder(last).slice(0, 2).join(',') === 'lost,bonus', beatOrder(last));
    check('the last ball skips STATE and NEXT BALL rather than padding them out',
      !beatOrder(last).includes('state') &&
      !msgTexts(last).some((m) => /^BALL \d OF \d$/.test(m)) &&
      !msgTexts(last).some((m) => m.startsWith('STATE ')),
      { beats: beatOrder(last), msgs: msgTexts(last) });
    check('the game over screen is reached', last.gameOverShown === true, { lives: last.lives });
    check('the last ball is still paid its bonus before the game ends',
      lastBallBonus && lastBallBonus.total > 0 && last.score - lastBallBonus.score === lastBallBonus.total,
      lastBallBonus && { before: lastBallBonus.score, after: last.score, expected: lastBallBonus.total });
    check('no page errors (last ball)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // --- Mobile parity ---------------------------------------------------------------------------
  console.log('\n=== MOBILE MATCHES DESKTOP ===');
  {
    const { page, pageErrors } = await newGamePage(browser, { touch: true });
    const touchOn = await page.evaluate(() => document.documentElement.dataset.touchControls);
    await launchWithBallSaveSpent(page, 'mobile');
    await armSequenceTrace(page);
    await page.evaluate(FORCE_DRAIN);
    const r = await watchSequence(page, 12000);
    console.log('  beats  :', JSON.stringify(beatOrder(r)));
    console.log('  msgs   :', JSON.stringify(msgTexts(r)));
    check('touch controls really are on for this page', touchOn === 'on', { touchControls: touchOn });
    check('mobile runs the same beats as desktop',
      JSON.stringify(beatOrder(r)) === JSON.stringify(beatOrder(desktopNoBonus)),
      { mobile: beatOrder(r), desktop: beatOrder(desktopNoBonus) });
    check('mobile says the same things as desktop',
      JSON.stringify(msgTexts(r)) === JSON.stringify(msgTexts(desktopNoBonus)),
      { mobile: msgTexts(r), desktop: msgTexts(desktopNoBonus) });
    // Deliberately NOT "mobile's measured beat durations equal desktop's" - those are frame times
    // in this sandbox and differ run to run on one platform, never mind two. The parity that
    // actually matters is that mobile spends the same BUDGET, i.e. that no beat reads pointer type
    // or viewport and arms a different countdown, which is what this checks on both sides.
    check('mobile spends the same configured budget as desktop',
      budgetOf(r, cfg).ok && budgetOf(desktopNoBonus, cfg).ok,
      { mobile: budgetOf(r, cfg).seen, desktop: budgetOf(desktopNoBonus, cfg).seen });
    check('no page errors (mobile)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  console.log('\n=== SUMMARY ===');
  console.log(`TOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
