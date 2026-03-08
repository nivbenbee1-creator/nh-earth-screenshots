/**
 * NH Earth Pro - Realistic + Webhook Edition
 * Version: 2026.1
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // חובה לוודא שמותקן ב-package.json

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MmEzODkxMy1hZjNkLTQzNjctYWFjYS04MzBjZDYwYjg2MjciLCJpZCI6MzkxNjE0LCJpYXQiOjE3NzE0MTE2NjJ9.14odwmn05mQ89bIEPBEzIAOia0I0AkwjD9oO--Gs4Zs';
const WEBHOOK_URL = 'כאן_שמים_את_הכתובת_של_הווובהוק'; 

const SHOTS = [
    { name: '01_front_realistic', heading: 0,   pitch: -25 },
    { name: '02_cinematic_low',   heading: 45,  pitch: -15 }
];

async function sendToWebhook(imagePath, shotName) {
    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');
        await axios.post(WEBHOOK_URL, {
            status: "success",
            shot: shotName,
            image: base64Image
        });
        console.log(`✅ Sent ${shotName} to webhook`);
    } catch (e) {
        console.error(`❌ Webhook error: ${e.message}`);
    }
}

function buildHtml(coords, height, radius) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <script src="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Cesium.js"></script>
        <link href="https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
        <style>body, #cesiumContainer { width: 100%; height: 100vh; margin: 0; overflow: hidden; }</style>
    </head>
    <body>
        <div id="cesiumContainer"></div>
        <script>
            Cesium.Ion.defaultAccessToken = '${CESIUM_TOKEN}';
            const viewer = new Cesium.Viewer('cesiumContainer', {
                terrain: Cesium.Terrain.fromWorldTerrain(),
                shadows: true, // צללים דלוקים
                animation: false, timeline: false, baseLayerPicker: false
            });

            const scene = viewer.scene;
            scene.globe.enableLighting = true; // שמש אמיתית
            scene.highDynamicRange = true;     // HDR
            scene.fog.enabled = true;          // ערפל
            scene.globe.showGroundAtmosphere = true; 

            const entity = viewer.entities.add({
                polygon: {
                    hierarchy: Cesium.Cartesian3.fromDegreesArray([${coords}]),
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    extrudedHeight: ${height},
                    extrudedHeightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                    material: Cesium.Color.fromCssColorString('#22C55E').withAlpha(0.5),
                    outline: true,
                    outlineColor: Cesium.Color.WHITE, // אאוטליין לבן יוקרתי
                    outlineWidth: 3
                }
            });

            window.zoomToShot = (h, p) => {
                return viewer.zoomTo(entity, new Cesium.HeadingPitchRange(
                    Cesium.Math.toRadians(h), Cesium.Math.toRadians(p), ${radius * 7}
                ));
            };
        </script>
    </body>
    </html>`;
}

async function main() {
    const coords = process.argv[2] || "-83.1261,30.4234,-83.1263,30.4234,-83.1263,30.4237,-83.1261,30.4237";
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    
    await page.setContent(buildHtml(coords, 40, 150));
    
    for (const shot of SHOTS) {
        await page.evaluate((s) => window.zoomToShot(s.heading, s.pitch), shot);
        await page.waitForTimeout(3000); // זמן טעינה
        const imgPath = path.join(__dirname, `${shot.name}.png`);
        await page.screenshot({ path: imgPath });
        await sendToWebhook(imgPath, shot.name);
    }
    await browser.close();
}

main();
