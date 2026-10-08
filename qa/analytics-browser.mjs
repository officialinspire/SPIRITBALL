import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--no-sandbox'] });
const events = [];
const errors = [];
let fail = false;

async function newPage(viewport, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  await context.route('https://us.i.posthog.com/i/v0/e/', async (route) => {
    if (fail) return route.abort('failed');
    events.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, body: '{}' });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:8973/index.html?dev=1');
  await page.waitForFunction(() => !!window.__flipperDebug && !!window.__endOfBallDebug, null, { timeout: 40000 });
  return { page, context };
}

const DRAIN = `
  const dbg = window.__flipperDebug; const ball = dbg.mainBall;
  const engine = dbg.scene.getPhysicsEngine();
  const dm = dbg.scene.getMeshByName('drainZone');
  const bb = dm.getBoundingInfo().boundingBox;
  ball.mesh.position.set(dm.position.x, dm.position.y, bb.minimumWorld.z - 0.03);
  ball.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0.5));
  ball.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
  for (let i = 0; i < 30 && dbg.isBallInPlay(); i++) {
    dbg.updateHitCooldowns(16); dbg.updateBallPhysics(ball, 16); engine._step(16 / 1000);
  }
`;
const BACK = `(!window.__endOfBallDebug.sequence.active && window.__flipperDebug.mainBall.mesh.position.y > 0.005)`;

try {
  const { page, context } = await newPage({ width: 1280, height: 800 });
  await page.mouse.click(640, 400);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display === 'none');
  await page.waitForTimeout(2200);
  for (let i = 0; i < 25; i++) {
    const state = await page.evaluate(`({ over: getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none', inPlay: window.__flipperDebug.isBallInPlay(), back: ${BACK} })`);
    if (state.over) break;
    if (!state.inPlay) {
      if (!state.back) { await page.waitForTimeout(600); continue; }
      await page.keyboard.down('Space');
      await page.waitForTimeout(220);
      await page.keyboard.up('Space');
      await page.waitForTimeout(400);
      if (!await page.evaluate(() => window.__flipperDebug.isBallInPlay())) continue;
    }
    await page.evaluate(DRAIN);
    try {
      await page.waitForFunction(`getComputedStyle(document.getElementById('gameover-overlay')).display !== 'none' || ${BACK}`, null, { timeout: 20000, polling: 80 });
    } catch (error) {
      const state = await page.evaluate(() => ({
        inPlay: window.__flipperDebug.isBallInPlay(),
        positionY: window.__flipperDebug.mainBall.mesh.position.y,
        sequence: window.__endOfBallDebug.sequence,
        overlay: getComputedStyle(document.getElementById('gameover-overlay')).display,
      }));
      throw new Error(`drain ${i}: ${JSON.stringify(state)}; ${error.message}`);
    }
    await page.waitForTimeout(400);
  }
  assert.equal(await page.locator('#gameover-overlay').evaluate((el) => getComputedStyle(el).display !== 'none'), true);
  await page.waitForTimeout(400);
  for (const name of ['game_opened', 'game_started', 'game_over']) {
    assert.equal(events.filter((item) => item.event === name).length, 1, name);
  }
  const over = events.find((item) => item.event === 'game_over');
  assert.equal(over.properties.score, Number(await page.locator('#gameover-score').textContent()));
  assert.ok(events.every((item) => item.properties.brand === 'inspire' && item.properties.game === 'SPIRITBALL'));
  assert.ok(events.every((item) => item.properties.$process_person_profile === false && item.properties.$geoip_disable === true));
  assert.equal(new Set(events.map((item) => item.distinct_id)).size, 1);
  assert.equal(errors.length, 0, errors.join(' | '));
  await context.close();

  fail = true;
  const mobile = await newPage({ width: 390, height: 844 }, true);
  await mobile.page.touchscreen.tap(195, 420);
  await mobile.page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display === 'none');
  assert.equal(errors.length, 0, errors.join(' | '));
  await mobile.context.close();
  console.log(`ANALYTICS_QA_CAPTURE ${JSON.stringify(events)}`);
  console.log('SPIRITBALL analytics browser QA passed.');
} finally {
  await browser.close();
}
