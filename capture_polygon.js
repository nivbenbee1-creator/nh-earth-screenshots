/**
 * NH Earth Polygon v9 - המחקר המנצח
 * 
 * תיקונים לפי המחקר:
 * 1. heightReference + extrudedHeightReference = פוליגון על הקרקע תמיד
 * 2. highDynamicRange=false + fog off + atmosphere off = בהירות אחידה
 * 3. מחשב distance אוטומטי לפי גודל החלקה
 * 4. tilesLoaded + _tileLoadQueue = זיהוי אמין
 * 5. preserveDrawingBuffer = אין תמונה שחורה
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';

function buildHtml(cesiumCoords, centerLat, centerLng, radius) {
  // מחשב distance לפי גודל החלקה ופיץ'
  // pitch -25: multiplier 8.5, pitch -10: multiplier 7.2
  const distStandard = Math.round(radius * 12);
  const distCinematic = Math.round(radius * 10);

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

    // ✅ preserveDrawingBuffer - חובה למנוע תמונה שחורה
    const viewer = new Cesium.Viewer('cesiumContainer', {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      animation: false, timeline: false, homeButton: false,
      sceneModePicker: false, baseLayerPicker: false,
      navigationHelpButton: false, geocoder: false,
      fullscreenButton: false, infoBox: false, selectionIndicator: false,
      shadows: false,
      requestRenderMode: false,
      contextOptions: {
        webgl: { preserveDrawingBuffer: true }
      },
    });

    const scene = viewer.scene;
    const globe = viewer.scene.globe;

    // ✅ כל הגדרות התאורה לפי המחקר
    globe.enableLighting = false;
    scene.highDynamicRange = false;
    scene.fog.enabled = false;
    globe.showGroundAtmosphere = false;
    globe.maximumScreenSpaceError = 2.0;

    // ✅ תאורה אחידה מכל כיוון
    scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(1, 1, -1),
      intensity: 3.0,
    });

    // ✅ פוליגון על הקרקע - heightReference + extrudedHeightReference
    viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        extrudedHeight: 25,
        extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        perPositionHeight: false,
        material: Cesium.Color.fromCssColorString('#22C55E').withAlpha(0.6),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#15803D'),
        outlineWidth: 3,
      }
    });

    const center = Cesium.Cartesian3.fromDegrees(${centerLng}, ${centerLat});

    // shots array - יחושב לפי גודל החלקה
    window.SHOTS = [
      { name: '01_standard_front', heading: 0,   pitch: -25, distance: ${distStandard} },
      { name: '02_standard_right', heading: 90,  pitch: -25, distance: ${distStandard} },
      { name: '03_standard_back',  heading: 180, pitch: -25, distance: ${distStandard} },
      { name: '04_standard_left',  heading: 270, pitch: -25, distance: ${distStandard} },
      { name: '05_cinematic_front', heading: 0,   pitch: -15, distance: ${distCinematic} },
      { name: '06_cinematic_right', heading: 90,  pitch: -15, distance: ${distCinematic} },
      { name: '07_cinematic_back',  heading: 180, pitch: -15, distance: ${distCinematic} },
      { name: '08_cinematic_left',  heading: 270, pitch: -15, distance: ${distCinematic} },
    ];

    window.setCameraAngle = function(heading, pitch, distance) {
      // מזיז את נקודת המטרה קדימה לפי הפיץ' - כך הפוליגון נופל באמצע הפריים
      const pitchRad = Cesium.Math.toRadians(pitch);
      const headingRad = Cesium.Math.toRadians(heading);
      const offset = distance * Math.tan(pitchRad) * 0.5;

      const centerCart = Cesium.Cartesian3.fromDegrees(${centerLng}, ${centerLat});
      const east = new Cesium.Cartesian3(-Math.sin(headingRad), Math.cos(headingRad), 0);
      const forward = new Cesium.Cartesian3(
        -Math.cos(headingRad), -Math.sin(headingRad), 0
      );

      const targetCart = new Cesium.Cartesian3(
        centerCart.x + forward.x * offset,
        centerCart.y + forward.y * offset,
        centerCart.z
      );

      viewer.camera.lookAt(
        targetCart,
        new Cesium.HeadingPitchRange(
          headingRad,
          pitchRad,
          distance
        )
      );
    };

    // ✅ זיהוי טעינה אמין לפי המחקר
    window._ready = false;
    scene.postRender.addEventListener(function() {
      if (window._ready) return;
      const tilesLoaded = globe.tilesLoaded;
      const queueEmpty = globe._surface && globe._surface._tileLoadQueue
        ? globe._surface._tileLoadQueue.length === 0
        : true;
      if (tilesLoaded && queueEmpty) {
        window._ready = true;
        console.log('READY');
      }
    });

    window.setCameraAngle(0, -25, ${distStandard});
    console.log('distStandard=${distStandard}, distCinematic=${distCinematic}, radius=${radius}');
  </script>
</body>
</html>`;
}

// חישוב bounding sphere radius מהפוליגון
function calcRadius(points) {
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  // המרה למטרים (קירוב)
  const latDiff = (maxLat - minLat) * 111320;
  const lngDiff = (maxLng - minLng) * 111320 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);

  // רדיוס הספירה המקיפה
  const radius = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) / 2;

  // מינימום 100 מטר, מקסימום 5000
  return Math.max(100, Math.min(5000, Math.round(radius)));
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
  const radius = calcRadius(points);

  const outDir = './screenshots_polygon';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🏗️ NH Polygon Capture v9`);
  console.log(`📍 Center: ${centerLat}, ${centerLng}`);
  console.log(`📐 Radius: ${radius}m | distStandard: ${Math.round(radius * 8.5)}m | distCinematic: ${Math.round(radius * 7.2)}m`);
  console.log(`📸 8 screenshots\n`);

  const html = buildHtml(cesiumCoords, centerLat, centerLng, radius);
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

  // ✅ המתנה לפי המחקר - tilesLoaded + _tileLoadQueue
  console.log('[2] Waiting for tiles (reliable method)...');
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const ready = await page.evaluate(() => window._ready);
    if (ready) { console.log(`    ✅ Ready after ${i + 1}s`); break; }
    if (i === 59) console.log('    ⚠️ Timeout - continuing anyway');
  }
  await page.waitForTimeout(2000);

  // צלם 8 זוויות
  console.log('[3] Capturing 8 shots...');
  const shots = await page.evaluate(() => window.SHOTS);

  for (const shot of shots) {
    await page.evaluate(({ heading, pitch, distance }) => {
      window.setCameraAngle(heading, pitch, distance);
    }, { heading: shot.heading, pitch: shot.pitch, distance: shot.distance });

    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(outDir, `${shot.name}.png`) });
    console.log(`    📸 ${shot.name}.png`);
  }

  await browser.close();
  server.close();
  console.log(`\n✅ Done! 8 screenshots in ${outDir}/`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
