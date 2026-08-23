// SPIRITBALL ball-movement measurement rig.
//
// Answers one question with numbers instead of adjectives: does the ball move like a steel
// pinball on a polished machine? Reports the quantities that decide that, plus two guards that
// stop a "livelier" ball from quietly becoming a worse one.
//
//   downhill acceleration  - is gravity doing what a 6-degree tilt says it should?
//   free-roll retention    - does the ball CARRY momentum, or bleed it in open playfield?
//   wall rebound           - how much speed survives a clean head-on bounce?
//   lane crossing          - how far a modest push carries before dying under 0.2 m/s
//   whole-ball speed       - average speed, and the share of a ball spent nearly stationary
//   GUARD airborne %       - a ball whose restitution is too high stops rolling and starts
//                            hopping off the playfield itself (Havok combines restitution with
//                            MAXIMUM, so the ball's own value overrides the playfield's 0.2)
//   GUARD drain time       - liveliness must not quietly become a difficulty change
//
// Determinism: the game is PAUSED first (scene.physicsEnabled=false, so the render loop stops
// stepping physics) and this rig then drives scene.getPhysicsEngine()._step() itself at a fixed
// 1/60 alongside the game's own updateBallPhysics()/updateHitCooldowns(). That matters - headless
// Chromium renders this scene at ~5 FPS, so anything measured off the live render loop measures
// the sandbox's frame rate rather than the physics.
//
// Two things this rig gets right that a naive version does not, both found by tracing a bad run:
//   1. Launch spin must satisfy the no-slip condition wx = vz/R, wz = -vx/R. Inverting the sign
//      launches a BACK-spinning ball, and what gets measured is friction reversing the spin -
//      slip losses, not rolling decay. That error reads as ~63%/s retention instead of ~97.5%/s.
//   2. A rolling sphere's energy invariant is (7/10)v^2 + g*z, not (1/2)v^2 + g*z, because 2/7 of
//      its kinetic energy is rotational. Gravity-correcting with the point-mass form invents a
//      loss that is not there.
//
// Open corridors and the outer wall are located by Havok raycast rather than hardcoded, so this
// keeps working if the table layout is ever rearranged.
//
// Reads window.__flipperDebug - the permanent read-only ?dev=1 hook. Nothing to hand-patch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/ball-movement.js
//   PORT=8971 node qa/ball-movement.js     (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const LAUNCH = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};
const PORT = process.env.PORT || 8971;
const URL = `http://localhost:${PORT}/index.html?dev=1`;

// Measured on BALL_RESTITUTION 0.45, immediately before the ball-movement tuning pass raised it
// to 0.55 (see that constant's own comment in js/config.js). Printed next to the live run so a
// regression in ball feel shows up as a number rather than a vibe. The rebound figure is a
// range because the rig fires three speeds at the wall and keeps whichever land a clean head-on
// impact; compare the FLOOR of the range across runs, not the width.
const BEFORE = { accel: 0.717, roll: 97.5, reb: '33-40', avg: 0.445, slow: 12.5, drain: 2.90, air: 0.0 };

const RIG = () => {
const d=window.__flipperDebug, s=d.scene, pe=s.getPhysicsEngine();
const body=d.mainBall.aggregate.body, mesh=d.mainBall.mesh, DT=1/60, Y=0.0135;
const GDZ = Math.abs(pe.gravity.z);
if (window.__EXP_ANGDAMP != null) body.setAngularDamping(window.__EXP_ANGDAMP);

const ray=(fx,fz,tx,tz)=>{ try{
  const r=pe.raycast(new BABYLON.Vector3(fx,Y,fz), new BABYLON.Vector3(tx,Y,tz));
  return r&&r.hasHit ? {x:r.hitPointWorld.x, z:r.hitPointWorld.z} : null;
}catch(e){ return undefined; } };

// longest clear downhill corridor
let lane=null;
for(let x=-0.24;x<=0.241;x+=0.01){
  const h=ray(x,0.40,x,-0.40);
  const zHit = h===undefined?null:(h?h.z:-0.40);
  if(zHit!==null && (!lane || (0.40-zHit)>lane.len)) lane={x:+x.toFixed(3), zHit, len:0.40-zHit};
}
// true side wall on a clear lateral line
const wallLine = lane? lane.x : 0;
let wall=null; const wallScan=[];
for(let z=-0.42; z<=0.42; z+=0.02){
  const h=ray(0,z,0.40,z);
  if(h){ wallScan.push({z:+z.toFixed(2), x:+h.x.toFixed(3)}); if(h.x>0.22 && z>-0.17 && z<-0.03 && !wall) wall={z:+z.toFixed(2), x:h.x}; }
}

const reset=(x,z,vx,vz)=>{
  mesh.position.set(x,Y,z);
  body.setLinearVelocity(new BABYLON.Vector3(vx,0,vz));
  // No-slip rolling spin. Contact point is at (0,-R,0), so v + w x (0,-R,0) = 0 gives
  // wx = vz/R and wz = -vx/R. (Signs verified against a trace: the inverted version
  // launches a BACK-spinning ball, and what then gets measured is friction reversing the
  // spin - slip losses, not rolling decay.)
  body.setAngularVelocity(new BABYLON.Vector3(vz/0.0135,0,-vx/0.0135));
};
const sp=()=>{const v=body.getLinearVelocity();return Math.hypot(v.x,v.y,v.z);};

// --- A: downhill rolling acceleration (open corridor, from rest)
let accel=null;
if(lane){
  reset(lane.x, 0.38, 0, 0);
  const tr=[]; for(let i=0;i<70;i++){pe._step(DT); d.updateBallPhysics(d.mainBall,DT*1000);
    const v=body.getLinearVelocity(); tr.push({t:(i+1)*DT, vz:v.z, z:mesh.position.z, sp:sp()});}
  const clean=tr.filter((p,i)=>i>8 && i<50 && (i===0||Math.abs(tr[i].sp-tr[i-1].sp)<0.03));
  if(clean.length>10){const a=clean[0],c=clean[clean.length-1];
    accel=(Math.abs(c.vz)-Math.abs(a.vz))/(c.t-a.t);}
}
// --- B: rolling retention, gravity-corrected, collision-free only
let roll=null;
if(lane){
  reset(lane.x, 0.36, 0, -0.60);
  const tr=[]; let collided=false;
  for(let i=0;i<90;i++){
    const before=sp(); pe._step(DT); d.updateBallPhysics(d.mainBall,DT*1000);
    if(Math.abs(sp()-before)>0.035) {collided=true; break;}
    tr.push({t:(i+1)*DT, z:mesh.position.z, sp:sp()});
  }
  if(tr.length>=20){
    const a=tr[0], c=tr[tr.length-1], dt=c.t-a.t;
    const K=10/7; // rolling sphere: (7/10)v^2 + g*z = const
    const va=Math.sqrt(Math.max(a.sp*a.sp+K*GDZ*a.z,1e-9)), vc=Math.sqrt(Math.max(c.sp*c.sp+K*GDZ*c.z,1e-9));
    roll={span:+dt.toFixed(2), perSec:Math.pow(vc/va,1/dt), collided, frames:tr.length, va:+va.toFixed(4), vc:+vc.toFixed(4)};
  }
}
// --- C: head-on wall rebound retention
const reb=[];
if(wall){
  for(const v0 of [0.6,1.0,1.5]){
    reset(0, wall.z, v0, 0);
    let pre=v0, post=null;
    for(let i=0;i<160;i++){
      const bx=body.getLinearVelocity().x;
      pe._step(DT); d.updateBallPhysics(d.mainBall,DT*1000);
      const ax=body.getLinearVelocity().x;
      if(bx>0.05 && ax<0){ // require real inbound speed: a near-zero bx makes the ratio meaningless
        pre=Math.abs(bx);
        // The rebound velocity develops over the frame or two the ball is still in contact, so
        // read the max over 3 frames. Safe here because the target is a plain outer wall chosen
        // by raycast (x>0.22), not a slingshot - nothing on this line injects a kick.
        post=Math.abs(ax);
        for(let k=0;k<3;k++){ pe._step(DT); d.updateBallPhysics(d.mainBall,DT*1000);
          post=Math.max(post, Math.abs(body.getLinearVelocity().x)); }
        break; }
    }
    if(post!=null) reb.push({v0, pre:+pre.toFixed(3), post:+post.toFixed(3), ret:+(post/pre).toFixed(3)});
  }
}
// --- D: lane crossing / stickiness - modest push, distance before dropping under 0.2 m/s
let lanexs=null;
if(lane){
  reset(lane.x, 0.30, 0, -0.50);
  const z0=mesh.position.z; let t=0, zEnd=z0;
  for(let i=0;i<240;i++){ pe._step(DT); d.updateBallPhysics(d.mainBall,DT*1000); t+=DT; zEnd=mesh.position.z;
    if(sp()<0.20 || mesh.position.z<-0.42 || mesh.position.y<-0.05){break;} }
  lanexs={dist:+Math.abs(zEnd-z0).toFixed(3), t:+t.toFixed(2)};
}
// --- E: drain behaviour - plunger launch, no flippers, time to drain (x3)
const drains=[];
for(let k=0;k<5;k++){
  mesh.position.set(0.1955,Y,-0.2525);
  body.setLinearVelocity(new BABYLON.Vector3(0,0,1.5)); body.setAngularVelocity(BABYLON.Vector3.Zero());
  d.leftFlipper.active=false; d.rightFlipper.active=false;
  let t=0, slow=0, n=0, sum=0, peak=0, air=0, vyMax=0;
  for(let i=0;i<3600;i++){
    pe._step(DT); d.updateBallPhysics(d.mainBall,DT*1000); d.updateHitCooldowns(DT*1000);
    t+=DT; const v=sp(); sum+=v; n++; peak=Math.max(peak,v); if(v<0.1) slow++;
    // Superball guard: a ball whose restitution has been pushed too high stops rolling and starts
    // hopping off the PLAYFIELD itself (Havok combines restitution with MAXIMUM, so the ball's own
    // value overrides the playfield's 0.2). Airborne frames and peak |vy| are how that shows up.
    if(mesh.position.y>Y+0.0004) air++;
    vyMax=Math.max(vyMax, Math.abs(body.getLinearVelocity().y));
    if(mesh.position.z<-0.44||mesh.position.y<-0.05) break;
  }
  drains.push({t:+t.toFixed(2), avg:+(sum/n).toFixed(3), slow:+(slow/n*100).toFixed(1), peak:+peak.toFixed(3),
               air:+(air/n*100).toFixed(1), vyMax:+vyMax.toFixed(3)});
}
return {lane, wall, wallScan, accel, roll, reb, lanexs, drains, GDZ:+GDZ.toFixed(4),
        mat:{f:d.mainBall.aggregate.shape.material.friction, r:d.mainBall.aggregate.shape.material.restitution},
        angDamp:body.getAngularDamping()};
};

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 30000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display !== 'none', null, { timeout: 30000 });
  await page.mouse.click(640, 450);          // dismiss the title screen
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');        // pause => physicsEnabled false => the rig owns the clock
  await page.waitForTimeout(400);
  const paused = await page.evaluate(() => window.__flipperDebug.scene.physicsEnabled === false);
  if (!paused) { console.log('  WARN: scene still stepping physics; numbers below are not deterministic'); }

  const r = await page.evaluate(RIG);
  const dr = r.drains, mean = (f) => dr.reduce((a, x) => a + f(x), 0) / dr.length;
  const drain = mean((x) => x.t), avg = mean((x) => x.avg), slow = mean((x) => x.slow), air = mean((x) => x.air);
  const rebLo = r.reb.length ? Math.min(...r.reb.map((x) => x.ret)) * 100 : NaN;
  const rebHi = r.reb.length ? Math.max(...r.reb.map((x) => x.ret)) * 100 : NaN;
  const row = (label, before, after, note) =>
    console.log(`  ${label.padEnd(34)} ${String(before).padStart(9)}  ->  ${String(after).padStart(9)}   ${note || ''}`);

  console.log(`=== BALL MOVEMENT  (ball material: friction ${r.mat.f}, restitution ${r.mat.r}, angularDamping ${r.angDamp.toFixed(2)}) ===`);
  console.log(`  corridor x=${r.lane ? r.lane.x : '?'}  outer wall x=${r.wall ? r.wall.x.toFixed(3) : '?'} @ z=${r.wall ? r.wall.z : '?'}  downhill gravity ${r.GDZ} m/s^2\n`);
  console.log('  metric                                 BEFORE          NOW');
  console.log('  ' + '-'.repeat(74));
  row('downhill acceleration (m/s^2)', BEFORE.accel.toFixed(3), r.accel != null ? r.accel.toFixed(3) : 'n/a', '(ideal rolling = 0.732)');
  row('free-roll retention (per second)', BEFORE.roll.toFixed(1) + '%', r.roll ? (r.roll.perSec * 100).toFixed(1) + '%' : 'n/a', '(100% would be floaty)');
  row('wall rebound retention', BEFORE.reb + '%', isNaN(rebLo) ? 'n/a' : `${rebLo.toFixed(0)}-${rebHi.toFixed(0)}%`, '');
  row('average speed over a ball (m/s)', BEFORE.avg.toFixed(3), avg.toFixed(3), '');
  row('frames under 0.1 m/s ("sticky")', BEFORE.slow.toFixed(1) + '%', slow.toFixed(1) + '%', '');
  row('GUARD airborne frames', BEFORE.air.toFixed(1) + '%', air.toFixed(1) + '%', '(>0 = superball hopping)');
  row('GUARD flipperless drain time (s)', BEFORE.drain.toFixed(2), drain.toFixed(2), '(liveliness vs ball life)');
  if (r.lanexs) console.log(`\n  lane crossing: a 0.50 m/s push carried ${r.lanexs.dist.toFixed(3)}m in ${r.lanexs.t.toFixed(2)}s before dropping under 0.2 m/s`);
  if (pageErrors.length) { console.log('\n  PAGE ERRORS: ' + JSON.stringify(pageErrors)); }
  await browser.close();
  process.exit(pageErrors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });