/**
 * NH Real Estate - Google Earth 3D Screenshot Capture v4
 * ======================================================
 * Based on v1 (which WORKED). Minimal changes:
 * - Only Escape key for popup dismissal
 * - NO UI hiding (v2/v3 broke by hiding the globe itself)
 * - Slightly closer zoom than v1
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
    wait: 15,
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
  const side = Math.sqrt(acres * 4047);
  const d = side * 3.5;                  // v1 was *5 (too far), trying *3.5

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

// ─── MAIN CAPTURE ───
async function main() {
  const opts = parseArgs();
  const views = calcViews(opts.lat, opts.lng, opts.acres);
  const outDir = path.resolve(opts.output);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth Capture v4 — GitHub Actions`);
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

  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    const url = earthUrl(opts.lat, opts.lng, v);
    const filename = `${v.id}.png`;
    const filepath = path.join(outDir, filename);

    process.stdout.write(`  [${i + 1}/${views.length}] ${v.label} (d=${Math.round(v.d)}m)... `);

    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });

      // SAFE popup dismissal: only Escape key
      // (v2 broke by clicking nav buttons, v3 broke by hiding the globe)
      await page.waitForTimeout(3000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Wait for 3D scene to render
      await page.waitForTimeout(opts.wait * 1000);

      // One more Escape in case popup reappeared
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Screenshot - NO UI hiding, just capture as-is
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
