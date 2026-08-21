// SPIRITBALL TITLE FIT guard.
//
// The title screen's wordmark is the one piece of type on the screen that CANNOT wrap, cannot
// shrink to fit, and cannot be clipped - and it is sized in vw, so a change to its font stack,
// its tracking, or the overlay's gutters can break it at one viewport width while looking
// perfect at every other. This file makes that loud.
//
// The interesting part is the WIDEST-FACE check. --title-font is a fallback stack, so the face
// that actually renders depends entirely on the player's machine, and the widest realistic
// outcome is much wider than anything installed on a CI box. Measured em-advances for
// "SPIRITBALL" at 0.09em tracking: Liberation Sans Bold 6.79em, DejaVu Sans Bold 7.36em; Arial
// Black - the likely resolution on stock Windows, where Futura/Century Gothic/Poppins are all
// absent - runs about 1.13x Arial Bold, so ~7.68em. Testing only the locally installed face
// would therefore pass a layout that overflows for a large share of real players.
//
// So each viewport is checked twice: once as it actually renders here, and once with the line
// forced to a 7.8em advance (widest available face, tracking padded up to the budget). The
// forced case is deliberately pessimistic - it applies 7.8em AFTER the narrow-width tracking
// reduction, i.e. it stands in for a face wider still than Arial Black - and it is the check
// that sets the clamp's floor.
//
// Scope: layout only. Nothing here asserts colour, shadow construction or font choice; those are
// design decisions that should be free to change without turning this file red.
//
// Usage:
//   python3 -m http.server 8971            (serve the repo root, from any directory)
//   node qa/title-fit.js
//   PORT=8971 node qa/title-fit.js          (override the default port)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = process.env.PORT || 8971;
const BASE = `http://localhost:${PORT}/index.html`;
const LAUNCH_OPTS = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
};

// The budget the hero's font-size clamp is designed against. See the comment above.
const WIDEST_FACE_EM = 7.8;

// Narrowest supported width first; 420 is included because it is the tightest point ABOVE the
// clamp's floor, where the vw term is doing all the work and no tracking reduction applies.
const VIEWPORTS = [
  [320, 568, true], [360, 640, true], [375, 667, true], [390, 844, true], [412, 915, true],
  [420, 900, false], [480, 900, false], [768, 900, false], [1024, 700, false], [1280, 900, false]
];

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond, detail });
  console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${label}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const pageErrors = [];

  console.log('=== TITLE FIT ===');
  for (const [w, h, touch] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    page.on('pageerror', (e) => pageErrors.push(`${w}x${h}: ${String(e)}`));
    await page.goto(BASE, { waitUntil: 'load' });
    // The menu is shown by main() after Babylon/Havok finish booting, so the overlay does not
    // exist at load - wait for it rather than for a fixed delay.
    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('menu-overlay')).display !== 'none',
      null, { timeout: 30000 }
    );

    const m = await page.evaluate((widestEm) => {
      const h1 = document.getElementById('menu-overlay-heading');
      const sub = document.querySelector('#menu-overlay .title-sub');
      const overlay = document.getElementById('menu-overlay');
      // Range measurement, not getBoundingClientRect(): both elements are block-level and would
      // otherwise report the full container width regardless of how much ink is in them.
      const ink = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
      const cs = getComputedStyle(h1);
      const em = parseFloat(cs.fontSize);
      const pad = parseFloat(getComputedStyle(overlay).paddingLeft) + parseFloat(getComputedStyle(overlay).paddingRight);
      const avail = overlay.clientWidth - pad;

      // Forced widest face: swap to the widest family present, then pad tracking until the line
      // measures the budgeted advance. 10 gaps for a 10-character word.
      const prevFamily = h1.style.fontFamily, prevTrack = h1.style.letterSpacing;
      h1.style.fontFamily = '"DejaVu Sans"';
      const naturalEm = ink(h1) / em;
      h1.style.letterSpacing = (parseFloat(cs.letterSpacing) / em + Math.max(0, (widestEm - naturalEm) / 10)) + 'em';
      const worst = ink(h1);
      h1.style.fontFamily = prevFamily; h1.style.letterSpacing = prevTrack;

      return {
        size: Math.round(em), avail: Math.round(avail),
        titleInk: Math.round(ink(h1)), subInk: Math.round(ink(sub)),
        worst: Math.round(worst), worstEm: +(worst / em).toFixed(2),
        // line-height is 0.95, so one line is 0.95em tall; anything taller means it wrapped.
        lines: Math.round(h1.getBoundingClientRect().height / (em * 0.95)),
        pageOverflows: document.documentElement.scrollWidth > overlay.clientWidth,
        overlayScrolls: overlay.scrollHeight > overlay.clientHeight + 1
      };
    }, WIDEST_FACE_EM);

    const label = `${w}x${h}`;
    check(`${label}: wordmark stays on one line`, m.lines === 1, { lines: m.lines, size: m.size });
    check(`${label}: wordmark fits the usable width`, m.titleInk <= m.avail, { ink: m.titleInk, avail: m.avail });
    check(`${label}: subtitle fits the usable width`, m.subInk <= m.avail, { ink: m.subInk, avail: m.avail });
    check(`${label}: still fits at the widest realistic face`, m.worst <= m.avail, { worst: m.worst, em: m.worstEm, avail: m.avail });
    check(`${label}: nothing overflows or scrolls`, !m.pageOverflows && !m.overlayScrolls, { pageOverflows: m.pageOverflows, overlayScrolls: m.overlayScrolls });
    await page.close();
  }

  check('no uncaught page errors', pageErrors.length === 0, pageErrors);
  await browser.close();

  console.log('\n=== SUMMARY ===');
  const totalPass = results.filter((x) => x.pass).length;
  const totalFail = results.filter((x) => !x.pass).length;
  console.log(`TOTAL: ${totalPass} passed, ${totalFail} failed`);
  process.exit(totalFail > 0 ? 1 : 0);
})();
