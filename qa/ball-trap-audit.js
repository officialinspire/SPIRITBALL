// SPIRITBALL side-lane ball-trap audit.
//
// Hunts for places a ball can come to rest and stay there, and names the geometry doing it.
// Random play is a poor way to find these - a 600s auto-flip run turned up zero, simply because
// balls rarely visit the pockets - so this seeds the side lanes directly: a grid of starts, each
// given a gentle downhill drift, run with anti-stuck DISABLED so the raw geometry is what is being
// measured rather than the recovery kick's ability to paper over it.
//
// Reports four things:
//   1. TRAPPED STARTS  - how many seeds end immobile, grouped by resting place and by the meshes
//                        actually touching the ball (found by raycast, so they are named, not guessed)
//   2. PINCH CORRIDOR  - the narrowest gap between the inlane guide and the resting flipper,
//                        against the ball's own 0.027m diameter. A corridor narrower than the ball
//                        is a hard wedge: no amount of friction or restitution tuning can fix it.
//   3. FLIPPER/GUIDE OVERLAP - the constraint INLANE_GUIDE_BOTTOM_X_M is pinned by (see its comment):
//                        the bat swept in 1-degree steps must never intersect the guide mesh.
//                        Re-checked here so a future geometry edit cannot silently break it.
//   4. ANTI-STUCK      - for whatever traps remain, how long the shipped recovery takes to free
//                        the ball, so a residual is a known number rather than a surprise.
//
// Reads window.__flipperDebug - the permanent read-only ?dev=1 hook. Nothing to hand-patch.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/ball-trap-audit.js
//   PORT=8971 node qa/ball-trap-audit.js   (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const LAUNCH = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};
const PORT = process.env.PORT || 8971;
const URL = `http://localhost:${PORT}/index.html?dev=1`;

// Measured with the inlane guide still running to LANE_Z_BOTTOM_M (-0.40), immediately before
// INLANE_GUIDE_BOTTOM_Z_M was introduced to end it at -0.35.
// Reference points, each measured on the geometry immediately before the fix that moved it.
// trapped/wedges/minGap are from the inlane-guide pass; orbitRests is the right orbit lane's own
// trap rate (24 of 30 rolls resting, anti-stuck needing 2.58s) before the rail and vision gate
// were moved apart - see VISION_GATE_POS in js/config.js.
const BEFORE = { trapped: 25, wedges: 15, minGap: 0.0163, orbitRests: '24/30', orbitRecovery: 2.58 };

let fails = 0;
const check = (label, cond, detail) => {
  if (!cond) fails++;
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
};

const RIG = () => {
  const d = window.__flipperDebug, s = d.scene, pe = s.getPhysicsEngine();
  const body = d.mainBall.aggregate.body, mesh = d.mainBall.mesh, DT = 1 / 60, Y = 0.0135;
  const BALL_D = 0.027;
  d.leftFlipper.active = false; d.rightFlipper.active = false;
  for (let i = 0; i < 60; i++) { d.updateFlipperMotor(d.leftFlipper, DT * 1000); d.updateFlipperMotor(d.rightFlipper, DT * 1000); }

  const nameOf = (h) => { if (!h || !h.hasHit) return null; for (const m of s.meshes) if (m.physicsBody === h.body) return m.name; return '?'; };
  const contacts = () => {
    const out = new Set();
    for (let a = 0; a < 16; a++) {
      const th = a * Math.PI / 8;
      const from = new BABYLON.Vector3(mesh.position.x, mesh.position.y, mesh.position.z);
      const to = new BABYLON.Vector3(from.x + Math.cos(th) * 0.05, from.y, from.z + Math.sin(th) * 0.05);
      try { const h = pe.raycast(from, to);
        if (h && h.hasHit && Math.hypot(h.hitPointWorld.x - from.x, h.hitPointWorld.z - from.z) < 0.020) out.add(nameOf(h));
      } catch (e) { /* no hit */ }
    }
    return [...out];
  };
  // A seed is only meaningful if the ball could actually BE there. Dropping one inside a collider
  // makes Havok shove it out at up to 25mm in a single step, and it can end up wedged inside
  // geometry it could never have rolled into - which an earlier version of this script reported
  // as real traps. Two independent gates catch that: refuse to seed anywhere the ball does not
  // geometrically fit, then verify the first step moved it no further than its own travel.
  const R = 0.0135;
  const clearance = (px, pz) => {
    let best = Infinity;
    for (let a = 0; a < 32; a++) {
      const th = a * Math.PI / 16;
      try {
        const h = pe.raycast(new BABYLON.Vector3(px, Y, pz),
                             new BABYLON.Vector3(px + Math.cos(th) * 0.09, Y, pz + Math.sin(th) * 0.09));
        if (h && h.hasHit) {
          const dd = Math.hypot(h.hitPointWorld.x - px, h.hitPointWorld.z - pz);
          if (dd < best) best = dd;
        }
      } catch (e) { /* no hit along this ray */ }
    }
    return best;
  };
  const SEED_SPEED = 0.12;
  const seed = (x, z) => {
    mesh.position.set(x, Y, z);
    body.setLinearVelocity(new BABYLON.Vector3(0, 0, -SEED_SPEED));
    body.setAngularVelocity(new BABYLON.Vector3(-SEED_SPEED / 0.0135, 0, 0)); // no-slip: wx = vz/R
  };
  // Returns false when the seed was illegal, so the caller can count it rather than score it.
  const seedIsLegal = (x, z) => {
    if (clearance(x, z) < R + 0.0005) return false;
    const before = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
    pe._step(1 / 60);
    const moved = Math.hypot(mesh.position.x - before.x, mesh.position.y - before.y, mesh.position.z - before.z);
    return moved < SEED_SPEED / 60 + 0.004;   // its own travel, plus room for the first-step settle
  };
  // 1.5s immobile below the game's own STUCK_SPEED_THRESHOLD_MS counts as trapped.
  const settle = (frames, antiStuck) => {
    let still = 0;
    for (let i = 0; i < frames; i++) {
      pe._step(DT);
      if (antiStuck) d.updateBallPhysics(d.mainBall, DT * 1000);
      const v = body.getLinearVelocity();
      if (Math.hypot(v.x, v.y, v.z) < 0.038) still++; else still = 0;
      if (still >= 90) return true;
      if (mesh.position.z < -0.44 || mesh.position.y < -0.05) return false;
    }
    return still >= 90;
  };

  // --- 1. trapped-start census over both side lanes
  const traps = [];
  let tested = 0, illegal = 0;
  // Two bands: the inlane/outlane corridors, and the upper-table orbit lanes (where the vision
  // gate sits). The orbit band was missing entirely from the first version of this script, which
  // is why the worst trap on the table went unreported until it was found by hand.
  const bands = [
    { x0: -0.145, x1: 0.146, z0: -0.24, z1: -0.38, skipInner: 0.085 },
    { x0: -0.100, x1: 0.101, z0: 0.42, z1: 0.15, skipInner: 0.040 }
  ];
  for (const band of bands) {
    const zStep = band.z1 < band.z0 ? -0.02 : 0.02;
    for (let x = band.x0; x <= band.x1; x += 0.006) {
      if (Math.abs(x) < band.skipInner) continue;
      for (let z = band.z0; zStep < 0 ? z >= band.z1 : z <= band.z1; z += zStep) {
        seed(x, z);
        if (!seedIsLegal(x, z)) { illegal++; continue; }
        tested++;
        if (settle(300, false)) {
          traps.push({ rest: [+mesh.position.x.toFixed(3), +mesh.position.z.toFixed(3)], c: contacts() });
        }
      }
    }
  }

  // --- 2. narrowest inlane-guide / resting-flipper corridor
  let minGap = Infinity, minZ = null;
  for (let z = -0.33; z >= -0.395; z -= 0.005) {
    let a = null, b = null;
    try { a = pe.raycast(new BABYLON.Vector3(0.146, Y, z), new BABYLON.Vector3(0.02, Y, z)); } catch (e) { /* none */ }
    if (!a || !a.hasHit) continue;
    const ax = a.hitPointWorld.x;
    try { b = pe.raycast(new BABYLON.Vector3(ax - 0.002, Y, z), new BABYLON.Vector3(0.02, Y, z)); } catch (e) { /* none */ }
    if (b && b.hasHit) { const g = ax - b.hitPointWorld.x; if (g < minGap) { minGap = g; minZ = +z.toFixed(3); } }
  }

  // --- 3. the mesh-overlap constraint INLANE_GUIDE_BOTTOM_X_M is pinned by
  const overlap = {};
  for (const [side, F] of [['left', d.leftFlipper], ['right', d.rightFlipper]]) {
    const guide = s.meshes.find((m) => m.name === 'inlaneGuide' + side), bat = F.mesh;
    if (!guide || !bat) { overlap[side] = null; continue; }
    const lo = Math.min(F.minAngleRad, F.maxAngleRad), hi = Math.max(F.minAngleRad, F.maxAngleRad);
    const saved = F.currentAngleRad;
    let hits = 0, total = 0;
    for (let a = lo; a <= hi + 1e-9; a += Math.PI / 180) {
      F.currentAngleRad = a; F.pivotNode.rotation.y = a;
      F.pivotNode.computeWorldMatrix(true); bat.computeWorldMatrix(true); guide.computeWorldMatrix(true);
      total++;
      if (bat.intersectsMesh(guide, true)) hits++;
    }
    F.currentAngleRad = saved; F.pivotNode.rotation.y = saved; F.pivotNode.computeWorldMatrix(true);
    overlap[side] = { hits, total };
  }

  // --- 4. how long the shipped anti-stuck needs on whatever is left
  const recovery = [];
  for (const t of traps) {
    seed(t.rest[0], t.rest[1] + 0.02);
    if (!settle(300, false)) continue;
    const p0 = { x: mesh.position.x, z: mesh.position.z };
    let freed = -1;
    for (let i = 0; i < 900; i++) {
      pe._step(DT); d.updateBallPhysics(d.mainBall, DT * 1000);
      if (Math.hypot(mesh.position.x - p0.x, mesh.position.z - p0.z) > 0.05) { freed = i; break; }
    }
    recovery.push({ at: t.rest, s: freed < 0 ? null : +(freed / 60).toFixed(2) });
  }
  return { traps, tested, illegal, minGap: minGap === Infinity ? null : +minGap.toFixed(4), minZ, overlap, recovery, BALL_D };
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
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  const r = await page.evaluate(RIG);
  const groups = {};
  r.traps.forEach((t) => { const k = `(${t.rest[0]}, ${t.rest[1]})  [${t.c.join(' + ')}]`; groups[k] = (groups[k] || 0) + 1; });
  // A ball resting ON a flipper is a CRADLE - the normal, desirable end of an inlane feed, and the
  // player flips it away. The pathology this audit exists for is a ball stuck against the guide
  // that never reaches the bat at all, so a flipper contact disqualifies a rest from counting.
  const wedges = r.traps.filter((t) => t.c.some((n) => n && n.startsWith('inlaneGuide'))
                                    && !t.c.some((n) => n && n.endsWith('Flipper'))).length;
  const cradles = r.traps.filter((t) => t.c.some((n) => n && n.endsWith('Flipper'))).length;

  console.log(`=== BALL-TRAP AUDIT  (${r.tested} legal seeded starts, ${r.illegal} illegal seeds rejected, anti-stuck disabled) ===\n`);
  console.log(`  rests: ${r.traps.length} (${cradles} of them balls cradled on a flipper, which is normal)`);
  console.log(`  NOTE: BEFORE.trapped (${BEFORE.trapped}) was counted with the old ungated seeding and is`);
  console.log(`        NOT comparable to this number - most of those seeds started inside geometry.`);
  Object.entries(groups).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`     x${n}  rest ${k}`));
  console.log('');
  // The fix's actual claim: no corridor along the inlane is narrower than the ball. That is what
  // makes a wedge possible at all, and it is the thing friction/restitution tuning can never fix.
  check(`inlane-guide / resting-flipper corridor is never narrower than the ball (${r.BALL_D}m)`,
    r.minGap === null || r.minGap >= r.BALL_D, { minGap: r.minGap, atZ: r.minZ, was: BEFORE.minGap });
  // The dominant cluster this fix removed: 15 seeds all funnelled to the same pocket. Residual
  // singles at slightly different rest points are a different, pre-existing effect (5 before this
  // change, 3 after) and are covered by the recovery bound below, not by this check.
  check('no ball is stuck against an inlane guide without reaching its flipper',
    wedges === 0, { wedges, cradles });
  // Absolute bounds rather than a comparison against a number measured a different way.
  check('no single spot traps a cluster of balls', (() => {
    const bySpot = {};
    r.traps.forEach((t) => { if (t.c.some((n) => n && n.endsWith('Flipper'))) return;
      const k = `${t.rest[0]},${t.rest[1]}`; bySpot[k] = (bySpot[k] || 0) + 1; });
    return Object.values(bySpot).every((n) => n < 5);
  })(), Object.entries(r.traps.reduce((a, t) => {
    if (!t.c.some((n) => n && n.endsWith('Flipper'))) { const k = `${t.rest[0]},${t.rest[1]}`; a[k] = (a[k] || 0) + 1; }
    return a; }, {})).filter(([, n]) => n > 1));
  check('flipper never intersects the inlane guide across its full stroke (left)', r.overlap.left && r.overlap.left.hits === 0, r.overlap.left);
  check('flipper never intersects the inlane guide across its full stroke (right)', r.overlap.right && r.overlap.right.hits === 0, r.overlap.right);
  check('no page errors', pageErrors.length === 0, pageErrors);
  if (r.recovery.length) {
    console.log('\n  anti-stuck recovery on the traps that remain:');
    r.recovery.forEach((x) => console.log(`     (${x.at[0]}, ${x.at[1]}) -> ${x.s === null ? 'NOT freed within 15s' : x.s + 's'}`));
    // A residual trap is acceptable only while it is genuinely recoverable. A permanent one is not.
    const worst = r.recovery.filter((x) => x.s !== null).map((x) => x.s);
    check('every remaining trap is recovered by the shipped anti-stuck',
      r.recovery.every((x) => x.s !== null), r.recovery);
    check('worst recovery stays under 2.5s', worst.length === 0 || Math.max(...worst) < 2.5,
      { worst: worst.length ? Math.max(...worst) : null });
  }
  console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
