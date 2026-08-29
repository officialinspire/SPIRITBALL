// SPIRITBALL Game Over presentation guard.
//
// The retheme replaced the screen's markup, its language and its layout. Two things had to survive
// that untouched, and the rest is what a retheme can quietly get wrong:
//
//   1. RESTART MUST STILL WORK, by every route it worked by before: Space, a click anywhere on the
//      backdrop, and now the PLAY AGAIN button - which deliberately has no handler of its own and
//      relies on its click bubbling to the overlay, the same arrangement the title screen uses. A
//      focusable button on a screen where Space also restarts is a new double-fire hazard, so that
//      is exercised too.
//   2. HIGH SCORE BEHAVIOUR MUST BE UNCHANGED. The record is still written, still survives into the
//      next run, and the screen still distinguishes "you set it" from "here is the standing one" -
//      that distinction moved from one concatenated sentence into a row's label and value, which is
//      exactly the kind of move that loses a branch.
//   3. THE LANGUAGE MUST ACTUALLY BE RETHEMED. Asserted as an absence: no military/combat or
//      ladder vocabulary anywhere in the rendered screen, checked against the real DOM rather than
//      the source, so a label reintroduced by any path is caught.
//   4. THE HIERARCHY MUST HOLD. The requested order, and the score genuinely being the largest
//      readout - a hierarchy stated in markup but not in rendered pixels is not a hierarchy.
//   5. IT MUST FIT, AND SCROLL WHEN IT DOES NOT. A centred flex item taller than its scroll
//      container has its top clipped and unreachable; that is the specific failure the panel's
//      auto margins exist to avoid, so a short viewport is checked for it directly.
//
// Usage:
//   python3 -m http.server 8973            (serve the repo root, from any directory)
//   node qa/game-over.js
//   PORT=8973 node qa/game-over.js
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

// The register this pass was asked to remove. Matched whole-word against the rendered text of the
// whole screen. 'shot' is deliberately absent from the list: a SKILL SHOT is the name of a real
// pinball mechanic, not combat vocabulary, and removing it would cost the player a real word.
const BANNED = ['HIT', 'HITS', 'SHOTS', 'CAPTURES', 'CAPTURED', 'CLEARS', 'KILL', 'KILLS',
                'DEFEAT', 'DEFEATED', 'ENEMY', 'ENEMIES', 'TARGETS DESTROYED', 'RANK', 'TIER',
                'LEVEL', 'XP', 'GAME OVER'];

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

// A staged Saturn contact, so a run reaches Game Over with a real score and a populated detail
// block rather than an all-zero one that would hide every layout problem worth catching.
const EARN = `
  const dbg = window.__flipperDebug, scene = dbg.scene;
  const saturn = scene.getMeshByName('saturn');
  const ball = dbg.mainBall, body = ball.aggregate.body;
  const from = saturn.absolutePosition.clone(); from.z -= 0.06; from.y = 0.0135;
  ball.mesh.setAbsolutePosition(from);
  ball.mesh.computeWorldMatrix(true);
  body.setAngularVelocity(new BABYLON.Vector3(0, 0, 0));
  body.setLinearVelocity(new BABYLON.Vector3(0, 0, 1.1));
`;

async function newGamePage(browser, { w = 1280, h = 800 } = {}) {
  const touch = w < 500;
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html?dev=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug && !!window.__endOfBallDebug, null, { timeout: 40000 });
  await page.mouse.click(w / 2, h / 2);
  await page.waitForTimeout(2200);
  return { page, pageErrors };
}

async function launch(page) {
  await page.keyboard.down('Space');
  await page.waitForTimeout(220);
  await page.keyboard.up('Space');
  await page.waitForTimeout(400);
}

// Drives a real run all the way to the Game Over screen: launch, drain, wait for whichever comes
// back - a returned ball or the screen itself - and repeat.
//
// Deliberately makes NO assumption about which drains cost a life. The first version had a
// launch-drain-relaunch helper built on "every launch arms a ball save, so the first drain of each
// ball is absorbed", which is true right up until it is not: a save that has already expired makes
// that first drain real, and when the real drain is the game-ending one the ball is never returned
// to the plunger at all (showGameOverScreen() does not reset it, by design). The helper then waited
// nine seconds for a ball that was never coming. Absorbing a saved drain as one more cheap
// iteration is both simpler and correct however the saves fall.
// "The ball is back and playable" - deliberately NOT abs(y) < 0.05, which was the first version and
// is wrong in the one case that matters: a ball mid-drain sits around y = -0.046, inside that
// window, so the loop read a draining ball as a returned one, tried to launch during the
// end-of-ball sequence (blocked, correctly), force-drained a ball that was not in play (a no-op,
// correctly), and spun twelve times without ever reaching Game Over. Eight assertions then "passed"
// against the markup's own default values.
//
// A returned ball is at a POSITIVE y (rest is +0.0135); a drained one is below the table. Pairing
// that with "the end-of-ball sequence has finished" removes the ambiguity entirely.
const BALL_IS_BACK = `(!window.__endOfBallDebug.sequence.active
   && window.__flipperDebug.mainBall.mesh.position.y > 0.005)`;

async function playToGameOver(page, { earn = true } = {}) {
  let earned = false;
  for (let i = 0; i < 12; i++) {
    const st = await page.evaluate(`({
      over: getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none',
      inPlay: window.__flipperDebug.isBallInPlay(),
      back: ${BALL_IS_BACK}
    })`);
    if (st.over) return true;
    if (!st.inPlay) {
      if (!st.back) { await page.waitForTimeout(600); continue; }  // mid-sequence, let it finish
      await launch(page);
      // Scored once, on the first ball actually in play, so the run reaches Game Over with a real
      // score and a populated detail block.
      if (earn && !earned) { await page.evaluate(EARN); await page.waitForTimeout(1400); earned = true; }
    }
    await page.evaluate(FORCE_DRAIN);
    await page.waitForFunction(
      `getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none' || ${BALL_IS_BACK}`,
      null, { timeout: 20000, polling: 80 }
    );
    await page.waitForTimeout(400);
  }
  return page.evaluate(() => getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none');
}

// Every assertion in this file is about the Game Over screen, so failing to reach it makes all of
// them meaningless rather than merely failing - the first run of this suite reported eight OKs read
// off the markup's static defaults. Throwing here reports the one real problem instead.
async function requireGameOver(page, label, opts) {
  const reached = await playToGameOver(page, opts || {});
  if (!reached) throw new Error('could not drive the game to Game Over' + (label ? ' (' + label + ')' : ''));
  return reached;
}

// Everything about the rendered screen, read in one pass.
const READ = () => {
  const q = (id) => document.getElementById(id);
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
  const panel = document.querySelector('#gameover-overlay .over-panel');
  const overlay = q('gameover-overlay');
  const fs = (el) => parseFloat(getComputedStyle(el).fontSize);
  const rows = [...document.querySelectorAll('#gameover-overlay .over-summary-row')]
    .filter((r) => !r.hidden)
    .map((r) => [r.querySelector('dt').textContent.trim(), r.querySelector('dd').textContent.trim()]);
  return {
    visible: getComputedStyle(overlay).display !== 'none',
    heading: q('gameover-overlay-heading').textContent.trim(),
    scoreLabel: document.querySelector('#gameover-overlay .over-score-label').textContent.trim(),
    score: q('gameover-score').textContent.trim(),
    rows,
    detailHidden: q('gameover-detail').hidden,
    detailRows: [...q('gameover-stats').querySelectorAll('p')].map((p) => p.textContent.trim()),
    action: q('gameover-play-again-btn').textContent.trim(),
    hint: q('gameover-restart-instructions').textContent.trim(),
    // Rendered sizes, for the hierarchy check - markup order alone does not make a hierarchy.
    sizes: {
      score: fs(q('gameover-score')),
      heading: fs(q('gameover-overlay-heading')),
      action: fs(q('gameover-play-again-btn')),
      row: fs(document.querySelector('#gameover-overlay .over-summary-row dd')),
      detail: q('gameover-detail').hidden ? 0 : fs(q('gameover-stats').querySelector('p'))
    },
    // Layout: is the panel's top reachable, and does everything fit or scroll?
    layout: {
      panelTop: box(panel).top,
      panelBottom: box(panel).bottom,
      viewportH: window.innerHeight,
      overlayScrollTop: overlay.scrollTop,
      overlayScrollHeight: overlay.scrollHeight,
      overlayClientHeight: overlay.clientHeight,
      horizontalOverflow: overlay.scrollWidth > overlay.clientWidth + 1
    },
    stateColor: getComputedStyle(q('gameover-rank-line')).color,
    touchControls: document.documentElement.dataset.touchControls,
    allText: q('gameover-overlay').innerText.toUpperCase()
  };
};

async function main() {
  const browser = await chromium.launch(LAUNCH_OPTS);

  // --- Content, language and hierarchy ---------------------------------------------------------
  console.log('\n=== SCREEN CONTENT ===');
  let deskRead;
  {
    const { page, pageErrors } = await newGamePage(browser);
    await requireGameOver(page);
    const r = await page.evaluate(READ);
    // The colour the game itself says this state is, so the check compares the row against the
    // source of truth rather than against "not white" - which is what the first version did, and
    // it passed on the stylesheet's own fallback.
    const expectColor = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = window.__backglassDebug.rankColor;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return { hex: window.__backglassDebug.rankColor, rgb };
    });
    deskRead = r;
    console.log('  heading:', r.heading, '| score:', r.score, '| action:', r.action);
    console.log('  rows   :', JSON.stringify(r.rows));
    console.log('  detail :', JSON.stringify(r.detailRows));

    check('heading is VISION ENDED', r.heading === 'VISION ENDED', r.heading);
    check('the score block is labelled FINAL SCORE', r.scoreLabel === 'FINAL SCORE', r.scoreLabel);
    check('the score is a real, non-zero figure from the run', /^\d+$/.test(r.score) && Number(r.score) > 0, r.score);
    check('the summary carries FINAL STATE, VISIONS COMPLETED and the record, in that order',
      r.rows.length === 3 && r.rows[0][0] === 'FINAL STATE' && r.rows[1][0] === 'VISIONS COMPLETED'
      && /HIGH SCORE$/.test(r.rows[2][0]), r.rows.map((x) => x[0]));
    check('FINAL STATE shows a real state name, not a number', /^[A-Z ]{4,}$/.test(r.rows[0][1]), r.rows[0][1]);
    check('the state row is tinted with this run\'s own state colour',
      r.stateColor === expectColor.rgb, { row: r.stateColor, expected: expectColor });
    check('the action reads PLAY AGAIN', r.action === 'PLAY AGAIN', r.action);
    check('the restart hint names a real control', /PLAY AGAIN$/.test(r.hint), r.hint);

    console.log('\n=== LANGUAGE ===');
    const hits = BANNED.filter((w) => new RegExp('(^|[^A-Z])' + w + '([^A-Z]|$)').test(r.allText));
    check('no military or ladder vocabulary anywhere on the rendered screen', hits.length === 0,
      { found: hits });
    check('detail rows name features rather than counting hits',
      r.detailRows.every((t) => !/\b(HITS?|SHOTS|CAPTURES|CLEARS|USED|COLLECTED)\b/i.test(t)
        || /SKILL SHOTS|BALL SAVES/i.test(t)), r.detailRows);

    console.log('\n=== HIERARCHY ===');
    check('the score is the largest readout on the screen',
      r.sizes.score > r.sizes.heading && r.sizes.score > r.sizes.action
      && r.sizes.score > r.sizes.row, r.sizes);
    check('the detail block is the quietest thing on the panel',
      r.detailHidden || (r.sizes.detail <= r.sizes.row && r.sizes.detail < r.sizes.action), r.sizes);
    check('no page errors (content)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // --- Restart, by all three routes ------------------------------------------------------------
  console.log('\n=== RESTART BEHAVIOUR ===');
  for (const [routeName, act] of [
    ['space', async (page) => { await page.keyboard.down('Space'); await page.waitForTimeout(60); await page.keyboard.up('Space'); }],
    ['backdrop click', async (page) => { await page.mouse.click(60, 60); }],
    ['PLAY AGAIN button', async (page) => { await page.click('#gameover-play-again-btn'); }],
    ['button focused + Space', async (page) => {
      await page.focus('#gameover-play-again-btn');
      await page.keyboard.down('Space'); await page.waitForTimeout(60); await page.keyboard.up('Space');
    }]
  ]) {
    const { page, pageErrors } = await newGamePage(browser);
    await requireGameOver(page, routeName);
    const before = await page.evaluate(() => ({
      score: parseInt(document.getElementById('hud-score').textContent, 10) || 0,
      lives: parseInt(document.getElementById('hud-lives').textContent, 10) || 0
    }));
    await act(page);
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({
      overlayShown: getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none',
      score: parseInt(document.getElementById('hud-score').textContent, 10) || 0,
      lives: parseInt(document.getElementById('hud-lives').textContent, 10) || 0,
      ballAtPlunger: Math.abs(window.__flipperDebug.mainBall.mesh.position.y) < 0.05
    }));
    check(`restart via ${routeName}: the screen closes and a fresh run starts`,
      after.overlayShown === false && after.score === 0 && after.lives > before.lives && after.ballAtPlunger,
      { before, after });
    check(`restart via ${routeName}: no page errors`, pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // --- High score ------------------------------------------------------------------------------
  console.log('\n=== HIGH SCORE BEHAVIOUR ===');
  {
    const { page, pageErrors } = await newGamePage(browser);
    await requireGameOver(page, 'high score');
    const first = await page.evaluate(() => ({
      label: document.getElementById('gameover-highscore-label').textContent.trim(),
      value: document.getElementById('gameover-highscore-line').textContent.trim(),
      isRecord: document.getElementById('gameover-highscore-row').classList.contains('is-new-record'),
      pulses: document.getElementById('gameover-highscore-line').classList.contains('pulse-text'),
      score: document.getElementById('gameover-score').textContent.trim(),
      stored: (() => { try { return localStorage.getItem('spiritball-highscore'); } catch (e) { return 'ERR'; } })()
    }));
    console.log('  first run:', JSON.stringify(first));
    check('a first run sets the record and says so',
      first.isRecord === true && first.label === 'NEW HIGH SCORE' && first.value === first.score, first);
    check('the record row lights when it is a new record', first.pulses === true, first);
    check('the record is written to storage', first.stored !== null && first.stored !== 'ERR', { stored: first.stored });

    // Second run, deliberately scoring nothing: the record must survive and the row must switch
    // back to the standing-record branch rather than staying latched on NEW HIGH SCORE.
    await page.keyboard.down('Space'); await page.waitForTimeout(60); await page.keyboard.up('Space');
    await page.waitForTimeout(1200);
    await requireGameOver(page, 'high score second run', { earn: false });
    const second = await page.evaluate(() => ({
      label: document.getElementById('gameover-highscore-label').textContent.trim(),
      value: document.getElementById('gameover-highscore-line').textContent.trim(),
      isRecord: document.getElementById('gameover-highscore-row').classList.contains('is-new-record'),
      pulses: document.getElementById('gameover-highscore-line').classList.contains('pulse-text'),
      score: document.getElementById('gameover-score').textContent.trim()
    }));
    console.log('  second run:', JSON.stringify(second));
    check('a lower second run keeps the standing record and does not claim a new one',
      second.isRecord === false && second.label === 'HIGH SCORE'
      && Number(second.value) >= Number(first.value), { first, second });
    check('the NEW HIGH SCORE state does not stay latched between runs', second.pulses === false, second);
    check('no page errors (high score)', pageErrors.length === 0, pageErrors);
    await page.close();
  }

  // --- Layout ----------------------------------------------------------------------------------
  console.log('\n=== LAYOUT ===');
  for (const [name, w, h] of [['desktop', 1280, 800], ['phone', 390, 844], ['short', 640, 420]]) {
    const { page, pageErrors } = await newGamePage(browser, { w, h });
    await requireGameOver(page, name);
    const r = await page.evaluate(READ);
    const L = r.layout;
    console.log(`  ${name}: panel ${L.panelTop}..${L.panelBottom} in ${L.viewportH}, scroll ${L.overlayScrollHeight}/${L.overlayClientHeight}`);
    // The clipped-top failure: a centred flex item taller than its scroll container starts above
    // y=0 and cannot be scrolled up to. Anything >= 0 is reachable.
    check(`[${name}] the panel's top is on screen and reachable`, L.panelTop >= 0, L);
    check(`[${name}] nothing overflows horizontally`, L.horizontalOverflow === false, L);
    if (L.overlayScrollHeight > L.overlayClientHeight + 1) {
      // Taller than the viewport: it must actually scroll to reveal the bottom.
      const bottomReached = await page.evaluate(() => {
        const ov = document.getElementById('gameover-overlay');
        ov.scrollTop = ov.scrollHeight;
        const btn = document.getElementById('gameover-play-again-btn').getBoundingClientRect();
        const hint = document.getElementById('gameover-restart-instructions').getBoundingClientRect();
        return { scrolled: ov.scrollTop > 0, hintBottom: Math.round(hint.bottom), btnTop: Math.round(btn.top), vh: window.innerHeight };
      });
      check(`[${name}] a screen taller than the viewport scrolls to its end`,
        bottomReached.scrolled && bottomReached.hintBottom <= bottomReached.vh + 2, bottomReached);
    } else {
      check(`[${name}] the whole screen fits without scrolling`, L.panelBottom <= L.viewportH, L);
    }
    // The restart hint moved from a <p class="restart-instructions"> to a <span> inside the
    // panel's hint line, and showGameOverScreen() still has to be writing THAT element - a wrong
    // id would leave the markup's static desktop copy sitting there forever.
    //
    // Compared against the game's OWN dataset.touchControls, not against the viewport width. The
    // first version guessed "touch below 500px wide" and was wrong at 640x420, where the game
    // shows touch controls anyway - updateMobileControlsVisibility() has its own rule precisely
    // because a coarse-pointer query gives the wrong answer at small desktop sizes, and
    // touchControlsActive() is what showGameOverScreen() itself reads. Asking the same source
    // means this check cannot drift from the code it is checking.
    check(`[${name}] the restart hint names the control this player actually has`,
      r.touchControls === 'on' ? /TAP .* TO PLAY AGAIN/.test(r.hint)
                               : /PRESS SPACE TO PLAY AGAIN/.test(r.hint),
      { viewport: w + 'x' + h, touchControls: r.touchControls, hint: r.hint });
    check(`[${name}] no page errors`, pageErrors.length === 0, pageErrors);
    await page.close();
  }

  console.log('\n=== SUMMARY ===');
  console.log(`TOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
