// SPIRITBALL flipper-to-ball energy-transfer rig.
//
// Grades a flipper hit by WHERE on the bat it lands: base, midpoint, tip. That gradient is what
// makes shot timing carry information, and it is invisible to every other suite here -
// qa/flipper-geometry.js checks the paddle's motion, qa/circulation-suite.js checks where balls
// end up, but neither asks "does a tip hit actually beat a base hit, and by how much".
//
// Reports, per contact point: the contact radius actually achieved (as a % of FLIPPER_LENGTH_M),
// the ball's exit speed, and the furthest Z it reaches. Plus the held-flipper guard.
//
// Three things this rig has to get right, all of them learned by getting them wrong first:
//
//   1. CONTACT RADIUS IS SELECTED BY THE DROP-X. The bat runs from its pivot at (-0.117,-0.360)
//      out to (-0.017,-0.406), so a ball rolling straight down-table meets it where the bat's own
//      x equals the ball's. The rig solves the drop-x from the measured rest axis rather than
//      guessing, and then RE-MEASURES the radius at the moment of contact and reports that, not
//      the one it aimed for.
//   2. THE APPROACH MUST BE SHORT. Rolling the ball down from mid-table looks more realistic but
//      the slingshots deflect it: aiming for a 25% base contact that way lands at 74%.
//   3. WORLD MATRICES ARE STALE WHILE PAUSED. The rig pauses the game so it can step physics
//      deterministically, which means nothing refreshes transforms - without an explicit
//      computeWorldMatrix(true) the pivot/tip readback reports an active flipper at its REST
//      position, and every contact radius computed from it is wrong.
//
// HELD-FLIPPER GUARD: applyFlipperContactVelocity() early-returns on angularVelocityRad === 0,
// and that omega is derived from the real frame-to-frame angle delta, so a flipper parked at its
// stop injects nothing. The rig tests this by parking the bat at its stop FIRST and only then
// rolling a ball into it. The useful property is that this column does not move when
// FLIPPER_CONTACT_VELOCITY_TRANSFER changes - measured identical from 2.4 all the way to 8.0 -
// which is what proves the guard holds rather than merely happening to look right at one value.
//
// Reads window.__flipperDebug - the permanent read-only ?dev=1 hook. Nothing to hand-patch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/flipper-energy.js
//   PORT=8971 node qa/flipper-energy.js    (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const LAUNCH = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};
const PORT = process.env.PORT || 8971;
const URL = `http://localhost:${PORT}/index.html?dev=1`;

// Measured on FLIPPER_CONTACT_VELOCITY_TRANSFER 2.4 with the OLD 1.70 m/s ceiling, immediately
// before the energy-transfer pass raised that ceiling to 2.55 (see MAX_BALL_SPEED_MS in
// js/config.js). Mid and tip sitting within 1% of each other is the flattening that pass fixed.
const BEFORE = { base: 0.729, mid: 1.679, tip: 1.700 };

const RIG = () => {
const d=window.__flipperDebug, s=d.scene, pe=s.getPhysicsEngine();
const body=d.mainBall.aggregate.body, mesh=d.mainBall.mesh, DT=1/60, Y=0.0135;
const F=d.leftFlipper, L=d.FLIPPER_LENGTH_M;

// The scene is paused, so nothing refreshes world matrices for us; without this the pivot/tip
// readbacks are stale and an active flipper reports the same tip position as a resting one.
const fresh=(node)=>{ node.computeWorldMatrix(true); };
const settle=()=>{ F.active=false; for(let i=0;i<50;i++) d.updateFlipperMotor(F,DT*1000); };
const axis=()=>{ fresh(F.pivotNode); const p=d.pivotWorldPosition(F).clone(), t=d.tipWorldPosition(F).clone();
  const ux=t.x-p.x, uz=t.z-p.z, len=Math.hypot(ux,uz);
  return {px:p.x, pz:p.z, ux:ux/len, uz:uz/len, len}; };

settle();
const A=axis();
// A ball rolling straight down-table at x meets the bat where the bat's own x equals it, so the
// drop-X is what selects the contact radius. Solved from the measured rest axis rather than
// guessed, and the achieved radius is re-measured at the moment of contact and reported.
const xForRadius=(r)=>A.px + A.ux*r;
const zAtRadius=(r)=>A.pz + A.uz*r;

function shot(fracTarget, {hold=10, holdFirst=false}={}){
  settle();
  if(holdFirst){ F.active=true; for(let i=0;i<50;i++) d.updateFlipperMotor(F,DT*1000); } // park at the stop, omega=0
  const r=fracTarget*L, x=xForRadius(r), zHit=zAtRadius(r);
  // Start the approach just above the contact point, not up at mid-table: a ball rolled down from
  // far away is deflected by the slingshots and arrives at a radius nowhere near the intended one
  // (measured 74% when aiming for 25%). A short approach keeps the contact radius honest while
  // still being a real rolling contact rather than a teleport into the paddle.
  mesh.position.set(x, Y, zHit+0.060);
  body.setLinearVelocity(new BABYLON.Vector3(0,0,-0.35));
  body.setAngularVelocity(new BABYLON.Vector3(-0.35/0.0135,0,0)); // no-slip: wx = vz/R
  let armed=false, incoming=0, contactR=null, fa=0, peak=0, maxZ=-1;
  for(let i=0;i<420;i++){
    if(!armed && mesh.position.z < zHit+0.030){
      const v=body.getLinearVelocity(); incoming=Math.hypot(v.x,v.y,v.z);
      fresh(F.pivotNode);
      contactR=(mesh.position.x-A.px)*A.ux + (mesh.position.z-A.pz)*A.uz;
      armed=true; fa=0;
      if(!holdFirst) F.active=true;   // held case: the bat is ALREADY up and stationary
    }
    if(armed && !holdFirst){ fa++; if(fa>hold) F.active=false; }
    d.updateFlipperMotor(F,DT*1000);
    pe._step(DT); d.updateBallPhysics(d.mainBall,DT*1000); d.updateHitCooldowns(DT*1000);
    const v=body.getLinearVelocity(), sp=Math.hypot(v.x,v.y,v.z);
    if(armed){ if(fa<=30) peak=Math.max(peak,sp); maxZ=Math.max(maxZ,mesh.position.z); if(holdFirst) fa++; }
    if(mesh.position.y<-0.05 || mesh.position.z<-0.44) break;
  }
  F.active=false;
  return {frac:fracTarget, contactR:+(contactR||0).toFixed(4), rPct:+(((contactR||0)/L)*100).toFixed(0),
          incoming:+incoming.toFixed(3), out:+peak.toFixed(3), maxZ:+maxZ.toFixed(3)};
}

const shots=[['base',0.35],['midpoint',0.70],['tip',1.00]].map(([n,f])=>({n,...shot(f)}));
// Held flipper: bat already parked at its stop (omega=0) before the ball ever arrives. Any gain
// here would be applyFlipperContactVelocity() firing on a stationary paddle.
const heldHit = shot(0.70,{holdFirst:true});
return {shots, heldHit, axis:A, L};
};

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 30000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-overlay')).display !== 'none', null, { timeout: 30000 });
  await page.mouse.click(640, 450);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');   // pause => the rig owns the physics clock
  await page.waitForTimeout(400);

  const r = await page.evaluate(RIG);
  console.log('=== FLIPPER ENERGY TRANSFER  (left flipper, real rolling contacts) ===');
  console.log(`  bat axis: pivot (${r.axis.px.toFixed(3)}, ${r.axis.pz.toFixed(3)})  length ${r.L}m\n`);
  console.log('  contact point   radius   incoming     exit speed        max Z reached');
  console.log('  ' + '-'.repeat(68));
  const prev = [BEFORE.base, BEFORE.mid, BEFORE.tip];
  r.shots.forEach((s, i) => {
    console.log(`  ${s.n.padEnd(14)} ${String(s.rPct + '%').padStart(5)}   ${s.incoming.toFixed(3)}      ` +
                `${prev[i].toFixed(3)} -> ${s.out.toFixed(3)}     z ${s.maxZ.toFixed(3)}`);
  });
  const g = r.shots.map((s) => s.out);
  console.log(`\n  gradient base:mid:tip = 1 : ${(g[1] / g[0]).toFixed(2)} : ${(g[2] / g[0]).toFixed(2)}` +
              `   (a tip hit must clearly beat a base hit)`);
  console.log(`  HELD flipper parked at its stop: ball in ${r.heldHit.incoming.toFixed(2)} -> out ${r.heldHit.out.toFixed(2)} m/s` +
              `   (must not amplify, and must not move when transfer changes)`);
  if (pageErrors.length) console.log('\n  PAGE ERRORS: ' + JSON.stringify(pageErrors));
  await browser.close();
  process.exit(pageErrors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });