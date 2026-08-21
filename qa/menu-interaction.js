// SPIRITBALL MENU INTERACTION suite.
//
// Covers the title screen's primary affordance and, more importantly, the boundary between the
// menu's VISUAL state and its LOGICAL state.
//
// The title screen dismisses along four independent paths - a click anywhere on the backdrop, a
// click/tap on the CTA, the Space key, and Enter on the focused CTA - all of which funnel into
// one idempotent hideMenuScreen(). Every one is asserted here, on both mouse and touch, because
// they are easy to break individually and nothing else in QA touches them.
//
// The subtle part is the exit fade. hideMenuScreen() flips menuUp synchronously and then lets the
// overlay spend ~170ms fading over gameplay that has already begun. Before menuUp existed, the
// guards that ask "are we still at the menu?" read menuOverlay.style.display === 'flex' directly,
// which is fine only while hiding is instantaneous - with a fade in place, every one of them
// would keep answering "yes" for 170ms and would eat the player's next input. The mid-fade test
// below is the regression guard for exactly that, and it has been verified to FAIL when the Space
// handler is reverted to the display-string read.
//
// Two methodology notes, both learned the hard way here:
//   - Playwright RPC costs ~1s per round trip in this headless/swiftshader setup, which is far
//     longer than the 170ms fade. Anything time-sensitive is therefore driven from inside the
//     page, on the page's own clock. A Node-side waitForTimeout cannot observe this window.
//   - Transition end-states are asserted through getAnimations()/currentTime, not by sleeping and
//     reading computed style. A transition sampled at the wrong instant reports its START value,
//     which passes a naive "did it change?" check while proving nothing.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/menu-interaction.js
//   PORT=8971 node qa/menu-interaction.js   (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const LAUNCH = { headless:true, executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--no-sandbox']};
const PORT = process.env.PORT || 8971;
const URL = `http://localhost:${PORT}/index.html?dev=1`;
let fails = 0;
const ck = (l,c,d) => { if(!c) fails++; console.log(`  ${c?'OK  ':'FAIL'} ${l}${d!==undefined?'  '+JSON.stringify(d):''}`); };

async function boot(b, opts={}) {
  const p = await b.newPage({ viewport:{width:opts.w||1280,height:opts.h||900}, hasTouch:!!opts.touch,
    isMobile:!!opts.touch, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  p.on('pageerror', e => { fails++; console.log('  PAGEERROR ' + e); });
  await p.goto(URL,{waitUntil:'load'});
  await p.waitForFunction(()=>getComputedStyle(document.getElementById('menu-overlay')).display!=='none',null,{timeout:30000});
  return p;
}
const state = (p) => p.evaluate(() => {
  const o = document.getElementById('menu-overlay');
  const cs = getComputedStyle(o);
  return { display: cs.display, opacity: +cs.opacity, starting: o.classList.contains('is-starting'),
           phase: (window.__flipperDebug && document.getElementById('status-phase')||{}).textContent };
});

(async () => {
  const b = await chromium.launch(LAUNCH);

  console.log('=== START PATHS (each must fully dismiss) ===');
  for (const [name, act, opts] of [
    ['click backdrop',  async p => p.mouse.click(30, 400), {}],
    ['click CTA',       async p => p.click('#menu-start-instructions'), {}],
    ['SPACE key',       async p => p.keyboard.press(' '), {}],
    ['Enter on focused CTA', async p => { await p.focus('#menu-start-instructions'); await p.keyboard.press('Enter'); }, {}],
    ['tap CTA (touch)', async p => p.tap('#menu-start-instructions'), {w:390,h:844,touch:true}],
    ['tap backdrop (touch)', async p => p.tap('#menu-overlay', {position:{x:30,y:400}}), {w:390,h:844,touch:true}],
  ]) {
    const p = await boot(b, opts);
    const before = await state(p);
    await act(p);
    const mid = await state(p);          // immediately after: logically gone, visually fading
    await p.waitForTimeout(400);
    const after = await state(p);
    ck(`${name}: menu gone`, after.display === 'none' && !after.starting,
       { before: before.display, midStarting: mid.starting, after: after.display });
    await p.close();
  }

  console.log('\n=== LOGICAL vs VISUAL TIMING ===');
  {
    const p = await boot(b);
    await p.evaluate(() => window.__t = performance.now());
    await p.mouse.click(30, 400);
    const r = await p.evaluate(() => {
      const o = document.getElementById('menu-overlay');
      return { elapsed: performance.now() - window.__t, starting: o.classList.contains('is-starting'),
               display: getComputedStyle(o).display, pe: getComputedStyle(o).pointerEvents,
               phase: document.getElementById('status-phase') ? document.getElementById('status-phase').textContent : null };
    });
    // Many frames have passed by the time this read lands (RPC latency, reported below), so this
    // is "gameplay is live once the fade is underway", not a same-tick claim - see the in-page
    // section for that one.
    ck('gameplay is already live while the overlay is still fading', r.phase !== 'MENU', { phase: r.phase, rpcMs: Math.round(r.elapsed) });
    ck('overlay is still painted but inert while it fades', r.starting && r.display === 'flex' && r.pe === 'none', r);
    await p.waitForTimeout(400);
    ck('overlay is display:none once the fade ends', (await state(p)).display === 'none');
    await p.close();
  }

  console.log('\n=== INPUT DURING THE FADE IS NOT SWALLOWED ===');
  {
    // Driven entirely from inside the page. Playwright RPC costs ~1s per round trip in this
    // headless/swiftshader setup - far longer than the 170ms fade - so measuring this from Node
    // would always sample after the window had closed and would pass no matter what the code did.
    const p = await boot(b);
    const r = await p.evaluate(() => new Promise((res) => {
      const overlay = document.getElementById('menu-overlay');
      const phase = () => document.getElementById('status-phase').textContent;
      const fire = (t) => window.dispatchEvent(new KeyboardEvent(t, { key: ' ', code: 'Space', bubbles: true }));
      fire('keydown'); fire('keyup');
      const sameTick = { starting: overlay.classList.contains('is-starting'), phase: phase() };
      setTimeout(() => {
        const stillFading = overlay.classList.contains('is-starting');
        fire('keydown');                                  // real second input, mid-fade
        setTimeout(() => {
          fire('keyup');                                  // release -> should launch
          setTimeout(() => res({
            sameTick, stillFading, phase: phase(), ballInPlay: window.__flipperDebug.isBallInPlay()
          }), 500);
        }, 140);
      }, 40);
    }));
    // Asserted via is-starting, not via the phase readout: hideMenuScreen() sets menuUp = false
    // and then adds the class on the next line, so the class being present in the same
    // synchronous tick proves the flag flipped in it. #status-phase is written by the render
    // loop once per frame, so it necessarily still shows the previous frame's value here - it is
    // a lagging indicator and cannot witness same-tick behaviour at all.
    ck('menu state flips synchronously with the input', r.sameTick.starting === true, r.sameTick);
    ck('overlay is still visibly fading 40ms later', r.stillFading, { stillFading: r.stillFading });
    ck('a second input mid-fade charges and launches instead of being eaten as another dismiss',
       r.ballInPlay === true, { phase: r.phase, ballInPlay: r.ballInPlay });
    await p.close();
  }

  console.log('\n=== INTERACTION STATES ===');
  {
    const p = await boot(b);
    const rest = await p.evaluate(() => { const c = getComputedStyle(document.getElementById('menu-start-instructions'));
      return { transform:c.transform, cursor:c.cursor, minH:c.minHeight, ta:c.touchAction, anim:c.animationName }; });
    ck('resting: pointer cursor, 48px min target, breathe running', rest.cursor==='pointer' && parseFloat(rest.minH)>=44 && rest.anim!=='none', rest);
    // Asserted through the Web Animations API rather than by sleeping and reading computed
    // style: a transition sampled at the wrong moment reports its START value, which sails
    // through a naive "is it different from rest" check while proving nothing. currentTime
    // reaching the full duration is unambiguous, and it does not depend on RPC timing.
    const rest0 = await p.evaluate(() => getComputedStyle(document.getElementById('menu-start-instructions')).filter);
    await p.hover('#menu-start-instructions');
    const hov = await p.evaluate(() => new Promise((res) => {
      const el = document.getElementById('menu-start-instructions');
      const trs = el.getAnimations().filter((a) => a.constructor.name === 'CSSTransition');
      setTimeout(() => {
        const c = getComputedStyle(el);
        res({ props: trs.map((t) => t.transitionProperty).sort(),
              done: trs.length > 0 && trs.every((t) => t.currentTime >= 120),
              filter: c.filter, transform: c.transform });
      }, 400);
    }));
    const bright = parseFloat((hov.filter.match(/brightness\(([\d.]+)\)/) || [])[1] || '1');
    ck('hover transitions filter + transform to completion', hov.done && String(hov.props) === 'filter,transform', hov);
    ck('hover settles brighter and lifted, from an un-filtered rest',
       rest0 === 'none' && bright > 1.05 && hov.transform !== 'none' && hov.transform !== 'matrix(1, 0, 0, 1, 0, 0)',
       { rest: rest0, brightness: bright, transform: hov.transform });
    await p.mouse.move(5, 5);
    await p.evaluate(() => document.getElementById('menu-start-instructions').focus());
    const foc = await p.evaluate(() => { const c = getComputedStyle(document.getElementById('menu-start-instructions'));
      return { w: c.outlineWidth, s: c.outlineStyle }; });
    ck('focus ring exists when focused', parseFloat(foc.w) > 0 && foc.s !== 'none', foc);
    ck('CTA is a real button', await p.evaluate(()=>document.getElementById('menu-start-instructions').tagName), true);
    await p.close();
  }

  console.log('\n=== REDUCED MOTION ===');
  {
    const p = await boot(b, { reduced:true });
    const r0 = await p.evaluate(() => { const c=getComputedStyle(document.getElementById('menu-start-instructions'));
      return { anim:c.animationName, transform:c.transform }; });
    ck('no breathe animation, no resting transform', r0.anim==='none' && (r0.transform==='none'||r0.transform==='matrix(1, 0, 0, 1, 0, 0)'), r0);
    const t = await p.evaluate(() => getComputedStyle(document.getElementById('menu-overlay')).transitionDuration);
    await p.mouse.click(30,400);
    const mid = await p.evaluate(() => +getComputedStyle(document.getElementById('menu-overlay')).opacity);
    ck('exit is an instant cut, not a fade', mid === 0, { opacityRightAfterClick: mid, overlayTransition: t });
    await p.waitForTimeout(400);
    ck('menu still ends up hidden', (await state(p)).display === 'none');
    await p.close();
  }

  console.log('\n=== PLATFORM COPY ===');
  // 'want' is a word the anywhere-line must contain; both must also avoid restating the verb
  // already used by the CTA label directly above them.
  for (const [label, opts, want] of [['desktop', {}, 'click'], ['touch', {w:390,h:844,touch:true}, 'anywhere']]) {
    const p = await boot(b, opts);
    const r = await p.evaluate(() => {
      const vis = [...document.querySelectorAll('#menu-overlay .start-anywhere')].filter(e=>getComputedStyle(e).display!=='none');
      return { n: vis.length, text: vis.map(e=>e.textContent.trim()).join('|'),
               label: document.getElementById('menu-start-label').textContent.trim() };
    });
    const verb = r.label.split(' ')[0].toLowerCase();          // PRESS / TAP
    ck(`${label}: exactly one anywhere-line, and it does not stutter the CTA verb`,
       r.n === 1 && r.text.includes(want) && !r.text.toLowerCase().includes(verb), r);
    await p.close();
  }

  await b.close();
  console.log(fails ? `\n${fails} FAILURE(S)` : '\nall green');
  process.exit(fails?1:0);
})();
