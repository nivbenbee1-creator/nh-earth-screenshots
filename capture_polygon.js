const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data'); // ספרייה לשליחת קבצים בינאריים

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';

// --- הגדרות וובהוק ---
const WEBHOOK_URL = 'https://bennivbee.app.n8n.cloud/webhook/google-earth-nh'; 

const SHOTS = [
  { name: 'front_view', heading: 0,   pitch: -25 },
  { name: 'side_view',  heading: 90,  pitch: -25 },
  { name: 'back_view',  heading: 180, pitch: -25 },
  { name: 'cinematic',  heading: 45,  pitch: -15 }
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

// פונקציה ששולחת את כל הקבצים יחד כבינארי ל-n8n
async function sendAllToWebhook(imagePaths, coords) {
    console.log('📤 שולח את כל התמונות כקבצים בינאריים ל-n8n...');
    const form = new FormData();
    
    // מוסיף כל תמונה כקובץ נפרד בתוך הטופס
    imagePaths.forEach((filePath, index) => {
        const fileName = path.basename(filePath);
        form.append(`file_${index}`, fs.createReadStream(filePath), fileName);
    });

    // מוסיף נתונים טקסטואליים
    form.append('coordinates', coords);
    form.append('total_images', imagePaths.length.toString());

    try {
        const response = await axios.post(WEBHOOK_URL, form, {
            headers: { ...form.getHeaders() }
        });
        console.log('✅ הכל נשלח בהצלחה ל-n8n!');
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
      shadows: true, 
      animation: false, timeline: false, baseLayerPicker: false, infoBox: false,
      contextOptions: { webgl: { preserveDrawingBuffer: true, alpha: false } }
    });

    const scene = viewer.scene;
    scene.globe.enableLighting = true; 
    scene.highDynamicRange = true;     
    scene.fog.enabled = true;          
    scene.globe.showGroundAtmosphere = true; 
    scene.globe.maximumScreenSpaceError = 1.5;

    const parcel = viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray([${cesiumCoords}]),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        extrudedHeight: ${extrudedHeight},
        extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        material: Cesium.Color.fromCssColorString('#22C55E').withAlpha(0.5),
        outline: true,
        outlineColor: Cesium.Color.WHITE, 
        outlineWidth: 3
      }
    });

    window.zoomToShot = (h, p) => {
      return viewer.zoomTo(parcel, new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(h), Cesium.Math.toRadians(p), ${radius * 8}
      ));
    };
    window.isReady = () => viewer.scene.globe.tilesLoaded;
  </script>
</body>
</html>`;
}

async function main() {
  let polygonInput = process.argv[2] || '30.4234,-83.1261,30.4237,-83.1261';
  
  // ✅ תיקון NaN: הופך | לפסיקים
  polygonInput = polygonInput.replace(/\|/g, ',');
  
  const rawPoints = polygonInput.split(',').map(s => s.trim());
  const points = [];
  for (let i = 0; i < rawPoints.length; i += 2) {
    if (rawPoints[i] && rawPoints[i+1]) {
        points.push({ lat: Number(rawPoints[i]), lng: Number(rawPoints[i+1]) });
    }
  }

  const cesiumCoords = points.map(p => `${p.lng}, ${p.lat}`).join(', ');
  const areaM2 = calcAreaM2(points);
  const finalArea = isNaN(areaM2) ? 1000 : areaM2;
  const extrudedHeight = Math.max(15, Math.min(200, Math.round(0.2 * Math.sqrt(finalArea))));
  const radius = Math.sqrt(finalArea) / 2;

  const outDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const html = buildHtml(cesiumCoords, extrudedHeight, radius);
  const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(html);
  });
  server.listen(3000);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:3000');

  const capturedFiles = [];

  for (const shot of SHOTS) {
    console.log(`📸 מצלם: ${shot.name}...`);
    await page.evaluate((s) => window.zoomToShot(s.heading, s.pitch), shot);
    
    for(let i=0; i<30; i++) {
        if (await page.evaluate(() => window.isReady())) break;
        await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1000);

    const imgPath = path.join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: imgPath });
    capturedFiles.push(imgPath);
  }

  // ✅ שליחה מרוכזת של הכל כבינארי בסוף
  await sendAllToWebhook(capturedFiles, polygonInput);

  await browser.close();
  server.close();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
