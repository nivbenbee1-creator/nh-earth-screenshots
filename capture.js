/**
 * NH Earth v10 - 4 diverse 3D views + visible pin
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const lat = process.argv[2] || '36.39989338';
  const lng = process.argv[3] || '-105.57340046';
  const outDir = './screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth v10\n📍 ${lat}, ${lng}\n`);

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

  // Close popup by clicking outside
  await page.mouse.click(100, 700);
  await page.waitForTimeout(1000);

  // Inject visible pin marker at screen center
  await page.evaluate(() => {
    const pin = document.createElement('div');
    pin.id = 'nh-pin';
    pin.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -100%);
        z-index: 999999;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
      ">
        <div style="
          width: 30px;
          height: 30px;
          background: #EF4444;
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        "></div>
        <div style="
          width: 8px;
          height: 8px;
          background: rgba(0,0,0,0.3);
          border-radius: 50%;
          margin-top: 2px;
        "></div>
      </div>
    `;
    document.body.appendChild(pin);
  });
  console.log(`[3] Pin marker injected`);

  // Helper: tilt camera with Shift+drag
  async function tilt(upPixels) {
    const cx = 960, cy = 540;
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    const steps = 15;
    for (let i = 0; i <= steps; i++) {
      await page.mouse.move(cx, cy - (upPixels * i / steps));
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.keyboard.up('Shift');
  }

  // Helper: rotate camera with Shift+horizontal drag
  async function rotate(rightPixels) {
    const cx = 960, cy = 540;
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    const steps = 15;
    for (let i = 0; i <= steps; i++) {
      await page.mouse.move(cx + (rightPixels * i / steps), cy);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.keyboard.up('Shift');
  }

  // === VIEW 1: Medium tilt, no rotation ===
  console.log(`[4] View 1: Medium tilt...`);
  await tilt(200);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, '01_3d_front.png') });
  console.log(`    ✅ 01_3d_front.png`);

  // === VIEW 2: Keep tilting + rotate 90° right ===
  console.log(`[5] View 2: More tilt + rotate right...`);
  await tilt(80);
  await rotate(250);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, '02_3d_right.png') });
  console.log(`    ✅ 02_3d_right.png`);

  // === VIEW 3: Rotate 180° (opposite side) ===
  console.log(`[6] View 3: Rotate to opposite side...`);
  await rotate(350);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, '03_3d_back.png') });
  console.log(`    ✅ 03_3d_back.png`);

  // === VIEW 4: Rotate 90° more (left side) ===
  console.log(`[7] View 4: Rotate to left side...`);
  await rotate(250);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, '04_3d_left.png') });
  console.log(`    ✅ 04_3d_left.png`);

  await browser.close();
  console.log(`\n✅ Done! 4 screenshots captured.`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
