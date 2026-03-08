/**
 * NH Earth - Pin Edition (capture.js) 
 * FINAL PRO: 9 Shots with "Warm-up" Strategy, Sending only 6 to n8n.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';
const WEBHOOK_URL = 'https://bennivbee.app.n8n.cloud/webhook/nh-google-earth'; 

// ✅ הגדרת אסטרטגיית ה"חימום"
const ALL_SHOTS = [
  // --- 3 זוויות "חימום" (Warm-up) ---
  // גיטהאב "ייכשל" בטעינה עליהן, אבל לפחות ה"חשובות" ייצאו טוב.
  { name: 'warmup_45',    heading: 45,  pitch: -15, keep: false },
  { name: 'warmup_135',   heading: 135, pitch: -15, keep: false },
  { name: 'warmup_225',   heading: 225, pitch: -15, keep: false },
  
  // --- 6 הזוויות החשובות (מצולמות כשהשרת "חם") ---
  { name: 'pin_front',   heading: 0,   pitch: -15, keep: true },
  { name: 'pin_right',   heading: 90,  pitch: -15, keep: true },
  { name: 'pin_back',    heading: 180, pitch: -15, keep: true },
  { name: 'pin_left',    heading: 270, pitch: -15, keep: true },
  { name: 'pin_top_0',   heading: 0,   pitch: -45, keep: true },
  { name: 'pin_top_180', heading: 180, pitch: -45, keep: true }
];

function buildHtml(lat, lng) {
  return `<!DOCTYPE html>
<html>
<head>
  <script src="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Cesium.js"></script>
  <link href="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
  <style>
    html, body, #cesiumContainer { width:100%; height:100%; margin:0; padding:0; overflow:hidden; }
    .cesium-viewer-toolbar, .cesium-credit-logoContainer, .cesium-viewer-bottom { display: none !important; }
  </style>
</head>
<body>
  <div id="cesiumContainer"></div>
  <script>
    Cesium.Ion.defaultAccessToken = '${CESIUM_TOKEN}';
    const viewer = new Cesium.Viewer('cesiumContainer', {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      shadows: true, animation: false, timeline: false, baseLayerPicker: false, infoBox: false,
      contextOptions: { webgl: { preserveDrawingBuffer: true, alpha: false } }
    });
    const scene = viewer.scene;
    scene.globe.enableLighting = false; // Daylight
    scene.highDynamicRange = true; 
    scene.globe.showGroundAtmosphere = false;
    scene.globe.maximumScreenSpaceError = 1.0; 
    viewer.resolutionScale = 1.0;

    const pinEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(${lng}, ${lat}),
      billboard: {
        image: 'https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Assets/Textures/pin.svg',
        color: Cesium.Color.RED,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        width: 90, height: 90, 
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY 
      }
    });

    window.zoomToShot = (h, p) => {
        const range = p < -30 ? 600 : 750; // זום קרוב
        return viewer.zoomTo(pinEntity, new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(h), Cesium.Math.toRadians(p), range
        ));
    };
    window.isReady = () => viewer.scene.globe.tilesLoaded;
  </script>
</body>
</html>`;
}

async function main() {
  const lat = process.argv[2];
  const lng = process.argv[3];
  if (!lat || !lng) { process.exit(1); }

  const outDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(buildHtml(lat, lng));
  });
  server.listen(3000);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:3000');
  await page.waitForFunction(() => typeof window.zoomToShot === 'function');

  // --- שלב הצילום: 9 תמונות ---
  const capturedFiles = [];
  for (const shot of ALL_SHOTS) {
    console.log(`📸 מצלם (${shot.keep ? 'חשוב' : 'חימום'}): ${shot.name}...`);
    await page.evaluate((s) => window.zoomToShot(s.heading, s.pitch), shot);
    for(let i=0; i<30; i++) {
        const ready = await page.evaluate(() => window.isReady());
        if (ready) break;
        await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(shot.keep ? 4000 : 2000); // המתנה ארוכה יותר ל"חשובות"

    const imgPath = path.join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: imgPath });
    
    // מוסיף את התמונה לרשימה רק אם היא מסומנת כ"חשובה" (keep: true)
    if (shot.keep) {
        capturedFiles.push(imgPath);
    }
  }

  // --- שלב הסינון והשליחה: 6 תמונות בלבד ---
  console.log('📤 שולח את 6 הזוויות ה"פגז" ל-n8n...');
  const form = new FormData();
  capturedFiles.forEach(f => form.append('files', fs.createReadStream(f)));
  form.append('lat', lat);
  form.append('lng', lng);
  
  try {
      await axios.post(WEBHOOK_URL, form, { headers: form.getHeaders() });
      console.log('✅ נשלח בהצלחה!');
  } catch (e) { console.error('Error:', e.message); }

  await browser.close();
  server.close();
  process.exit(0);
}

main().catch(err => { process.exit(1); });
