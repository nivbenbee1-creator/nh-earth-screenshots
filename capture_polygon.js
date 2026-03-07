/**
 * NH Earth Polygon v7 - פשוט ואמין
 * - אין terrain sampling (לא עובד ב-headless)
 * - פוליגון גבוה 300m = תמיד מעל הקרקע
 * - תאורה קבועה = אין חושך
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';

const SHOTS = [
  { name: 'low_08_01_front',  heading: 0,   pitch: -8,  distance: 800 },
  { name: 'low_08_02_right',  heading: 90,  pitch: -8,  distance: 800 },
  { name: 'low_08_03_back',   heading: 180, pitch: -8,  distance: 800 },
  { name: 'low_08_04_left',   heading: 270, pitch: -8,  distance: 800 },
  { name: 'mid_18_01_front',  heading: 0,   pitch: -18, distance: 600 },
  { name: 'mid_18_02_right',  heading: 90,  pitch: -18, distance: 600 },
  { name: 'mid_18_03_back',   heading: 180, pitch: -18, distance: 600 },
  { name: 'mid_18_04_left',   heading: 270, pitch: -18, distance: 600 },
  { name: 'zoom_18_01_front', heading: 0,   pitch: -18, distance: 300 },
  { name: 'zoom_18_02_right', heading: 90,  pitch: -18, distance: 300 },
  { name: 'zoom_18_03_back',  heading: 180, pitch: -18, distance: 300 },
  { name: 'zoom_18_04_left',  heading: 270, pitch: -18, distance: 300 },
  { name: 'high_35_01_front', heading: 0,   pitch: -35, distance: 800 },
  { name: 'high_35_02_right', heading: 90,  pitch: -35, distance: 800 },
  { name: 'high_35_03_back',  heading: 180, pitch: -35, distance: 800 },
  { name: 'high_35_04_left',  heading: 270, pitch: -35, distance: 800 },
];

function buildHtml(cesiumCoords, centerLat, centerLng) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Cesium.js"></script>
  <link href="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
  <style>
    html, body, #cesiumContainer { width:100%; height:100%; margin:0; padding:0; overflow:hidden; }
    .cesium-viewer-toolbar, .cesium-viewer-animationContainer,
    .cesium-viewer-timelineContainer, .cesium-viewer-bottom,
    .cesium-viewer-fullscreenContainer, .cesium-credit-logoContainer,
    .cesium-credit-expand-link, .cesium-widget-credits { display:none !important; }
  </style>
</head>
<body>
  <div id="cesiumContainer"></div>
  <script>
    Cesium.Ion.defaultAccessToken = '${CESIUM_TOKEN}';

    const viewer = new Cesium.Viewer('cesiumContainer', {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      animation: false, timeline: false, homeButton: false,
      sceneModePicker: false, baseLayerPicker: false,
      navigationHelpButton: false, geocoder: false,
      fullscreenButton: false, infoBox: false, selectionIndicator: false,
    });

    // ✅ תאורה קבועה - אין שמש, אין חושך
    viewer.scene.globe.enableLighting = false;
    viewer.scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(1, 1, -1),
      intensity: 2.0,
    });

    // ✅ פוליגון גבוה 300m מגובה ים - תמיד גלוי מעל הקרקע
    viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
        height: 0,
        extrudedHeight: 300,
        material: Cesium.Color.fromCssColorString('#22C55E').withAlpha(0.55),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#15803D'),
        outlineWidth: 3,
      }
    });

    // ✅ גבול מדויק על הקרקע
    viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
        width: 4,
        material: Cesium.Color.fromCssColorString('#15803D'),
        clampToGround: true,
      }
    });

    const center = Cesium.Cartesian3.fromDegrees(${centerLng}, ${centerLat});

    window.setCameraAngle = function(heading, pitch, distance) {
      viewer.camera.lookAt(
        center,
        new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(heading),
          Cesium.Math.toRadians(pitch),
          distance
        )
      );
    };

    window._tilesLoaded = false;
    let stableCount = 0;
    viewer.scene.globe.tileLoadProgressEvent.addEventListener(function(remaining) {
      if (remaining === 0) {
        stableCount++;
        if (stableCount > 3) window._tilesLoaded = true;
      } else {
        stableCount = 0;
      }
    });

    window.setCameraAngle(0, -35, 800);
  </script>
</body>
</html>`;
}

async function main() {
  const polygonInput = process.argv[2] || '30.4234154377576,-83.1261567366417|30.4234154395896,-83.1263946900247|30.4237866271808,-83.1263932673563|30.4237866253528,-83.1261553141869|30.4234154377576,-83.1261567366417';

  const points = polygonInput.split('|').map(p => {
    const [lat, lng] = p.split(',').map(Number);
    return { lat, lng };
  });

  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const centerLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const cesiumCoords = points.map(p => `${p.lng}, ${p.lat}`).join(', ');

  const outDir = './screenshots_polygon';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🏗️ NH Polygon Capture v7`);
  console.log(`📍 Center: ${centerLat}, ${centerLng}`);
  console.log(`📐 ${points.length} points | 16 screenshots\n`);

  const html = buildHtml(cesiumCoords, centerLat, centerLng);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  await new Promise(resolve => server.listen(3000, resolve));

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

  page.on('console', msg => console.log(`  [browser] ${msg.text()}`));

  console.log('[1] Loading Cesium...');
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('[2] Waiting for tiles...');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const ready = await page.evaluate(() => window._tilesLoaded);
    if (ready) { console.log(`    ✅ Ready after ${i + 1}s`); break; }
    if (i === 39) console.log('    ⚠️ Timeout - continuing anyway');
  }
  await page.waitForTimeout(3000);

  console.log('[3] Capturing 16 shots...');
  for (const shot of SHOTS) {
    await page.evaluate(({ heading, pitch, distance }) => {
      window.setCameraAngle(heading, pitch, distance);
    }, { heading: shot.heading, pitch: shot.pitch, distance: shot.distance });

    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(outDir, `${shot.name}.png`) });
    console.log(`    📸 ${shot.name}.png`);
  }

  await browser.close();
  server.close();
  console.log(`\n✅ Done! 16 screenshots in ${outDir}/`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
