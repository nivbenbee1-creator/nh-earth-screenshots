/**
 * NH Earth Polygon v4 - 3 Styles x 4 Angles = 12 Screenshots
 * Usage: node capture_polygon.js "lat1,lng1|lat2,lng2|lat3,lng3|..."
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';

// ─── 3 STYLES ───────────────────────────────────────────────
const STYLES = [
  {
    name: 'green',
    fillColor: '#22C55E',
    fillAlpha: 0.55,
    outlineColor: '#15803D',
    extrudedHeight: 25,
    pitch: -25,
    distance: 600,
  },
  {
    name: 'blue',
    fillColor: '#1E3A8A',
    fillAlpha: 0.65,
    outlineColor: '#3B82F6',
    extrudedHeight: 40,   // גבוה יותר = דרמטי יותר
    pitch: -18,           // נמוך יותר = רואים יותר שמיים
    distance: 500,
  },
  {
    name: 'red',
    fillColor: '#DC2626',
    fillAlpha: 0.60,
    outlineColor: '#FF4444',
    extrudedHeight: 20,
    pitch: -35,           // גבוה יותר = רואים יותר שטח סביב
    distance: 800,
  },
];

const HEADINGS = [
  { heading: 0,   label: '01_front' },
  { heading: 90,  label: '02_right' },
  { heading: 180, label: '03_back'  },
  { heading: 270, label: '04_left'  },
];

// ─── BUILD HTML ──────────────────────────────────────────────
function buildHtml(cesiumCoords, centerLat, centerLng, style) {
  return `
<!DOCTYPE html>
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

    // Extruded polygon
    viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
        extrudedHeight: ${style.extrudedHeight},
        height: 0,
        material: Cesium.Color.fromCssColorString('${style.fillColor}').withAlpha(${style.fillAlpha}),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('${style.outlineColor}'),
        outlineWidth: 3,
      }
    });

    // Ground outline
    viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
        width: 4,
        material: Cesium.Color.fromCssColorString('${style.outlineColor}'),
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

    window.setCameraAngle(0, ${style.pitch}, ${style.distance});
  </script>
</body>
</html>`;
}

// ─── MAIN ────────────────────────────────────────────────────
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

  console.log(`\n🏗️ NH Polygon Capture v4`);
  console.log(`📍 Center: ${centerLat}, ${centerLng}`);
  console.log(`📐 ${points.length} points | 3 styles x 4 angles = 12 screenshots\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--enable-webgl2',
      '--disable-dev-shm-usage', '--no-sandbox',
      '--disable-setuid-sandbox', '--window-size=1920,1080',
    ],
  });

  for (const style of STYLES) {
    console.log(`\n🎨 Style: ${style.name}`);

    // spin up local server with this style's HTML
    const html = buildHtml(cesiumCoords, centerLat, centerLng, style);
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    await new Promise(resolve => server.listen(3000, resolve));

    const page = await (await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    })).newPage();

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // wait for tiles
    console.log('  ⏳ Loading terrain...');
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const loaded = await page.evaluate(() => window._tilesLoaded);
      if (loaded) { console.log(`  ✅ Tiles loaded (${i + 1}s)`); break; }
    }
    await page.waitForTimeout(3000);

    // 4 angles
    for (const view of HEADINGS) {
      await page.evaluate(({ heading, pitch, distance }) => {
        window.setCameraAngle(heading, pitch, distance);
      }, { heading: view.heading, pitch: style.pitch, distance: style.distance });

      await page.waitForTimeout(4000);
      const filename = `${style.name}_${view.label}.png`;
      await page.screenshot({ path: path.join(outDir, filename) });
      console.log(`  📸 ${filename}`);
    }

    await page.close();
    server.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await browser.close();
  console.log(`\n✅ Done! 12 screenshots in ${outDir}/`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
