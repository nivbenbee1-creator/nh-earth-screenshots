/**
 * NH Earth v9 - Smart popup + Shift+drag for 3D tilt
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const lat = process.argv[2] || '36.39989338';
  const lng = process.argv[3] || '-105.57340046';
  const outDir = './screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth v9\n📍 ${lat}, ${lng}\n`);

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

  // Dismiss "Find and manage all your projects" banner
  try {
    const d = page.locator('text=Dismiss').first();
    if (await d.isVisible({ timeout: 1000 })) {
      await d.click();
      console.log(`[3] Dismissed banner`);
    }
  } catch {}
  await page.waitForTimeout(500);

// Close popup by clicking outside it (on the map)
  console.log(`[3] Closing popup...`);
  await page.mouse.click(100, 700);
  await page.waitForTimeout(1000);

  // Screenshot 2D
  await page.screenshot({ path: path.join(outDir, '01_2d.png') });
  console.log(`[4] ✅ 01_2d.png`);

  // Tilt to 3D using Shift + mouse drag (drag UP = tilt forward)
  console.log(`[5] Tilting to 3D with Shift+drag...`);
  const cx = 960, cy = 540;
  await page.mouse.move(cx, cy);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(cx, cy - (i * 15));
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  await page.keyboard.up('Shift');

  console.log(`[6] Waiting 5s for 3D render...`);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, '02_3d_tilt1.png') });
  console.log(`[6] ✅ 02_3d_tilt1.png`);

  // More tilt
  console.log(`[7] More tilt...`);
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
  console.log(`[7] ✅ 03_3d_tilt2.png`);

  // Rotate view
  console.log(`[8] Rotating...`);
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
  console.log(`[8] ✅ 04_3d_rotated.png`);

  await browser.close();
  console.log(`\n✅ Done!`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
