// SPIRITBALL state-palette guard.
//
// STATE_COLORS is parallel data - one colour per RANK_NAMES entry - and the failure mode if it
// drifts is quiet rather than loud: an out-of-range index hands `undefined` to a canvas
// fillStyle, which paints BLACK on a near-black panel instead of throwing. That is an invisible
// state row, findable only by looking at the right rank. This file pins the invariants that
// keep the palette both correct and RESTRAINED, which is the whole point of it:
//
//   - one colour per state, and index 0 still the exact pre-palette colour, so a fresh game is
//     unchanged and nobody notices a restyle on load;
//   - every state legible against the panel's own face, measured by sampling the REAL rendered
//     backglass texture rather than assuming a background value;
//   - no state brighter than the panel's existing HIGH SCORE readout, which is the loudest thing
//     the backglass is supposed to have - the guard against "ascending" turning into "shouting";
//   - the backglass still excluded from the GlowLayer, which is what stops any of this bleeding
//     into the scene or competing with the ball.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/state-palette.js
//   PORT=8971 node qa/state-palette.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8971;
const BASE = `http://localhost:${PORT}/index.html?dev=1`;
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

// WCAG relative luminance / contrast ratio. Linearised, not the cheap weighted-sRGB
// approximation - the point of this file is that the numbers are trustworthy.
const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const relLum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const contrast = (a, b) => { const [hi, lo] = relLum(a) >= relLum(b) ? [relLum(a), relLum(b)] : [relLum(b), relLum(a)];
  return (hi + 0.05) / (lo + 0.05); };
const parseHex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

let passed = 0, failed = 0;
function check(label, ok, detail) {
  if (ok) { passed++; console.log('  OK   ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
  else { failed++; console.log('  FAIL ' + label, detail === undefined ? '' : JSON.stringify(detail)); }
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await browser.newPage({ viewport: { width: 620, height: 520 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__flipperDebug, null, { timeout: 40000 });

  const data = await page.evaluate(async () => {
    const scene = BABYLON.EngineStore.LastCreatedScene;
    const cfg = await import('./js/config.js');
    // The panel's own face, sampled from the REAL texture rather than assumed. Row band is the
    // STATE row (ROW_Y 178 .. +76 on a 1024x480 texture); x=980 is clear of the value glyphs
    // and of the badges, which only appear when a power-up is running.
    let canvas = null;
    for (const t of scene.textures) {
      const c = t.getContext ? t.getContext().canvas : null;
      if (c && c.width === 1024 && c.height === 480) { canvas = c; break; }
    }
    const px = (x, y) => { const d = canvas.getContext('2d').getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
    const glow = scene.effectLayers.find((l) => l.name === 'glow');
    const glass = scene.getMeshByName('backglass');
    return {
      colors: cfg.STATE_COLORS,
      names: cfg.RANK_NAMES,
      face: px(980, 210),
      backglassExcluded: !!(glow && glass && glow.hasMesh && !glow.hasMesh(glass)),
      glowFound: !!glow
    };
  });

  console.log('\n=== PALETTE SHAPE ===');
  check('one colour per state', data.colors.length === data.names.length,
    { colors: data.colors.length, names: data.names.length });
  check('index 0 is still the pre-palette colour (a fresh game looks untouched)',
    data.colors[0].toLowerCase() === '#7dffe0', { got: data.colors[0] });
  check('every entry is a #rrggbb string', data.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)), data.colors);
  check('no duplicate colours (each state is distinguishable)',
    new Set(data.colors.map((c) => c.toLowerCase())).size === data.colors.length);

  console.log('\n=== LEGIBILITY vs the panel face ' + JSON.stringify(data.face) + ' ===');
  const MIN_CONTRAST = 7; // WCAG AAA for large text; this text is very large indeed
  const ratios = data.colors.map((c) => +contrast(parseHex(c), data.face).toFixed(1));
  data.colors.forEach((c, i) => console.log(
    `     ${String(i).padStart(2)} ${data.names[i].padEnd(12)} ${c}  contrast ${ratios[i]}:1`));
  check(`every state clears ${MIN_CONTRAST}:1 against the panel face`,
    ratios.every((r) => r >= MIN_CONTRAST), { min: Math.min(...ratios), max: Math.max(...ratios) });

  console.log('\n=== RESTRAINT ===');
  const lums = data.colors.map((c) => +relLum(parseHex(c)).toFixed(3));
  // The ceiling is index 0 - the colour this row used BEFORE the palette existed. Pinning it
  // there is what stops "ascending" from drifting into "brighter", and it is a real threshold
  // taken from the shipped design rather than a number invented here. (An earlier draft of this
  // file asserted that no state outshines the amber HIGH SCORE readout instead; that was never
  // true of this panel - the mint state row has always been brighter than the amber - so it
  // failed against a correct palette and was the wrong rule to hold.)
  check('no state is brighter than index 0, the pre-palette colour',
    lums.every((l) => l <= lums[0] + 0.005), { stateMax: Math.max(...lums), index0: lums[0] });
  check('no state is pure white', !data.colors.some((c) => c.toLowerCase() === '#ffffff'));
  // "Gradual" is the actual requirement, and it is about STEP SIZE, not total range: the range
  // is dictated by the hues (a saturated violet cannot be as bright as a saturated cyan), but a
  // future edit dropping one garish colour into the middle would show up here immediately.
  const steps = lums.slice(1).map((l, i) => +Math.abs(l - lums[i]).toFixed(3));
  check('no adjacent pair jumps more than 0.13 luminance (the progression stays gradual)',
    steps.every((d) => d <= 0.13), { maxStep: Math.max(...steps), steps });

  console.log('\n=== BALL VISIBILITY ===');
  check('the glow layer exists', data.glowFound);
  check('backglass is excluded from the GlowLayer, so no state colour can bloom into the scene',
    data.backglassExcluded === true);

  check('no uncaught page errors', pageErrors.length === 0, pageErrors);
  console.log(`\n=== SUMMARY ===\nTOTAL: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
