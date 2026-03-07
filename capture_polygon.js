/**
 * NH Earth Polygon v6 - סדר מובטח
 * 1. Cesium נטען
 * 2. מחכים לטיילס
 * 3. דוגמים גובה קרקע
 * 4. בונים פוליגון עם גובה נכון
 * 5. מצלמים 16 זוויות
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

    // ✅ תאורה כבויה — תמיד בהיר
    viewer.scene.globe.enableLighting = false;

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

    // ─── STATE FLAGS ───────────────────────────────────────────
    window._tilesLoaded = false;
    window._polygonReady = false;

    // ─── STEP 1: המתן לטיילס ──────────────────────────────────
    let stableCount = 0;
    viewer.scene.globe.tileLoadProgressEvent.addEventListener(async function(remaining) {
      if (remaining === 0) {
        stableCount++;
        if (stableCount === 4 && !window._polygonReady) {
          // ─── STEP 2: דגום גובה קרקע עם retry ─────────────
          let terrainHeight = 0;
          for (let attempt = 1; attempt <= 5; attempt++) {
            try {
              const pts = [Cesium.Cartographic.fromDegrees(${centerLng}, ${centerLat})];
              const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, pts);
              const h = sampled[0].height;
              if (h && h > 0) {
                terrainHeight = h;
                console.log('Terrain height (attempt ' + attempt + '):', terrainHeight);
                break;
              } else {
                console.warn('Attempt ' + attempt + ' returned 0, retrying...');
                await new Promise(r => setTimeout(r, 2000));
              }
            } catch(e) {
              console.warn('Attempt ' + attempt + ' failed:', e.message);
              await new Promise(r => setTimeout(r, 2000));
            }
          }
          // אם כל הניסיונות נכשלו — fallback: נשתמש בגובה גבוה כדי שהקובייה תבצבץ מעל
          if (terrainHeight === 0) {
            console.warn('All attempts failed — using fallback height 50');
            terrainHeight = 50;
          }
          console.log('Final terrain height:', terrainHeight);

          // ─── STEP 3: בנה פוליגון עם גובה נכון ────────────
          viewer.entities.add({
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
              height: terrainHeight,
              extrudedHeight: terrainHeight + 50,
              material: Cesium.Color.fromCssColorString('#22C55E').withAlpha(0.55),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString('#15803D'),
              outlineWidth: 3,
            }
          });

          // outline על הקרקע
          viewer.entities.add({
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
              width: 3,
              material: Cesium.Color.fromCssColorString('#15803D'),
              clampToGround: true,
            }
          });

          window._polygonReady = true;
          window._tilesLoaded = true;
          console.log('Polygon built and ready!');
        }
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

  console.log(`\n🏗️ NH Polygon Capture v6`);
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

  // ─── המתן עד שהפוליגון בנוי (tiles + height sample + entity) ───
  console.log('[2] Waiting for tiles + terrain height + polygon...');
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const ready = await page.evaluate(() => window._tilesLoaded && window._polygonReady);
    if (ready) { console.log(`    ✅ Ready after ${i + 1}s`); break; }
    if (i === 59) console.log('    ⚠️ Timeout - continuing anyway');
  }

  // buffer קטן לרינדור אחרי שהפוליגון נבנה
  await page.waitForTimeout(3000);

  // ─── צלם 16 זוויות ────────────────────────────────────────────
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
