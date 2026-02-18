/**
 * NH Earth Polygon v1 - CesiumJS with extruded polygon
 * Usage: node capture_polygon.js "lat1,lng1|lat2,lng2|lat3,lng3|..."
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';

async function main() {
  const polygonInput = process.argv[2] || '30.4234154377576,-83.1261567366417|30.4234154395896,-83.1263946900247|30.4237866271808,-83.1263932673563|30.4237866253528,-83.1261553141869|30.4234154377576,-83.1261567366417';
  
  // Parse polygon points (lat,lng|lat,lng|...)
  const points = polygonInput.split('|').map(p => {
    const [lat, lng] = p.split(',').map(Number);
    return { lat, lng };
  });

  // Calculate center
  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const centerLng = points.reduce((s, p) => s + p.lng, 0) / points.length;

  // Build Cesium coordinates array (lng, lat pairs for Cesium)
  const cesiumCoords = points.map(p => `${p.lng}, ${p.lat}`).join(',\n              ');

  const outDir = './screenshots_polygon';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🏗️ NH Polygon Capture v1`);
  console.log(`📍 Center: ${centerLat}, ${centerLng}`);
  console.log(`📐 ${points.length} polygon points\n`);

  // Generate HTML with CesiumJS
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
    /* Hide Cesium UI elements */
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

    // Add extruded polygon
    viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([
              ${cesiumCoords}
        ]),
        extrudedHeight: 30,
        height: 0,
        material: Cesium.Color.fromCssColorString('#3B82F6').withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#1E40AF'),
        outlineWidth: 3,
      }
    });

    // Also add a ground outline for clarity
    viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
              ${cesiumCoords}
        ]),
        width: 4,
        material: Cesium.Color.fromCssColorString('#EF4444'),
        clampToGround: true,
      }
    });

    const center = Cesium.Cartesian3.fromDegrees(${centerLng}, ${centerLat});

    // Function to set camera angle
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

    // Signal that Cesium is ready
    viewer.scene.globe.tileLoadProgressEvent.addEventListener(function(remaining) {
      if (remaining === 0) {
        window._cesiumReady = true;
      }
    });

    // Initial view
    window.setCameraAngle(0, -45, 500);
  </script>
</body>
</html>`;

  fs.writeFileSync('cesium_viewer.html', html);
  console.log('[1] HTML generated');

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

  console.log('[2] Loading Cesium...');
  await page.goto(`file://${path.resolve('cesium_viewer.html')}`, {
    waitUntil: 'domcontentloaded', timeout: 60000
  });

  // Wait for tiles to load
  console.log('[3] Waiting for terrain + tiles...');
  await page.waitForTimeout(15000);

  // Camera angles: [heading, pitch, distance]
  const views = [
    { name: '01_front',  heading: 0,   pitch: -35, distance: 400, label: 'Front view' },
    { name: '02_right',  heading: 90,  pitch: -35, distance: 400, label: 'Right view' },
    { name: '03_back',   heading: 180, pitch: -35, distance: 400, label: 'Back view' },
    { name: '04_left',   heading: 270, pitch: -35, distance: 400, label: 'Left view' },
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
  fs.unlinkSync('cesium_viewer.html');
  console.log(`\n✅ Done! ${views.length} polygon screenshots captured.`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
