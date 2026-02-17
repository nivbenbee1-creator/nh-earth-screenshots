/**
 * Upload screenshots to Google Drive
 * Uses a Service Account for authentication (no user login needed).
 * 
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_KEY - JSON key (stored as GitHub Secret)
 *   DRIVE_FOLDER_ID            - Target folder in Google Drive
 *   PARCEL_NAME                - Used for subfolder name
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = './screenshots';

async function main() {
  // 1. Auth with service account
  const keyJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials: keyJson,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const parentFolderId = process.env.DRIVE_FOLDER_ID;
  const parcelName = process.env.PARCEL_NAME || 'parcel';

  console.log(`\n📤 Uploading to Google Drive...`);
  console.log(`   Folder: ${parentFolderId}`);
  console.log(`   Parcel: ${parcelName}\n`);

  // 2. Create subfolder for this parcel
  const folderRes = await drive.files.create({
    requestBody: {
      name: parcelName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id, webViewLink',
  });
  const subFolderId = folderRes.data.id;
  console.log(`   📁 Created folder: ${folderRes.data.webViewLink}`);

  // 3. Upload all PNG files
  const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
  const uploaded = [];

  for (const file of files) {
    const filepath = path.join(SCREENSHOTS_DIR, file);
    const res = await drive.files.create({
      requestBody: {
        name: file,
        parents: [subFolderId],
      },
      media: {
        mimeType: 'image/png',
        body: fs.createReadStream(filepath),
      },
      fields: 'id, webViewLink',
    });
    console.log(`   ✅ ${file} → ${res.data.webViewLink}`);
    uploaded.push({ file, id: res.data.id, url: res.data.webViewLink });
  }

  // 4. Upload manifest.json too
  const manifestPath = path.join(SCREENSHOTS_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    // Add Drive URLs to manifest before uploading
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    manifest.drive_folder = folderRes.data.webViewLink;
    manifest.drive_files = uploaded;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await drive.files.create({
      requestBody: { name: 'manifest.json', parents: [subFolderId] },
      media: { mimeType: 'application/json', body: fs.createReadStream(manifestPath) },
    });
    console.log(`   ✅ manifest.json uploaded`);
  }

  console.log(`\n✅ Uploaded ${uploaded.length} files to Drive\n`);
}

main().catch(err => {
  console.error('Upload error:', err.message);
  process.exit(1);
});
