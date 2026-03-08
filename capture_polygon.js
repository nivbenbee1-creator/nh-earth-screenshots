const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data'); // דרוש לשליחה בינארית

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';
const WEBHOOK_URL = 'https://bennivbee.app.n8n.cloud/webhook/google-earth-nh'; 

const SHOTS = [
  { name: '01_front', heading: 0,   pitch: -25 },
  { name: '02_right', heading: 90,  pitch: -25 },
  { name: '03_back',  heading: 180, pitch: -25 },
  { name: '04_left',  heading: 270, pitch: -25 },
  { name: '05_cinematic', heading: 45, pitch: -15 }
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

// פונקציה ששולחת את הקבצים כבינארי (Multipart)
async function sendBinaryToN8N(imagePaths, polygonData) {
    const form = new FormData();
    imagePaths.forEach((filePath) => {
        form.append('files', fs.createReadStream(filePath)); // שליחה בינארית
    });
    form.append('polygon', polygonData);

    try {
        await axios.post(WEBHOOK_URL, form, { headers: { ...form.getHeaders() } });
        console.log('✅ הכל נשלח כקובץ בינארי ל-n8n');
    } catch (e) {
        console.error('❌ שגיאה בשליחה ל-n8n:', e.message);
    }
}

function buildHtml(cesiumCoords, extrudedHeight, radius) {
  return `<!DOCTYPE html>
<html>
<head>
  <script src="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Cesium.js"></script>
  <link href="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
  <style>html, body, #cesiumContainer { width:100%; height:100%; margin:0; padding:0; overflow:hidden; }</style>
</head>
<body>
  <div id="cesiumContainer"></div>
  <script>
    Cesium.Ion.defaultAccessToken = '${CESIUM_TOKEN}';
    const viewer = new Cesium.Viewer('cesiumContainer', {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      shadows: true, // ✅ מפעיל צללים (ריאליזם)
      animation: false, timeline: false, baseLayerPicker: false, infoBox: false,
      contextOptions: { webgl: { preserveDrawingBuffer: true, alpha: false } }
    });

    const scene = viewer.scene;
    scene.globe.enableLighting = true; // ✅ שמש אמיתית (ריאליזם)
    scene.highDynamicRange = true;     // ✅ עומק צבע HDR (ריאליזם)
    scene.fog.enabled = true;          // ✅ ערפל מרחק (ריאליזם)
    scene.globe.showGroundAtmosphere = true; 

    const parcel = viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        extrudedHeight: ${extrudedHeight},
        extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        material: Cesium.Color.fromCssColorString('#22C55E').withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.WHITE, // ✅ אאוטליין לבן למראה נקי
        outlineWidth: 3
      }
    });

    window.zoomToShot = (h, p) => viewer.zoomTo(parcel, new Cesium.HeadingPitchRange(Cesium.Math.toRadians(h), Cesium.Math.toRadians(p), ${radius * 8}));
    window.isReady = () => viewer.scene.globe.tilesLoaded;
  </script>
</body>
</html>`;
}

async function main() {
  let polygonInput = process.argv[2] || "";
  
  // תיקון קטן בשביל ה-NaN: מוודא שהפורמט נקי לפני החישוב
  const cleanInput = polygonInput.replace(/\|/g, ',');
  const rawPoints = cleanInput.split(',').map(Number);
  const points = [];
  for (let i = 0; i < rawPoints.length; i += 2) {
    if (!isNaN(rawPoints[i])) points.push({ lat: rawPoints[i], lng: rawPoints[i+1] });
  }

  const cesiumCoords = points.map(p => `${p.lng}, ${p.lat}`).join(', ');
  const areaM2 = calcAreaM2(points);
  const finalArea = isNaN(areaM2) ? 1000 : areaM2;
  const extrudedHeight = Math.max(15, Math.min(200, Math.round(0.2 * Math.sqrt(finalArea))));
  const radius = Math.sqrt(finalArea) / 2;

  const outDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(buildHtml(cesiumCoords, extrudedHeight, radius));
  });
  server.listen(3000);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:3000');

  const capturedPaths = [];
  for (const shot of SHOTS) {
    await page.evaluate((s) => window.zoomToShot(s.heading, s.pitch), shot);
    for(let i=0; i<30; i++) {
        if (await page.evaluate(() => window.isReady())) break;
        await page.waitForTimeout(1000);
    }
    const imgPath = path.join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: imgPath });
    capturedPaths.push(imgPath);
  }

  // שולח הכל לוובהוק כבינארי
  await sendBinaryToN8N(capturedPaths, polygonInput);

  await browser.close();
  server.close();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
