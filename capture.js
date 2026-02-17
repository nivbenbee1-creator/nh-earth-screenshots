/**
 * NH Earth v8 - Shift+drag for 3D tilt
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const lat = process.argv[2] || '36.39989338';
  const lng = process.argv[3] || '-105.57340046';
  const outDir = './screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth v8\n📍 ${lat}, ${lng}\n`);

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

// Dismiss banners and popups, but NOT the info card
  try {
    const d = page.locator('text=Dismiss').first();
    if (await d.isVisible({ timeout: 1000 })) await d.click();
  } catch {}
  await page.waitForTimeout(500);
  // Close "New from Google Earth" popup X button
  try {
    const popup = page.locator('[aria-label="Close"]').first();
    if (await popup.isVisible({ timeout: 1500 })) await popup.click();
    console.log('    Closed popup');
  } catch {}
  await page.waitForTimeout(1000);

  // Tilt to 3D using Shift + mouse drag (drag UP = tilt forward)
  console.log(`[4] Tilting to 3D with Shift+drag...`);
  const cx = 960, cy = 540; // center of screen
  await page.mouse.move(cx, cy);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  // Drag upward slowly (100px up in 10 steps)
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(cx, cy - (i * 15));
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  await page.keyboard.up('Shift');

  console.log(`[5] Waiting 5s for 3D render...`);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, '02_3d_tilt1.png') });
  console.log(`[5] ✅ 02_3d_tilt1.png`);

  // More tilt
  console.log(`[6] More tilt...`);
  await page.mouse.move(cx, cy);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  for (let i = 0; i < 15; i++) {
    await page.mouse.move(cx, cy - (i * 15));
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, '03_3d_tilt2.png') });
  console.log(`[6] ✅ 03_3d_tilt2.png`);

  // Rotate view (drag horizontally with middle mouse or Shift)
  console.log(`[7] Rotating...`);
  await page.mouse.move(cx, cy);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  for (let i = 0; i < 15; i++) {
    await page.mouse.move(cx + (i * 20), cy);
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, '04_3d_rotated.png') });
  console.log(`[7] ✅ 04_3d_rotated.png`);

  await browser.close();
  console.log(`\n✅ Done!`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
