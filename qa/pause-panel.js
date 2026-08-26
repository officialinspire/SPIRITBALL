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
    // only one platform hint visible
    const hints = await p.evaluate(()=>[...document.querySelectorAll('#pause-overlay .pause-status-hint')]
      .filter(e=>getComputedStyle(e).display!=='none').map(e=>e.textContent.trim()));
    check('exactly one platform hint is shown', hints.length===1, {hints});
    // CONTROLS -> BACK round trip
    await p.click('#pause-controls-btn'); await p.waitForTimeout(500);
    check('CONTROLS opens controls and hides pause', await vis('controls-overlay') && !(await vis('pause-overlay')));
    await p.click('#controls-back-btn'); await p.waitForTimeout(500);
    check('BACK returns to pause', await vis('pause-overlay') && !(await vis('controls-overlay')));
    check('still paused after the Controls detour', !(await phys()));
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
    for (let h = 0; h < 90; h++) {
      await p.evaluate(() => window.__pp_hold('bumper1', 3));
      if (await p.evaluate(() => window.__pp_mission()) === 'none') break;
    }
    await p.waitForTimeout(400);
    await p.waitForTimeout(600);
    await p.keyboard.press('Escape'); await p.waitForTimeout(600);
    const st2 = await p.evaluate(()=>{ const e=document.getElementById('pause-status-state');
      return { text:e.textContent, color:getComputedStyle(e).color }; });
    const diag = await p.evaluate(()=>({ inPlay:window.__flipperDebug.isBallInPlay(),
      lives:(document.getElementById('hud-lives')||{}).textContent,
      gameOver:getComputedStyle(document.getElementById('gameover-overlay')).display!=='none',
      pauseShown:getComputedStyle(document.getElementById('pause-overlay')).display!=='none' }));
    check('status footer tracks a CHANGED state, not just the default',
      st2.text !== st.text && st2.color !== st.color, { before:st, after:st2, diag });
    await p.click('#pause-resume-btn'); await p.waitForTimeout(500);

    // NEW GAME from pause
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('#pause-newgame-btn'); await p.waitForTimeout(1500);
    const after = await p.evaluate(()=>({ score:(document.getElementById('hud-score')||{}).textContent,
      lives:(document.getElementById('hud-lives')||{}).textContent }));
    check('NEW GAME resets the run and closes the panel',
      !(await vis('pause-overlay')) && await phys() && after.score==='0' && after.lives==='3', after);
    check('no page errors', errs.length===0, errs.slice(0,3));
    await ctx.close();
  }
  console.log(`\n=== SUMMARY ===\nTOTAL: ${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail?1:0);
})();
