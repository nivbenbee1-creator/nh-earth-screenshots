/**
 * NH Earth Polygon v3 - Dramatic angles like reference
 * Usage: node capture_polygon.js "lat1,lng1|lat2,lng2|lat3,lng3|..."
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';

async function main() {
  const polygonInput = process.argv[2] || '30.4234154377576,-83.1261567366417|30.4234154395896,-83.1263946900247|30.4237866271808,-83.1263932673563|30.4237866253528,-83.1261553141869|30.4234154377576,-83.1261567366417';
  
  const points = polygonInput.split('|').map(p => {
    const [lat, lng] = p.split(',').map(Number);
    return { lat, lng };
  });

  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const centerLng = points.reduce((s, p) => s + p.lng, 0) / points.length;

  const cesiumCoords = points.map(p => `${p.lng}, ${p.lat}`).join(',\n              ');

  const outDir = './screenshots_polygon';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🏗️ NH Polygon Capture v3`);
  console.log(`📍 Center: ${centerLat}, ${centerLng}`);
  console.log(`📐 ${points.length} polygon points\n`);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Cesium.js"></script>
  <link href="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
  <style>
    html, body, #cesiumContainer {
      width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden;
    }
    .cesium-viewer-toolbar,
    .cesium-viewer-animationContainer,
    .cesium-viewer-timelineContainer,
    .cesium-viewer-bottom,
    .cesium-viewer-fullscreenContainer,
    .cesium-credit-logoContainer,
    .cesium-credit-expand-link,
    .cesium-widget-credits {
      display: none !important;
    }
  </style>
</head>
<body>
  <div id="cesiumContainer"></div>
  <script>
    Cesium.Ion.defaultAccessToken = '${CESIUM_TOKEN}';

    const viewer = new Cesium.Viewer('cesiumContainer', {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      animation: false,
      timeline: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      geocoder: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    // Extruded polygon - green like reference image
    viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
              ${cesiumCoords}
        ]),
        extrudedHeight: 25,
        height: 0,
        material: Cesium.Color.fromCssColorString('#22C55E').withAlpha(0.55),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#15803D'),
        outlineWidth: 3,
      }
    });

    // Ground outline
    viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
              ${cesiumCoords}
        ]),
        width: 4,
        material: Cesium.Color.fromCssColorString('#22C55E'),
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

    // Track tile loading
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

    // Initial view - dramatic angle like reference
    window.setCameraAngle(0, -25, 600);
  </script>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  
  await new Promise(resolve => server.listen(3000, resolve));
  console.log('[1] Local server running on port 3000');

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

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [BROWSER ERROR] ${msg.text()}`);
  });

  console.log('[2] Loading Cesium...');
  await page.goto('http://localhost:3000', {
    waitUntil: 'domcontentloaded', timeout: 60000
  });

  console.log('[3] Waiting for terrain + tiles...');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const loaded = await page.evaluate(() => window._tilesLoaded);
    if (loaded) {
      console.log(`    Tiles loaded after ${i + 1}s`);
      break;
    }
    if (i === 29) console.log('    Warning: tiles may not be fully loaded');
  }
  await page.waitForTimeout(3000);

  // More dramatic angles: pitch -25 = see more horizon, distance 600 = wider view
  const views = [
    { name: '01_front',  heading: 0,   pitch: -25, distance: 600, label: 'Front view' },
    { name: '02_right',  heading: 90,  pitch: -25, distance: 600, label: 'Right view' },
    { name: '03_back',   heading: 180, pitch: -25, distance: 600, label: 'Back view' },
    { name: '04_left',   heading: 270, pitch: -25, distance: 600, label: 'Left view' },
  ];

  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    console.log(`[${i + 4}] ${v.label}...`);
    await page.evaluate(({ heading, pitch, distance }) => {
      window.setCameraAngle(heading, pitch, distance);
    }, { heading: v.heading, pitch: v.pitch, distance: v.distance });
    
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(outDir, `${v.name}.png`) });
    console.log(`    ✅ ${v.name}.png`);
  }

  await browser.close();
  server.close();
  console.log(`\n✅ Done! ${views.length} polygon screenshots captured.`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
