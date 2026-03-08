const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';

const SHOTS = [
  { name: '01_standard_front',  heading: 0,   pitch: -25 },
  { name: '02_standard_right',  heading: 90,  pitch: -25 },
  { name: '03_standard_back',   heading: 180, pitch: -25 },
  { name: '04_standard_left',   heading: 270, pitch: -25 },
  { name: '05_cinematic_front', heading: 0,   pitch: -15 },
  { name: '06_cinematic_right', heading: 90,  pitch: -15 },
  { name: '07_cinematic_back',  heading: 180, pitch: -15 },
  { name: '08_cinematic_left',  heading: 270, pitch: -15 },
];

function calcAreaM2(points) {
  let area = 0;
  const n = points.length;
  const R = 6371000;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = points[i].lat * Math.PI / 180;
    const lat2 = points[j].lat * Math.PI / 180;
    const lng1 = points[i].lng * Math.PI / 180;
    const lng2 = points[j].lng * Math.PI / 180;
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(area * R * R / 2);
}

function buildHtml(cesiumCoords, extrudedHeight, radius) {
  const distStandard = Math.round(radius * 5);
  const distCinematic = Math.round(radius * 4);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Cesium.js"><\/script>
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
      shadows: false,
      requestRenderMode: false,
      contextOptions: { webgl: { preserveDrawingBuffer: true, alpha: false } },
    });

    const scene = viewer.scene;
    const globe = scene.globe;

    globe.enableLighting = false;
    scene.highDynamicRange = false;
    scene.fog.enabled = false;
    globe.showGroundAtmosphere = false;
    globe.maximumScreenSpaceError = 4.0;
    viewer.resolutionScale = 1.5;
    scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(1, 1, -1),
      intensity: 3.0,
    });

    const parcelEntity = viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        extrudedHeight: ${extrudedHeight},
        extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        perPositionHeight: false,
        material: Cesium.Color.fromCssColorString('#22C55E').withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
      }
    });

    // ← מאפס _ready לפני כל zoom כדי לוודא שהטיילים נטענו מהזווית החדשה
    window.zoomToShot = function(heading, pitch, isCinematic) {
      const range = isCinematic ? ${distCinematic} : ${distStandard};
      window._ready = false;
      return viewer.zoomTo(
        parcelEntity,
        new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(heading),
          Cesium.Math.toRadians(pitch),
          range
        )
      );
    };

    window.forceRender = function() { viewer.render(); };

    window._ready = false;
    scene.postRender.addEventListener(function() {
      if (window._ready) return;
      const queueEmpty = globe._surface && globe._surface._tileLoadQueue
        ? globe._surface._tileLoadQueue.length === 0 : true;
      if (globe.tilesLoaded && queueEmpty) {
        window._ready = true;
      }
    });
  <\/script>
</body>
</html>`;
}

async function main() {
  const polygonInput = process.argv[2] || '30.4234154377576,-83.1261567366417|30.4234154395896,-83.1263946900247|30.4237866271808,-83.1263932673563|30.4237866253528,-83.1261553141869|30.4234154377576,-83.1261567366417';

  const points = polygonInput.split('|').map(p => {
    const [lat, lng] = p.split(',').map(Number);
    return { lat, lng };
  });

  const cesiumCoords = points.map(p => `${p.lng}, ${p.lat}`).join(', ');
  const areaM2 = calcAreaM2(points);
  const extrudedHeight = Math.max(15, Math.min(200, Math.round(0.2 * Math.sqrt(areaM2))));

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const latDiff = (Math.max(...lats) - Math.min(...lats)) * 111320;
  const lngDiff = (Math.max(...lngs) - Math.min(...lngs)) * 111320 * Math.cos((Math.min(...lats) + Math.max(...lats)) / 2 * Math.PI / 180);
  const radius = Math.max(100, Math.min(3000, Math.round(Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) / 2)));

  const outDir = './screenshots_polygon';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`radius: ${radius} | extrudedHeight: ${extrudedHeight}`);

  const html = buildHtml(cesiumCoords, extrudedHeight, radius);
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

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // המתנה ראשונית לטעינת עולם בסיסית
  console.log('⏳ המתנה ראשונית לטעינת עולם...');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const ready = await page.evaluate(() => window._ready);
    if (ready) { console.log(`✅ עולם נטען אחרי ${i + 1}s`); break; }
  }
  await page.waitForTimeout(5000); // בטחון נוסף

  // לולאת צילום - כל shot מחכה לטיילים מהזווית החדשה
  for (const [index, shot] of SHOTS.entries()) {
    console.log(`\n🎯 [${index + 1}/${SHOTS.length}] ${shot.name}...`);

    await page.evaluate(({ heading, pitch, isCinematic }) => {
      return window.zoomToShot(heading, pitch, isCinematic);
    }, { heading: shot.heading, pitch: shot.pitch, isCinematic: shot.name.includes('cinematic') });

    // ← חכה שהטיילים של הזווית החדשה ייטענו (עד 25 שניות)
    let waited = 0;
    while (waited < 25000) {
      await page.waitForTimeout(1000);
      waited += 1000;
      const ready = await page.evaluate(() => window._ready);
      if (ready) {
        console.log(`   ✅ טיילים נטענו אחרי ${waited / 1000}s`);
        break;
      }
    }
    if (waited >= 25000) {
      console.log(`   ⚠️ timeout - צולם בכל מקרה`);
    }

    // בטחון נוסף + force render לפני צילום
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.forceRender());
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(outDir, `${shot.name}.png`), timeout: 60000 });
    console.log(`   📸 ${shot.name}.png נשמר`);
  }

  await browser.close();
  server.close();
  console.log('\n✅ Done! כל הצילומים הושלמו.');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
