/**
 * NH Real Estate - Google Earth 3D Screenshot Capture
 * =====================================================
 * Runs Playwright with SwiftShader (software WebGL) to capture
 * Google Earth Web 3D views. Designed for GitHub Actions.
 * 
 * Usage:
 *   node capture.js --lat 36.4072 --lng -105.5734 --acres 5 --name "My Parcel"
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
    wait: 15,         // seconds to wait for 3D render
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
  const d = side * 5;                    // base camera distance

  return [
    { id: '01_topdown_close', label: 'Top-Down Close',         d: d,       h: 0,   t: 0,  fov: 35 },
    { id: '02_topdown_wide',  label: 'Top-Down Wide',          d: d * 4,   h: 0,   t: 0,  fov: 35 },
    { id: '03_north',         label: '3D from North',          d: d * 1.5, h: 0,   t: 65, fov: 35 },
    { id: '04_east',          label: '3D from East',           d: d * 1.5, h: 90,  t: 65, fov: 35 },
    { id: '05_south',         label: '3D from South',          d: d * 1.5, h: 180, t: 65, fov: 35 },
    { id: '06_west',          label: '3D from West',           d: d * 1.5, h: 270, t: 65, fov: 35 },
    { id: '07_cinematic',     label: 'Cinematic Low Angle',    d: d * 0.8, h: 45,  t: 75, fov: 50 },
    { id: '08_context',       label: 'High Altitude Context',  d: d * 10,  h: 0,   t: 45, fov: 35 },
  ];
}

function earthUrl(lat, lng, v) {
  return `https://earth.google.com/web/@${lat},${lng},0a,${Math.round(v.d)}d,${v.fov}y,${v.h}h,${v.t}t,0r`;
}

// ─── MAIN CAPTURE ───
async function main() {
  const opts = parseArgs();
  const views = calcViews(opts.lat, opts.lng, opts.acres);
  const outDir = path.resolve(opts.output);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth Capture — GitHub Actions`);
  console.log(`📍 ${opts.lat}, ${opts.lng} | ${opts.acres} acres`);
  console.log(`📁 ${outDir} | ⏱ ${opts.wait}s per view\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      // SwiftShader: software WebGL rendering (no GPU needed!)
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--enable-webgl2',
      
      // Performance
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      
      // Window
      `--window-size=${opts.width},${opts.height}`,
    ],
  });

  const ctx = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 2,  // Retina quality
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await ctx.newPage();
  const results = [];
  let successCount = 0;

  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    const url = earthUrl(opts.lat, opts.lng, v);
    const filename = `${v.id}.png`;
    const filepath = path.join(outDir, filename);

    process.stdout.write(`  [${i + 1}/${views.length}] ${v.label}... `);

    try {
      // Navigate
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });

      // Dismiss Google Earth popups/welcome dialogs
      const dismissSelectors = [
        'button[aria-label="Close"]',
        'button[aria-label="Dismiss"]',
        'button:has-text("Got it")',
        'button:has-text("OK")',
        'button:has-text("Accept")',
        'button:has-text("I agree")',
        '[data-dismiss]',
      ];

      for (const sel of dismissSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1500 })) {
            await btn.click();
            await page.waitForTimeout(300);
          }
        } catch { /* ignore */ }
      }

      // Wait for 3D scene to render via SwiftShader
      await page.waitForTimeout(opts.wait * 1000);

      // Hide UI chrome for clean screenshot
      await page.evaluate(() => {
        const hide = [
          '[class*="search"]', '[class*="toolbar"]', '[class*="sidebar"]',
          '[class*="panel"]', '[class*="menu"]', '[class*="compass"]',
          '[class*="legend"]', '[class*="footer"]', '[class*="flyto"]',
          '[class*="bottom"]', '[class*="attribution"]', '[class*="control"]',
          '[class*="drawer"]', '[class*="overlay"]',
        ];
        hide.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.setProperty('display', 'none', 'important');
          });
        });
      });
      await page.waitForTimeout(500);

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
