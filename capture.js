/**
 * NH Earth - Test v7
 * Fix: 3D button is bottom-RIGHT, add zoom out
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const lat = process.argv[2] || '36.39989338';
  const lng = process.argv[3] || '-105.57340046';
  const outDir = './screenshots';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🌍 NH Earth Test v7`);
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

  // Step 3: Dismiss popups
  console.log(`[3] Dismissing popups...`);
  // Click "Dismiss" link if visible
  try {
    const dismiss = page.locator('text=Dismiss').first();
    if (await dismiss.isVisible({ timeout: 1500 })) {
      await dismiss.click();
      console.log(`    Clicked Dismiss`);
    }
  } catch {}
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Step 4: Close info card
  console.log(`[4] Closing info card...`);
  try {
    const closeBtn = page.locator('button[aria-label="Close"]').first();
    if (await closeBtn.isVisible({ timeout: 1500 })) {
      await closeBtn.click();
      console.log(`    Closed info card`);
    }
  } catch {}
  await page.waitForTimeout(1000);

  // Step 5: Slight zoom out (5 scroll steps)
  console.log(`[5] Zooming out slightly...`);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 300); // positive = zoom out in Google Earth
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(2000);

  // Step 6: Screenshot 2D
  await page.screenshot({ path: path.join(outDir, '01_2d_view.png') });
  console.log(`[6] ✅ 01_2d_view.png`);

  // Step 7: Click 3D button (bottom RIGHT - around x=1329, y=769)
  console.log(`[7] Clicking 3D button...`);
  try {
    // First try finding the actual button
    const btn3d = page.locator('button:has-text("3D")').first();
    if (await btn3d.isVisible({ timeout: 2000 })) {
      await btn3d.click();
      console.log(`    Clicked 3D button via selector`);
    } else {
      // Fallback: click by position (bottom right area)
      console.log(`    Trying position click (1329, 769)...`);
      await page.mouse.click(1329, 769);
    }
  } catch {
    console.log(`    Fallback position click (1329, 769)...`);
    await page.mouse.click(1329, 769);
  }
  await page.waitForTimeout(2000);

  // Step 8: Take screenshots as 3D loads
  for (let i = 1; i <= 5; i++) {
    console.log(`[8.${i}] Waiting 3s...`);
    await page.waitForTimeout(3000);
    const name = `02_3d_${i}.png`;
    await page.screenshot({ path: path.join(outDir, name) });
    const sizeKB = Math.round(fs.statSync(path.join(outDir, name)).size / 1024);
    console.log(`[8.${i}] ✅ ${name} (${sizeKB} KB)`);
  }

  await browser.close();
  console.log(`\n✅ Done!`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
