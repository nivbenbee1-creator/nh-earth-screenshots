/**
 * NH Real Estate - Google Earth 3D Screenshot Capture v5
 * ======================================================
 * KEY FIX: Google Earth Web requires:
 * 1. Click on screen to activate 3D view (otherwise black)
 * 2. Scroll zoom-out (URL distance param is ignored)
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

// ─── ZOOM CALCULATION ───
// How many scroll-up steps needed based on acreage
// More acres = more zoom out needed
function calcZoomSteps(acres) {
  if (acres <= 1) return 15;
  if (acres <= 5) return 20;
  if (acres <= 20) return 25;
  if (acres <= 50) return 28;
  if (acres <= 100) return 32;
  return 35;
}

// ─── CAMERA VIEWS ───
function getViews() {
  return [
    { id: '01_topdown_close', label: 'Top-Down Close',       zoomAdj: 0,  h: 0,   t: 0  },
    { id: '02_topdown_wide',  label: 'Top-Down Wide',        zoomAdj: 8,  h: 0,   t: 0  },
    { id: '03_north',         label: '3D from North',        zoomAdj: 2,  h: 0,   t: 65 },
    { id: '04_east',          label: '3D from East',         zoomAdj: 2,  h: 90,  t: 65 },
    { id: '05_south',         label: '3D from South',        zoomAdj: 2,  h: 180, t: 65 },
    { id: '06_west',          label: '3D from West',         zoomAdj: 2,  h: 270, t: 65 },
    { id: '07_cinematic',     label: 'Cinematic Low Angle',  zoomAdj: -3, h: 45,  t: 75 },
    { id: '08_context',       label: 'High Altitude Context',zoomAdj: 15, h: 0,   t: 30 },
  ];
}

function earthUrl(lat, lng, heading, tilt) {
  // Use large distance in URL as starting point, but real zoom comes from scroll
  return `https://earth.google.com/web/@${lat},${lng},500a,2000d,35y,${heading}h,${tilt}t,0r`;
}

// ─── MAIN CAPTURE ───
async function main() {
  const opts = parseArgs();
  const views = getViews();
  const baseZoom = calcZoomSteps(opts.acres);
  const outDir = path.resolve(opts.output);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth Capture v5 — GitHub Actions`);
  console.log(`📍 ${opts.lat}, ${opts.lng} | ${opts.acres} acres`);
  console.log(`🔍 Base zoom steps: ${baseZoom}`);
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

  const centerX = opts.width / 2;
  const centerY = opts.height / 2;

  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    const url = earthUrl(opts.lat, opts.lng, v.h, v.t);
    const filename = `${v.id}.png`;
    const filepath = path.join(outDir, filename);
    const totalZoom = baseZoom + v.zoomAdj;

    process.stdout.write(`  [${i + 1}/${views.length}] ${v.label} (zoom: ${totalZoom} steps)... `);

    try {
      // Step 1: Navigate
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });

      // Step 2: Wait for page to load
      await page.waitForTimeout(5000);

      // Step 3: Dismiss popups with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Step 4: CLICK on center to activate 3D view!
      await page.mouse.click(centerX, centerY);
      await page.waitForTimeout(2000);

      // Step 5: ZOOM OUT by scrolling up
      for (let z = 0; z < totalZoom; z++) {
        await page.mouse.wheel(0, -300);  // negative = zoom out
        await page.waitForTimeout(150);
      }

      // Step 6: Wait for 3D to render at new zoom level
      await page.waitForTimeout(opts.wait * 1000);

      // Step 7: One more Escape for any popups
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Step 8: Screenshot
      await page.screenshot({ path: filepath, fullPage: false });
      
      const sizeKB = Math.round(fs.statSync(filepath).size / 1024);
      console.log(`✅ ${sizeKB} KB`);

      results.push({
        view: v.id,
        label: v.label,
        filename,
        url,
        size_kb: sizeKB,
        zoom_steps: totalZoom,
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
