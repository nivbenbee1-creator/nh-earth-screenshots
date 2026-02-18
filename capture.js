/**
 * NH Earth v18 - Clean cropped screenshots (no UI)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const lat = process.argv[2] || '36.39989338';
  const lng = process.argv[3] || '-105.57340046';
  const outDir = './screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth v18\n📍 ${lat}, ${lng}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--enable-webgl2',
      '--disable-dev-shm-usage', '--no-sandbox',
      '--disable-setuid-sandbox', '--window-size=1920,1080',
    ],
  });

  const page = await (await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  })).newPage();

  // Load
  console.log(`[1] Opening...`);
  await page.goto(`https://earth.google.com/web/search/${lat},${lng}`, {
    waitUntil: 'domcontentloaded', timeout: 45000
  });
  console.log(`[2] Waiting 15s...`);
  await page.waitForTimeout(15000);

  // Dismiss banner
  try {
    const d = page.locator('text=Dismiss').first();
    if (await d.isVisible({ timeout: 1000 })) await d.click();
  } catch {}
  await page.waitForTimeout(500);

  // Close popup
  await page.mouse.click(100, 700);
  await page.waitForTimeout(1000);

  // Hide ALL UI elements for clean screenshots
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Hide everything except the Earth canvas */
      .earth-toolbar-container,
      .gm-compass,
      .gm-navigation-widget,
      .search-container,
      .earth-search,
      .bottom-bar,
      .earth-attribution,
      .feature-card,
      .info-card,
      .place-card,
      .search-results,
      .legend-container,
      [class*="toolbar"],
      [class*="search"],
      [class*="panel"],
      [class*="sidebar"],
      [class*="navigation"],
      [class*="compass"],
      [class*="zoom"],
      [class*="attribution"],
      [class*="bottom"],
      [class*="menu"],
      [class*="header"],
      [class*="footer"],
      [class*="card"],
      [class*="toast"],
      [class*="banner"],
      [class*="modal"],
      [class*="dialog"],
      [class*="overlay"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `;
    document.head.appendChild(style);
  });
  await page.waitForTimeout(500);

  // Helper: tilt
  async function tilt(upPixels) {
    const cx = 960, cy = 540;
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    for (let i = 0; i <= 20; i++) {
      await page.mouse.move(cx, cy - (upPixels * i / 20));
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.keyboard.up('Shift');
  }

  // Helper: rotate
  async function rotate(rightPixels) {
    const cx = 960, cy = 540;
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    for (let i = 0; i <= 20; i++) {
      await page.mouse.move(cx + (rightPixels * i / 20), cy);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.keyboard.up('Shift');
  }

  // === Big initial tilt to get horizon view ===
  console.log(`[3] Tilting to horizon...`);
  await tilt(450);
  await page.waitForTimeout(2000);
  await tilt(450);
  await page.waitForTimeout(3000);

  // === VIEW 1: Front ===
  console.log(`[4] View 1: Front horizon...`);
  await page.screenshot({ path: path.join(outDir, '01_3d_front.png') });
  console.log(`    ✅ 01_3d_front.png`);

  // === VIEW 2: Rotate 90° right ===
  console.log(`[5] View 2: Right side...`);
  await rotate(250);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '02_3d_right.png') });
  console.log(`    ✅ 02_3d_right.png`);

  // === VIEW 3: Rotate 180° (back) ===
  console.log(`[6] View 3: Back side...`);
  await rotate(350);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '03_3d_back.png') });
  console.log(`    ✅ 03_3d_back.png`);

  // === VIEW 4: Rotate 90° more (left) ===
  console.log(`[7] View 4: Left side...`);
  await rotate(250);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '04_3d_left.png') });
  console.log(`    ✅ 04_3d_left.png`);

  await browser.close();
  console.log(`\n✅ Done! 4 clean screenshots captured.`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
