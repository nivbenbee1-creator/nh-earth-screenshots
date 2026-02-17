/**
 * NH Real Estate - Google Earth 3D Screenshot Capture v3
 * ======================================================
 * Fixed: only dismiss popups (don't click nav buttons),
 * safer UI hiding, better zoom calibration
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── CLI ARGS ───
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    lat: 36.4072,
    lng: -105.5734,
    acres: 5,
    name: 'parcel',
    output: './screenshots',
    wait: 18,
    width: 1920,
    height: 1080,
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const val = args[i + 1];
    if (key in opts) {
      opts[key] = isNaN(val) ? val : Number(val);
    }
  }
  return opts;
}

// ─── CAMERA VIEWS ───
function calcViews(lat, lng, acres) {
  const side = Math.sqrt(acres * 4047); // parcel side in meters
  const d = side * 3.5;                  // balanced zoom (v1 was 5, v2 was 2.5)

  return [
    { id: '01_topdown_close', label: 'Top-Down Close',         d: d,       h: 0,   t: 0,  fov: 35 },
    { id: '02_topdown_wide',  label: 'Top-Down Wide',          d: d * 3,   h: 0,   t: 0,  fov: 35 },
    { id: '03_north',         label: '3D from North',          d: d * 1.3, h: 0,   t: 65, fov: 35 },
    { id: '04_east',          label: '3D from East',           d: d * 1.3, h: 90,  t: 65, fov: 35 },
    { id: '05_south',         label: '3D from South',          d: d * 1.3, h: 180, t: 65, fov: 35 },
    { id: '06_west',          label: '3D from West',           d: d * 1.3, h: 270, t: 65, fov: 35 },
    { id: '07_cinematic',     label: 'Cinematic Low Angle',    d: d * 0.7, h: 45,  t: 75, fov: 50 },
    { id: '08_context',       label: 'High Altitude Context',  d: d * 8,   h: 0,   t: 30, fov: 35 },
  ];
}

function earthUrl(lat, lng, v) {
  return `https://earth.google.com/web/@${lat},${lng},0a,${Math.round(v.d)}d,${v.fov}y,${v.h}h,${v.t}t,0r`;
}

// ─── DISMISS POPUPS (SAFE - only close/dismiss, never navigate) ───
async function dismissPopups(page) {
  // ONLY click buttons that close/dismiss - NEVER navigation buttons
  const safeSelectors = [
    'button[aria-label="Close"]',
    'button[aria-label="Dismiss"]',
    'button[aria-label="close"]',
    'button:has-text("Got it")',
    'button:has-text("OK")',
    'button:has-text("I agree")',
    'button:has-text("No thanks")',
    'button:has-text("Skip")',
    'button:has-text("Not now")',
    'button:has-text("Later")',
  ];

  for (const sel of safeSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 600 })) {
        console.log(`      [popup] Clicking: ${sel}`);
        await btn.click();
        await page.waitForTimeout(500);
      }
    } catch { /* ignore */ }
  }

  // Press Escape to close any remaining dialogs
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch { /* ignore */ }
}

// ─── HIDE UI (SAFE - target specific known elements, not broad patterns) ───
async function hideUI(page) {
  await page.evaluate(() => {
    // Target SPECIFIC Google Earth UI elements only
    // DO NOT hide broad patterns like 'overlay' or 'panel' - they contain the 3D view!
    const selectorsToHide = [
      // Google Earth specific UI
      '.earth-search-bar',
      '.gm-style-cc',                    // Google attribution
      '[data-label="compass"]',
      '[data-label="navigation"]',
      
      // Known UI bar areas
      'header',
      'nav:not([class*="earth"])',
    ];

    selectorsToHide.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          el.style.setProperty('opacity', '0', 'important');
        });
      } catch {}
    });

    // Hide top bar and bottom bar by position (safer than class matching)
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      
      // Fixed/absolute positioned elements at top or bottom edges (UI bars)
      if ((style.position === 'fixed' || style.position === 'absolute') && 
          el.children.length > 0 &&
          (rect.top < 60 || rect.bottom > window.innerHeight - 60) &&
          rect.width > window.innerWidth * 0.3) {
        el.style.setProperty('opacity', '0', 'important');
      }
    });
  });
  
  await page.waitForTimeout(300);
}

// ─── MAIN CAPTURE ───
async function main() {
  const opts = parseArgs();
  const views = calcViews(opts.lat, opts.lng, opts.acres);
  const outDir = path.resolve(opts.output);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth Capture v3 — GitHub Actions`);
  console.log(`📍 ${opts.lat}, ${opts.lng} | ${opts.acres} acres`);
  console.log(`📁 ${outDir} | ⏱ ${opts.wait}s per view\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--enable-webgl2',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      `--window-size=${opts.width},${opts.height}`,
    ],
  });

  const ctx = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await ctx.newPage();
  const results = [];
  let successCount = 0;

  // FIRST VIEW: extra wait + debug info
  const firstUrl = earthUrl(opts.lat, opts.lng, views[0]);
  console.log(`  [INIT] Loading Google Earth for first time...`);
  console.log(`  [INIT] URL: ${firstUrl}`);
  
  await page.goto(firstUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  
  // Wait for initial load
  await page.waitForTimeout(5000);
  
  // Debug: check WebGL
  try {
    const webglInfo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return 'NO WebGL';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown renderer';
    });
    console.log(`  [INIT] WebGL renderer: ${webglInfo}`);
  } catch { console.log(`  [INIT] WebGL check failed`); }

  // Debug: page title
  const title = await page.title();
  console.log(`  [INIT] Page title: ${title}`);

  // Dismiss popups on first load
  await dismissPopups(page);
  
  // Extra wait for first 3D render
  console.log(`  [INIT] Waiting 25s for first 3D render...`);
  await page.waitForTimeout(25000);
  
  // Dismiss any popups that appeared during render
  await dismissPopups(page);

  console.log(`  [INIT] Ready! Starting captures...\n`);

  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    const url = earthUrl(opts.lat, opts.lng, v);
    const filename = `${v.id}.png`;
    const filepath = path.join(outDir, filename);

    process.stdout.write(`  [${i + 1}/${views.length}] ${v.label} (d=${Math.round(v.d)}m)... `);

    try {
      // For first view, page is already loaded
      if (i > 0) {
        await page.goto(url, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
      }

      // Wait for 3D scene to render
      await page.waitForTimeout(opts.wait * 1000);
      
      // Dismiss popups if any
      await dismissPopups(page);
      await page.waitForTimeout(500);

      // Hide UI chrome (safe method)
      await hideUI(page);

      // Capture
      await page.screenshot({ path: filepath, fullPage: false });
      
      const sizeKB = Math.round(fs.statSync(filepath).size / 1024);
      console.log(`✅ ${sizeKB} KB`);

      results.push({
        view: v.id,
        label: v.label,
        filename,
        url,
        size_kb: sizeKB,
        camera: { distance: Math.round(v.d), heading: v.h, tilt: v.t, fov: v.fov },
      });
      successCount++;

    } catch (err) {
      console.log(`❌ ${err.message.slice(0, 80)}`);
      results.push({ view: v.id, label: v.label, error: err.message.slice(0, 200) });
    }

    await page.waitForTimeout(1000);
  }

  await browser.close();

  // Save manifest
  const manifest = {
    parcel_name: opts.name,
    lat: opts.lat,
    lng: opts.lng,
    acres: opts.acres,
    captured: successCount,
    total: views.length,
    timestamp: new Date().toISOString(),
    images: results,
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Done: ${successCount}/${views.length} screenshots`);
  console.log(`📋 Manifest: ${manifestPath}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
