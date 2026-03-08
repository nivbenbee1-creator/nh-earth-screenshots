/**
 * NH Earth Polygon - Realistic Webhook Edition
 * מבוסס על גרסה 10 עם שיפורי תאורה ושליחה אוטומטית
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';

// --- הגדרות וובהוק (שים כאן את הכתובת שלך) ---
const WEBHOOK_URL = 'YOUR_WEBHOOK_URL'; 

const SHOTS = [
  { name: '01_front_realistic', heading: 0,   pitch: -25 },
  { name: '02_side_realistic',  heading: 90,  pitch: -25 },
  { name: '03_cinematic_low',   heading: 180, pitch: -15 }
];

// חישוב שטח פוליגון במ"ר (Shoelace formula)
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

// פונקציה לשליחת התמונה לוובהוק
async function sendToWebhook(imagePath, name, coords) {
    try {
        const base64 = fs.readFileSync(imagePath, {encoding: 'base64'});
        await axios.post(WEBHOOK_URL, {
            event: "new_screenshot",
            image_name: name,
            coordinates: coords,
            image_data: base64 
        });
        console.log(`✅ ${name} נשלח בהצלחה לוובהוק`);
    } catch (e) {
        console.error(`❌ שגיאה בשליחה לוובהוק: ${e.message}`);
    }
}

function buildHtml(cesiumCoords, extrudedHeight, radius) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
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
        Cesium.Math.toRadians(h), Cesium.Math.toRadians(p), ${radius * 7.5}
      ));
    };

    window.isReady = () => viewer.scene.globe.tilesLoaded;
  </script>
</body>
</html>`;
}

async function main() {
  const polygonInput = process.argv[2] || '30.423415,-83.126156,30.423415,-83.126394,30.423786,-83.126393,30.423786,-83.126155';
  
  const rawPoints = polygonInput.split(',');
  const points = [];
  for (let i = 0; i < rawPoints.length; i += 2) {
    points.push({ lat: Number(rawPoints[i]), lng: Number(rawPoints[i+1]) });
  }

  const cesiumCoords = points.map(p => `${p.lng}, ${p.lat}`).join(', ');
  const areaM2 = calcAreaM2(points);
  const extrudedHeight = Math.max(15, Math.min(200, Math.round(0.2 * Math.sqrt(areaM2))));
  const radius = Math.sqrt(areaM2) / 2;

  const outDir = './screenshots';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const html = buildHtml(cesiumCoords, extrudedHeight, radius);
  const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(html);
  });
  server.listen(3000);

  console.log(`🚀 מתחיל צילום פוליגון: שטח ${Math.round(areaM2)} מ"ר`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:3000');

  for (const shot of SHOTS) {
    console.log(`📸 מכין את הזווית: ${shot.name}...`);
    await page.evaluate((s) => window.zoomToShot(s.heading, s.pitch), shot);
    
    // המתנה לטעינת המפה
    for(let i=0; i<30; i++) {
        const ready = await page.evaluate(() => window.isReady());
        if (ready) break;
        await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1500); // ביטחון סופי לרינדור צללים

    const imgPath = path.join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: imgPath });
    
    // שליחה לוובהוק
    await sendToWebhook(imgPath, shot.name, polygonInput);
  }

  await browser.close();
  server.close();
  console.log('🏁 הסתיים בהצלחה!');
  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
