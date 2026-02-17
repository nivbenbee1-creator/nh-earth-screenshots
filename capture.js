/**
 * NH Earth - Simple Test v6
 * Open via /search/ URL, screenshot, click 3D, 3 more screenshots
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const lat = process.argv[2] || '30.4236';
  const lng = process.argv[3] || '-83.12435';
  const outDir = './screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth Test v6`);
  console.log(`📍 ${lat}, ${lng}\n`);

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
      '--window-size=1920,1080',
    ],
  });

  const page = await (await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  })).newPage();

  // Step 1: Open via search URL
  const url = `https://earth.google.com/web/search/${lat},${lng}`;
  console.log(`[1] Opening: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // Step 2: Wait for load
  console.log(`[2] Waiting 15s for load...`);
  await page.waitForTimeout(15000);

  // Step 3: Escape any popups
  console.log(`[3] Pressing Escape...`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Step 4: Screenshot 2D view
  await page.screenshot({ path: path.join(outDir, '01_2d_view.png') });
  console.log(`[4] ✅ 01_2d_view.png`);

  // Step 5: Close the info card (click X)
  console.log(`[5] Closing info card...`);
  try {
    // Try clicking the X button on the info card
    const closeBtn = page.locator('button[aria-label="Close"]').first();
    if (await closeBtn.isVisible({ timeout: 2000 })) {
      await closeBtn.click();
      console.log(`    Clicked Close button`);
    }
  } catch {}
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Step 6: Screenshot without card
  await page.screenshot({ path: path.join(outDir, '02_2d_clean.png') });
  console.log(`[6] ✅ 02_2d_clean.png`);

  // Step 7: Click 3D button (bottom left area)
  console.log(`[7] Clicking 3D button...`);
  try {
    // Look for 3D/2D toggle button
    const btn3d = page.locator('button:has-text("3D")').first();
    if (await btn3d.isVisible({ timeout: 2000 })) {
      await btn3d.click();
      console.log(`    Clicked 3D button`);
    } else {
      // Try clicking by position (bottom left where 3D button usually is)
      console.log(`    3D button not found, clicking position (155, 785)...`);
      await page.mouse.click(155, 785);
    }
  } catch {
    console.log(`    Fallback: clicking position (155, 785)...`);
    await page.mouse.click(155, 785);
  }

  // Step 8: Take 3 screenshots every 2 seconds
  for (let i = 1; i <= 3; i++) {
    console.log(`[8.${i}] Waiting 2s...`);
    await page.waitForTimeout(2000);
    const name = `03_3d_${i}.png`;
    await page.screenshot({ path: path.join(outDir, name) });
    const sizeKB = Math.round(fs.statSync(path.join(outDir, name)).size / 1024);
    console.log(`[8.${i}] ✅ ${name} (${sizeKB} KB)`);
  }

  // Step 9: Wait longer and take final screenshot
  console.log(`[9] Waiting 10s for full 3D render...`);
  await page.waitForTimeout(10000);
  await page.screenshot({ path: path.join(outDir, '04_3d_final.png') });
  console.log(`[9] ✅ 04_3d_final.png`);

  await browser.close();
  console.log(`\n✅ Done! Check screenshots folder.`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
