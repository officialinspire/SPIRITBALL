// SPIRITBALL pause-panel guard.
//
// The pause panel was rebuilt from #player-hud's instrumentation grammar (see index.html's pause
// block). That was a PRESENTATION change over machinery that is easy to break by accident: the
// overlay is shown and hidden by direct style.display writes from three different functions, the
// buttons are bound by id, and Controls is a round trip that must come back still paused. This
// file drives every one of those paths for real, at three widths, so a future restyle cannot
// quietly cost a working control.
//
// It also pins the two things the redesign added: the status footer carries the live progression
// state (which the scrim hides by covering the backglass), and exactly one platform hint is
// visible - the desktop and touch copies are both in the DOM and toggled by CSS.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/pause-panel.js
//   PORT=8971 node qa/pause-panel.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

// WCAG contrast, with alpha COMPOSITED rather than ignored. A first pass read the tertiary
// label's declared rgba() straight and reported 13.7:1; the label is 72% opaque over the panel
// face, and the real composited figure is a good deal lower. Measuring the declared colour of a
// translucent element is measuring a colour nobody can see.
const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const relLum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const parseRgb = (css) => { const n = css.match(/[\d.]+/g).map(Number);
  return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 }; };
const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg.rgb[i] * (1 - fg.a));
const contrast = (a, b) => { const la = relLum(a), lb = relLum(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); };
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// Every pause/resume path, exercised for real. The redesign must not have moved any of it.
let pass=0, fail=0;
const check=(l,ok,d)=>{ ok?pass++:fail++; console.log(`  ${ok?'OK  ':'FAIL'} ${l}`, d===undefined?'':JSON.stringify(d)); };
(async () => {
  const port = process.env.PORT || 8971;
  const b = await chromium.launch({headless:true, executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl','--no-sandbox']});
  for (const [tag,W,H,touch] of [['desktop',1280,800,false],['phone',390,844,true],['narrow',320,568,true]]) {
    console.log(`\n=== ${tag} ${W}x${H}`);
    const ctx=await b.newContext({viewport:{width:W,height:H}, hasTouch:touch, userAgent:touch?IPHONE:undefined});
    const p=await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    p.on('console',m=>{ if(m.type()==='error') errs.push('console.error: '+m.text().slice(0,160)); });
    await p.goto(`http://localhost:${port}/index.html?dev=1`,{waitUntil:'load'});
    await p.waitForFunction(()=>!!window.__flipperDebug,null,{timeout:40000});
    const vis=(id)=>p.evaluate((i)=>getComputedStyle(document.getElementById(i)).display!=='none',id);
    const phys=()=>p.evaluate(()=>!!BABYLON.EngineStore.LastCreatedScene.physicsEnabled);
    // Escape TOGGLES, and Space is overloaded - it resumes when paused rather than charging - so
    // a relaunch loop can leave the game in either state, and a bare Escape then does the opposite
    // of what the next assertion assumes. This drives to "panel open" from what is actually on
    // screen. (Found the hard way: the vision-row check passed at two viewports and failed at the
    // third purely because the relaunch loop ran a different number of times there.)
    const ensurePaused=async()=>{ if(!(await vis('pause-overlay'))){
      await p.keyboard.press('Escape'); await p.waitForTimeout(600); } };
    if(touch) await p.touchscreen.tap(W/2,H/2); else await p.keyboard.press('Space');
    await p.waitForTimeout(2200);

    // open via the pause button
    const pb=await p.evaluate(()=>{const r=document.getElementById('pause-btn').getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};});
    if(touch) await p.touchscreen.tap(pb.x,pb.y); else await p.click('#pause-btn');
    await p.waitForTimeout(600);
    check('pause button opens the panel and stops physics', await vis('pause-overlay') && !(await phys()));
    // no horizontal overflow, panel inside the viewport
    const fit = await p.evaluate(()=>{ const e=document.querySelector('.pause-panel'), r=e.getBoundingClientRect();
      return { left:Math.round(r.left), right:Math.round(r.right), top:Math.round(r.top), bottom:Math.round(r.bottom),
               vw:innerWidth, vh:innerHeight, docScrollW:document.documentElement.scrollWidth }; });
    check('panel fits the viewport with no page overflow',
      fit.left>=0 && fit.right<=fit.vw && fit.top>=0 && fit.bottom<=fit.vh && fit.docScrollW<=fit.vw, fit);
    // the status footer carries a real state
    const st = await p.evaluate(()=>{ const e=document.getElementById('pause-status-state');
      return { text:e.textContent, color:getComputedStyle(e).color }; });
    check('status footer shows the live state', st.text.length>0 && st.color!=='rgba(0, 0, 0, 0)', st);

    // --- current-run summary ------------------------------------------------------------------
    // Reads existing state, so the test is agreement with the source, not a hardcoded value.
    const sum = await p.evaluate(()=>({
      score: document.getElementById('pause-summary-score').textContent,
      hudScore: document.getElementById('hud-score').textContent,
      visionHidden: document.getElementById('pause-summary-vision-row').hidden,
      valueSize: parseFloat(getComputedStyle(document.querySelector('.pause-summary-row dd')).fontSize),
      labelSize: parseFloat(getComputedStyle(document.querySelector('.pause-summary-row dt')).fontSize),
      primarySize: parseFloat(getComputedStyle(document.getElementById('pause-resume-btn')).fontSize),
      rows: document.querySelectorAll('.pause-summary-row').length }));
    check('summary score agrees with the HUD rather than formatting it differently',
      sum.score === sum.hudScore, sum);
    check('the VISION row is absent when no vision is running', sum.visionHidden === true);
    check('the summary is subordinate to RESUME',
      sum.valueSize < sum.primarySize && sum.labelSize < sum.valueSize, sum);
    check('the summary is three rows, not a second HUD', sum.rows === 3, { rows: sum.rows });
    // --- pause background --------------------------------------------------------------------
    // The scrim is presentation, but two things behind it are contracts.
    const scrim = await p.evaluate(()=>{ const c=getComputedStyle(document.getElementById('pause-overlay'));
      return { image: c.backgroundImage, overlayBlur: c.backdropFilter || c.webkitBackdropFilter,
               panelBlur: getComputedStyle(document.querySelector('.pause-panel')).backdropFilter,
               transition: c.transitionProperty, animation: c.animationName }; });
    const layers = (scrim.image.match(/gradient\(/g) || []).length;
    check('the scrim is layered, not a flat wash', layers >= 4, { layers });
    check('nothing about the scrim animates while paused',
      (scrim.animation === 'none' || !scrim.animation) &&
      (scrim.transition === 'all' || scrim.transition === 'none' || !/background/.test(scrim.transition)),
      { animation: scrim.animation, transition: scrim.transition });
    // The blur is a desktop-only refinement; phones get the gradients alone. Exactly one blur is
    // ever active - the overlay's on desktop, the panel's on touch - never both nested.
    const blurOn = (v) => !!v && v !== 'none';
    if (tag === 'desktop') {
      check('desktop gets the full-screen backdrop blur', blurOn(scrim.overlayBlur), scrim);
      check('the panel does not nest a second blur inside it', !blurOn(scrim.panelBlur), scrim);
    } else {
      check('phone falls back to gradients only, no full-screen blur', !blurOn(scrim.overlayBlur), scrim);
    }
    // The frozen scene must actually be frozen: the render loop's decorative updates used to run
    // outside the pause gate, so a planet rotated and a starfield drifted behind the menu.
    const still = await p.evaluate(async ()=>{
      const sc=BABYLON.EngineStore.LastCreatedScene;
      const ring=sc.meshes.find(m=>m.name==='saturnRing1'), near=sc.meshes.find(m=>m.name==='nearSky');
      const a=[ring?ring.rotation.y:0, near?near.position.x:0];
      const t0=performance.now(); let n=0;
      while(performance.now()-t0<1200){ await new Promise(r=>requestAnimationFrame(r)); n++; }
      return { frames:n, saturn:+Math.abs((ring?ring.rotation.y:0)-a[0]).toFixed(6),
               sky:+Math.abs((near?near.position.x:0)-a[1]).toFixed(6) }; });
    check('the scene is genuinely frozen behind the menu', still.saturn === 0 && still.sky === 0 && still.frames > 1, still);

    // only one platform hint visible
    const hints = await p.evaluate(()=>[...document.querySelectorAll('#pause-overlay .pause-hint-copy')]
      .filter(e=>getComputedStyle(e).display!=='none').map(e=>e.textContent.trim()));
    check('exactly one platform hint is shown', hints.length===1, {hints});
    // CONTROLS -> BACK round trip
    await p.click('#pause-controls-btn'); await p.waitForTimeout(500);
    check('CONTROLS opens controls and hides pause', await vis('controls-overlay') && !(await vis('pause-overlay')));
    await p.click('#controls-back-btn'); await p.waitForTimeout(500);
    check('BACK returns to pause', await vis('pause-overlay') && !(await vis('controls-overlay')));
    check('still paused after the Controls detour', !(await phys()));

    // --- button hierarchy -------------------------------------------------------------------
    // Three actions of three weights must not be three identical boxes. Size and treatment carry
    // the ranking; colour only reinforces it. These assert the RANKING, not exact pixel values,
    // so the tiers can be retuned without the file becoming a second copy of the stylesheet.
    const tiers = await p.evaluate(() => ['pause-resume-btn', 'pause-controls-btn', 'pause-newgame-btn']
      .map((id) => { const e = document.getElementById(id), c = getComputedStyle(e), r = e.getBoundingClientRect();
        return { id, h: Math.round(r.height), top: Math.round(r.top), size: parseFloat(c.fontSize),
                 color: c.color, bg: c.backgroundColor, borderColor: c.borderColor,
                 marginTop: parseFloat(c.marginTop) }; }));
    const [primary, secondary, reset] = tiers;
    check('the three buttons are not the same height', primary.h > secondary.h && secondary.h > reset.h,
      tiers.map((t) => t.h));
    check('type size ranks the same way', primary.size > secondary.size && secondary.size > reset.size,
      tiers.map((t) => t.size));
    check('every button still clears the 44px touch target', tiers.every((t) => t.h >= 44),
      tiers.map((t) => t.h));
    check('the primary is the only filled one; the destructive has no fill at rest',
      parseRgb(primary.bg).a > 0.5 && parseRgb(reset.bg).a === 0, { primary: primary.bg, reset: reset.bg });
    check('the destructive has no border at rest, the others do',
      parseRgb(reset.borderColor).a === 0 && parseRgb(primary.borderColor).a > 0.4
        && parseRgb(secondary.borderColor).a > 0, tiers.map((t) => t.borderColor));
    const gapAB = secondary.top - (primary.top + primary.h);
    const gapBC = reset.top - (secondary.top + secondary.h);
    check('the destructive action is separated by more air than the pair above it', gapBC > gapAB,
      { gapAB, gapBC });
    // The quietest control still has to be readable - that is the line between "de-emphasised"
    // and "hidden". Composited over the panel face it sits on.
    const surf = await p.evaluate(() => getComputedStyle(document.querySelector('.pause-panel')).backgroundColor);
    const resetRatio = contrast(over(parseRgb(reset.color), parseRgb(surf)), parseRgb(surf).rgb);
    check('the de-emphasised destructive label still clears 4.5:1 on the panel',
      resetRatio >= 4.5, { ratio: +resetRatio.toFixed(1), label: reset.color, panel: surf });
    // Keyboard focus has to be one consistent, obvious affordance on every tier.
    // :focus-visible keys off the last interaction MODALITY, so a bare element.focus() leaves
    // the ring off and the check reads a failure a keyboard user would never see. Tabbing in from
    // the top does not work either - the pause buttons sit late in the document behind the
    // canvas, the touch controls and the menu overlay, so Tab never reaches them in a sane number
    // of presses. Seed the position with focus(), then move with REAL keys (out and back, net
    // zero) so the browser is in keyboard modality when the ring is read.
    for (const id of ['pause-resume-btn', 'pause-controls-btn', 'pause-newgame-btn']) {
      await p.evaluate((i) => document.getElementById(i).focus(), id);
      await p.keyboard.press('Shift+Tab');
      await p.keyboard.press('Tab');
      const f = await p.evaluate((i) => { const e = document.getElementById(i), c = getComputedStyle(e);
        return { focused: document.activeElement === e,
                 outline: c.outlineWidth + ' ' + c.outlineStyle, offset: c.outlineOffset }; }, id);
      check(`${id} shows a keyboard focus ring`,
        f.focused && parseFloat(f.outline) >= 2 && f.outline.includes('solid') && f.offset === '3px', f);
    }
    await p.evaluate(() => document.activeElement && document.activeElement.blur());

    // RESUME
    await p.click('#pause-resume-btn'); await p.waitForTimeout(600);
    check('RESUME closes the panel and restarts physics', !(await vis('pause-overlay')) && await phys());
    // Escape toggles
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    check('Escape opens the panel', await vis('pause-overlay') && !(await phys()));
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    check('Escape resumes', !(await vis('pause-overlay')) && await phys());
    // The footer's whole reason to exist: it must track the state, not just show the default.
    // Drive one real ascension, then pause and read it back.
    // Relaunch first. By this point the run has been paused and resumed several times and the
    // ball has long since drained - and every trigger handler returns early when the ball is not
    // in play, so feeding hits to a drained ball silently does nothing at all.
    for (let k = 0; k < 3; k++) {
      if (await p.evaluate(() => window.__flipperDebug.isBallInPlay())) break;
      await p.keyboard.down('Space'); await p.waitForTimeout(1200); await p.keyboard.up('Space');
      await p.waitForTimeout(1800);
    }
    await p.evaluate(() => {
      const scene = BABYLON.EngineStore.LastCreatedScene, dbg = window.__flipperDebug;
      window.__pp_hold = async (name, frames) => {
        const m = scene.meshes.find((x) => x.name === name); if (!m) return;
        dbg.mainBall.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
        for (let i = 0; i < (frames || 10); i++) { const q = m.getAbsolutePosition();
          dbg.mainBall.mesh.position.set(q.x, 0.0135, q.z);
          dbg.mainBall.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
          await new Promise((r) => requestAnimationFrame(r)); }
      };
      window.__pp_mission = () => { let v = null;
        document.querySelectorAll('#status-panel .row').forEach((r) => { const sp = r.querySelectorAll('span');
          if (sp.length >= 2 && sp[0].textContent.trim() === 'Mission:') v = sp[1].textContent.trim(); });
        return v; };
    });
    // Loop on the OUTCOME, not on a fixed number of hits. A held ball scores once per the
    // bumper's own 300ms cooldown, so "how many hits does N iterations produce" depends on how
    // long a frame takes - which varies with viewport. A fixed count completed the vision at
    // 1280x800 and 390x844 and silently fell short at 320x568, where the frames are quicker.
    await p.evaluate(() => window.__pp_hold('missionTarget0'));
    // Pause immediately after SELECTING the vision, at 0/N, rather than after feeding hits.
    // Feeding first raced the completion: a held ball scores once per the bumper's own cooldown,
    // so how far a fixed number of frames gets depends on frame duration, and at 1280x800 the
    // vision was already finished by the time the panel opened - correctly leaving the row hidden.
    //
    // The comparison is against the DEV HUD's live mission row, not #mission-hud's text.
    // updatePlayerStatusHud() hides #mission-hud when no vision is active but never clears its
    // textContent, so that element keeps the last vision's name and progress indefinitely; reading
    // it is reading a ghost, which is what made the first version of this check disagree with a
    // summary that was behaving correctly.
    await p.waitForTimeout(300);
    await ensurePaused();
    const live = await p.evaluate(()=>window.__pp_mission());
    const active = await p.evaluate(()=>({
      hidden: document.getElementById('pause-summary-vision-row').hidden,
      name: document.getElementById('pause-summary-vision').textContent,
      progress: document.getElementById('pause-summary-progress').textContent }));
    const m = /^(.*) \((\d+\/\d+)\)$/.exec(live || '');
    check('a vision is actually running for this check', !!m, { missionRow: live });
    check('the VISION row appears while a vision is running, with its name and progress',
      !!m && active.hidden === false && active.name === m[1] && active.progress === m[2],
      { active, live });
    await p.click('#pause-resume-btn'); await p.waitForTimeout(500);
    for (let h = 0; h < 90; h++) {
      await p.evaluate(() => window.__pp_hold('bumper1', 3));
      if (await p.evaluate(() => window.__pp_mission()) === 'none') break;
    }
    await p.waitForTimeout(400);
    await ensurePaused();
    const st2 = await p.evaluate(()=>{ const e=document.getElementById('pause-status-state');
      return { text:e.textContent, color:getComputedStyle(e).color }; });
    const diag = await p.evaluate(()=>({ inPlay:window.__flipperDebug.isBallInPlay(),
      lives:(document.getElementById('hud-lives')||{}).textContent,
      gameOver:getComputedStyle(document.getElementById('gameover-overlay')).display!=='none',
      pauseShown:getComputedStyle(document.getElementById('pause-overlay')).display!=='none' }));
    check('status footer tracks a CHANGED state, not just the default',
      st2.text !== st.text && st2.color !== st.color, { before:st, after:st2, diag });
    check('the VISION row disappears again once the vision completes',
      await p.evaluate(()=>document.getElementById('pause-summary-vision-row').hidden) === true);
    check('the summary score updated with the run',
      await p.evaluate(()=>document.getElementById('pause-summary-score').textContent) !== sum.score);
    await p.click('#pause-resume-btn'); await p.waitForTimeout(500);

    // NEW GAME from pause
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('#pause-newgame-btn'); await p.waitForTimeout(1500);
    const after = await p.evaluate(()=>({ score:(document.getElementById('hud-score')||{}).textContent,
      lives:(document.getElementById('hud-lives')||{}).textContent }));
    check('NEW GAME resets the run and closes the panel',
      !(await vis('pause-overlay')) && await phys() && after.score==='0' && after.lives==='3', after);
    // --- REGRESSION: the pause button must work while another control is HELD ----------------
    // Demo-session QA found #pause-btn completely dead on touch whenever a flipper or the launch
    // button was already down: it was click-only, and a browser synthesises a compatibility click
    // only for a PRIMARY touch, so a second-finger tap produced no click at all. Holding a flipper
    // is the normal state during play and a phone has no Escape key, so the one pause control was
    // unreachable exactly when it was wanted.
    //
    // This suite already tapped the pause button - and passed 106/106 with the bug present -
    // because p.touchscreen.tap() is a single, primary touch and never reproduces the case. Real
    // multi-touch needs CDP: Input.dispatchTouchEvent, with every active point listed on each
    // event, and touchEnd carrying the point being RELEASED (not the ones that remain - passing
    // the remainder tells the browser the wrong finger lifted, which silently fires the control
    // the other finger was holding).
    if (touch) {
      const cdp = await ctx.newCDPSession(p);
      const live = new Map();
      const centre = (sel) => p.evaluate((q)=>{ const r=document.querySelector(q).getBoundingClientRect();
        return {x:r.left+r.width/2, y:r.top+r.height/2}; }, sel);
      const tDown = async (sel,id)=>{ const c=await centre(sel); live.set(id,c);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',
          touchPoints:[...live.entries()].map(([i,q])=>({id:i,x:q.x,y:q.y}))}); };
      const tUp = async (id)=>{ const q=live.get(id); if(!q) return; live.delete(id);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id,x:q.x,y:q.y}]}); };

      for (const held of ['#launch-btn', '#flipper-zone-left', '#flipper-zone-right', null]) {
        // Start from running, with a ball launched so a pause is meaningful.
        if (await vis('pause-overlay')) { await p.click('#pause-resume-btn'); await p.waitForTimeout(500); }
        if (!(await p.evaluate(()=>window.__flipperDebug.isBallInPlay()))) {
          await tDown('#launch-btn',1); await p.waitForTimeout(200); await tUp(1); await p.waitForTimeout(700);
        }
        // Count real pause-STATE transitions, not button events. Counting events would call a
        // correctly-suppressed compatibility click a failure - the guard's whole job is to let
        // that click arrive and do nothing - so the observable has to be the thing the player
        // sees. openPauseMenu()/resumeGame() both write pauseOverlay.style.display, so a
        // MutationObserver on that attribute counts exactly the toggles that really happened.
        await p.evaluate(()=>{ window.__pbToggles=0;
          if(window.__pbObs) window.__pbObs.disconnect();
          const el=document.getElementById('pause-overlay');
          let last=getComputedStyle(el).display!=='none';
          window.__pbObs=new MutationObserver(()=>{ const now=getComputedStyle(el).display!=='none';
            if(now!==last){ last=now; window.__pbToggles++; } });
          window.__pbObs.observe(el,{attributes:true,attributeFilter:['style']}); });
        if (held) { await tDown(held,1); await p.waitForTimeout(220); }
        await tDown('#pause-btn', held?2:1); await p.waitForTimeout(90); await tUp(held?2:1);
        await p.waitForTimeout(700);
        const r = await p.evaluate(()=>{ window.__pbObs.disconnect();
          return { paused:getComputedStyle(document.getElementById('pause-overlay')).display!=='none',
                   toggles:window.__pbToggles }; });
        if (held) await tUp(1);
        check(`pause button responds to a tap while ${held||'nothing'} is held`, r.paused===true,
          { held:held||'(nothing)', ...r });
        // The guard that lets the touch path exist at all: a single tap must change the pause
        // state exactly ONCE. A compatibility click acted on after the touchstart would pause and
        // immediately resume - the failure mode that got the original touchstart listener removed
        // - and shows up here as 2 transitions.
        check(`a single tap on pause toggles exactly once (${held||'nothing'} held)`,
          r.toggles===1, { held:held||'(nothing)', activations:r.toggles });
      }
      if (await vis('pause-overlay')) { await p.click('#pause-resume-btn'); await p.waitForTimeout(500); }
    }

    check('no page errors', errs.length===0, errs.slice(0,3));
    await ctx.close();
  }
  console.log(`\n=== SUMMARY ===\nTOTAL: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail?1:0);
})();
