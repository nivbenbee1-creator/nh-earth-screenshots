/**
 * NH Real Estate - Google Earth 3D Screenshot Capture v2
 * ======================================================
 * Fixed: popup dismissal, zoom levels, UI hiding
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
    wait: 18,         // increased wait for better render
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
  const d = side * 2.5;                  // CLOSER zoom (was *5)

  return [
    { id: '01_topdown_close', label: 'Top-Down Close',         d: d,       h: 0,   t: 0,  fov: 35 },
    { id: '02_topdown_wide',  label: 'Top-Down Wide',          d: d * 3,   h: 0,   t: 0,  fov: 35 },
    { id: '03_north',         label: '3D from North',          d: d * 1.2, h: 0,   t: 65, fov: 35 },
    { id: '04_east',          label: '3D from East',           d: d * 1.2, h: 90,  t: 65, fov: 35 },
    { id: '05_south',         label: '3D from South',          d: d * 1.2, h: 180, t: 65, fov: 35 },
    { id: '06_west',          label: '3D from West',           d: d * 1.2, h: 270, t: 65, fov: 35 },
    { id: '07_cinematic',     label: 'Cinematic Low Angle',    d: d * 0.6, h: 45,  t: 75, fov: 50 },
    { id: '08_context',       label: 'High Altitude Context',  d: d * 6,   h: 0,   t: 30, fov: 35 },
  ];
}

function earthUrl(lat, lng, v) {
  return `https://earth.google.com/web/@${lat},${lng},0a,${Math.round(v.d)}d,${v.fov}y,${v.h}h,${v.t}t,0r`;
}

// ─── DISMISS ALL POPUPS ───
async function dismissPopups(page) {
  // Round 1: specific known popups
  const dismissSelectors = [
    // Close/X buttons
    'button[aria-label="Close"]',
    'button[aria-label="Dismiss"]',
    'button[aria-label="close"]',
    
    // "New from Google Earth" popup buttons
    'button:has-text("See plans")',
    'button:has-text("Explore data layers")',
    
    // General consent/welcome
    'button:has-text("Got it")',
    'button:has-text("OK")',
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    'button:has-text("No thanks")',
    'button:has-text("Skip")',
    'button:has-text("Later")',
    'button:has-text("Not now")',
    '[data-dismiss]',
  ];

  for (const sel of dismissSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 800 })) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    } catch { /* ignore */ }
  }

  // Round 2: close any modal/dialog overlay by clicking X or pressing Escape
  try {
    // Try clicking any visible close button inside dialogs
    const closeButtons = page.locator('dialog button, [role="dialog"] button, .modal button').first();
    if (await closeButtons.isVisible({ timeout: 500 })) {
      await closeButtons.click();
    }
  } catch { /* ignore */ }

  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch { /* ignore */ }
}

// ─── HIDE UI ELEMENTS ───
async function hideUI(page) {
  await page.evaluate(() => {
    // Hide by class patterns
    const patterns = [
      'search', 'toolbar', 'sidebar', 'panel', 'menu', 'compass',
      'legend', 'footer', 'flyto', 'bottom', 'attribution', 'control',
      'drawer', 'overlay', 'dialog', 'modal', 'banner', 'header',
      'nav', 'topbar', 'chip', 'toast', 'snackbar', 'promo',
    ];
    
    patterns.forEach(pattern => {
      document.querySelectorAll(`[class*="${pattern}"]`).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
    });

    // Hide by role
    ['dialog', 'banner', 'navigation', 'complementary'].forEach(role => {
      document.querySelectorAll(`[role="${role}"]`).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
    });

    // Hide specific Google Earth UI elements
    document.querySelectorAll('header, nav, aside, .gm-style-cc').forEach(el => {
      el.style.setProperty('display', 'none', 'important');
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

  console.log(`\n🌍 NH Earth Capture v2 — GitHub Actions`);
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
      '--disable-features=TranslateUI',
      '--disable-notifications',
      `--window-size=${opts.width},${opts.height}`,
    ],
  });

  const ctx = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    permissions: ['geolocation'],
  });

  const page = await ctx.newPage();
  
  // Block unnecessary requests to speed up loading
  await page.route('**/*.{woff,woff2,ttf}', route => route.abort());

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

      // Dismiss popups immediately
      await page.waitForTimeout(2000);
      await dismissPopups(page);
      
      // Wait for 3D scene to render
      await page.waitForTimeout(opts.wait * 1000);
      
      // Dismiss any popups that appeared during render
      await dismissPopups(page);

      // Hide UI chrome
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
