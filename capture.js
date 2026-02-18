/**
 * NH Earth v18d - Clean cropped screenshots, faster
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const lat = process.argv[2] || '36.39989338';
  const lng = process.argv[3] || '-105.57340046';
  const outDir = './screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth v18d\n📍 ${lat}, ${lng}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--enable-webgl2',
      '--disable-dev-shm-usage', '--no-sandbox',
      '--disable-setuid-sandbox', '--window-size=2560,1440',
    ],
  });

  const page = await (await browser.newContext({
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
  })).newPage();

  console.log(`[1] Opening...`);
  await page.goto(`https://earth.google.com/web/search/${lat},${lng}`, {
    waitUntil: 'domcontentloaded', timeout: 45000
  });
  console.log(`[2] Waiting 12s...`);
  await page.waitForTimeout(12000);

  // Dismiss banner
  try {
    const d = page.locator('text=Dismiss').first();
    if (await d.isVisible({ timeout: 1000 })) await d.click();
  } catch {}
  await page.waitForTimeout(500);

  // Close popup
  await page.mouse.click(1280, 720);
  await page.waitForTimeout(1000);

  // Close info card
  try {
    const closeBtn = page.locator('[aria-label="Close"]').first();
    if (await closeBtn.isVisible({ timeout: 1000 })) await closeBtn.click();
  } catch {}
  await page.waitForTimeout(500);

  const crop = { x: 320, y: 180, width: 1920, height: 1080 };
  const cx = 1280, cy = 720;

  async function tilt(upPixels) {
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

  async function rotate(rightPixels) {
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

  console.log(`[3] Tilting to horizon...`);
  await tilt(500);
  await page.waitForTimeout(1500);
  await tilt(500);
  await page.waitForTimeout(2000);

  console.log(`[4] View 1: Front...`);
  await page.screenshot({ path: path.join(outDir, '01_3d_front.png'), clip: crop });
  console.log(`    ✅ 01_3d_front.png`);

  console.log(`[5] View 2: Right...`);
  await rotate(300);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '02_3d_right.png'), clip: crop });
  console.log(`    ✅ 02_3d_right.png`);

  console.log(`[6] View 3: Back...`);
  await rotate(400);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '03_3d_back.png'), clip: crop });
  console.log(`    ✅ 03_3d_back.png`);

  console.log(`[7] View 4: Left...`);
  await rotate(300);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '04_3d_left.png'), clip: crop });
  console.log(`    ✅ 04_3d_left.png`);

  await browser.close();
  console.log(`\n✅ Done! 4 clean screenshots captured.`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
