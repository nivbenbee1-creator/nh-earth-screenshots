/**
 * NH Earth v13 - Working version, 3s waits
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const lat = process.argv[2] || '36.39989338';
  const lng = process.argv[3] || '-105.57340046';
  const outDir = './screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth v13\n📍 ${lat}, ${lng}\n`);

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

  // Helper: tilt
  async function tilt(upPixels) {
    const cx = 960, cy = 540;
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    for (let i = 0; i <= 15; i++) {
      await page.mouse.move(cx, cy - (upPixels * i / 15));
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
    for (let i = 0; i <= 15; i++) {
      await page.mouse.move(cx + (rightPixels * i / 15), cy);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.keyboard.up('Shift');
  }

  // === VIEW 1: 2D top-down ===
  console.log(`[3] View 1: 2D top-down...`);
  await page.screenshot({ path: path.join(outDir, '01_2d_top.png') });
  console.log(`    ✅ 01_2d_top.png`);

  // === VIEW 2: Light tilt ===
  console.log(`[4] View 2: Light tilt...`);
  await tilt(150);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '02_3d_overview.png') });
  console.log(`    ✅ 02_3d_overview.png`);

  // === VIEW 3: Strong tilt + rotate right ===
  console.log(`[5] View 3: Strong tilt + rotate...`);
  await tilt(120);
  await rotate(250);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '03_3d_dramatic_right.png') });
  console.log(`    ✅ 03_3d_dramatic_right.png`);

  // === VIEW 4: Rotate to opposite side ===
  console.log(`[6] View 4: Opposite side...`);
  await rotate(350);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '04_3d_dramatic_back.png') });
  console.log(`    ✅ 04_3d_dramatic_back.png`);

  // === VIEW 5: More rotate + more tilt ===
  console.log(`[7] View 5: Very dramatic angle...`);
  await rotate(250);
  await tilt(80);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '05_3d_dramatic_left.png') });
  console.log(`    ✅ 05_3d_dramatic_left.png`);

  // === VIEW 6: Final rotate ===
  console.log(`[8] View 6: Final angle...`);
  await rotate(300);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '06_3d_final.png') });
  console.log(`    ✅ 06_3d_final.png`);

  await browser.close();
  console.log(`\n✅ Done! 6 screenshots captured.`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
