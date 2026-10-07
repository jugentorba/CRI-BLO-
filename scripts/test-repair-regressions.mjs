import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireText(path, pattern, message) {
  const content = read(path);
  if (!pattern.test(content)) throw new Error(`${message} [${path}]`);
}

function forbidText(path, pattern, message) {
  const content = read(path);
  if (pattern.test(content)) throw new Error(`${message} [${path}]`);
}

forbidText(
  ".github/workflows/pages.yml",
  /gh release (?:create|upload)/,
  "Only build-release.yml may publish Android releases used by the in-app updater",
);

for (const workflow of [".github/workflows/build-release.yml", ".github/workflows/pages.yml"]) {
  forbidText(
    workflow,
    /ref:\s*criblo-master-spec-v1/,
    "Release workflow must build the triggering/default source, not the stale criblo-master-spec-v1 branch",
  );
  requireText(
    workflow,
    /node scripts\/patch-android-updater\.mjs/,
    "Android build must install the native in-app updater bridge before compiling the APK",
  );
  requireText(
    workflow,
    /android\.permission\.ACCESS_FINE_LOCATION/,
    "Android production build must retain precise-location permission",
  );
}

requireText(
  "package.json",
  /"@capacitor\/geolocation"\s*:/,
  "Native geolocation dependency is required",
);
requireText(
  "src/lib/geo/gps.ts",
  /from "@capacitor\/geolocation"/,
  "GPS must use Capacitor Geolocation on native Android/iOS",
);
requireText(
  "src/lib/geo/gps.ts",
  /Capacitor\.isNativePlatform\(\)/,
  "GPS must select the native path inside the APK",
);

requireText(
  "src/lib/ai/independent.ts",
  /CapacitorHttp/,
  "AI requests must use Capacitor native HTTP inside the APK to avoid WebView CORS failures",
);
requireText(
  "src/routes/parametres.tsx",
  /AppUpdateSection/,
  "Settings must expose the in-app updater",
);
requireText(
  "src/components/AppUpdateSection.tsx",
  /downloadAndInstallUpdate/,
  "Android update button must download and hand the APK to the native installer",
);
requireText(
  "src/lib/updates/native.ts",
  /registerPlugin.*CriBloUpdater/s,
  "Web layer must register the CriBloUpdater native bridge",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /REQUEST_INSTALL_PACKAGES/,
  "Generated Android project must request package-install permission",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /FileProvider/,
  "Generated Android project must expose the downloaded APK through a FileProvider",
);


/* Broader CRI BLO regression audit: protect previously requested field/export behavior. */
requireText(
  "src/lib/export/xlsx.ts",
  /commentaires:\s*\{\s*sheet:\s*"FICHE SAV BLO",\s*cell:\s*"A52"/,
  "Comments must be written into the official Excel comment area",
);
requireText(
  "src/lib/export/xlsx.ts",
  /sheet:\s*"PHOTOS OI"[\s\S]*row:\s*37\s*\+/,
  "Supplementary photos must be embedded in PHOTOS OI below the official four slots",
);
forbidText(
  "src/lib/export/zip.ts",
  /photo_extra_\d+/,
  "Supplementary Photos OI must not be duplicated as separate ZIP files",
);
requireText(
  "src/lib/cri/schema.ts",
  /photo_mesures_loc1[\s\S]*photo_mesures_loc2/,
  "MESURES must retain its two requested photo slots",
);
forbidText(
  "src/lib/cri/schema.ts",
  /photo_mesures_loc3/,
  "MESURES must stay limited to two photo slots",
);
requireText(
  "src/lib/cri/schema.ts",
  /longueurCable[\s\S]*type:\s*"number"/,
  "Cable length field must remain numeric",
);
requireText(
  "src/lib/export/xlsx.ts",
  /longueurCable:\s*\{\s*sheet:\s*"FICHE SAV BLO",\s*cell:\s*"G31"/,
  "Cable length must remain mapped to the official Excel cell",
);
requireText(
  "src/lib/attachments/repository.ts",
  /await file\.arrayBuffer\(\)[\s\S]*new Blob\(\[bytes\]/,
  "USB/external attachments must be copied into local IndexedDB storage immediately",
);
requireText(
  "src/routes/cri.$id.tsx",
  /setReviewing\(true\);[\s\S]{0,160}void handleSaveDraft\(\);/,
  "The first Save tap must open finalization and persist the draft",
);
requireText(
  "src/lib/export/naming.ts",
  /CRI_BLO_\$\{safe\(commune\)\}_\$\{safe\(reference\)\}/,
  "Excel/PDF filenames must remain commune + dossier",
);
requireText(
  "src/lib/export/naming.ts",
  /\$\{safe\(reference\)\}_\$\{safe\(commune\)\}\.zip/,
  "ZIP filename must remain dossier + commune",
);
requireText(
  "src/components/cri/ExtraPhotosBatchAdd.tsx",
  /const files\s*=\s*Array\.from\(fileList\)\.filter/,
  "Photos OI batch import must reject non-image files before storing them as photo slots",
);
requireText(
  "src/components/cri/ExtraPhotosBatchAdd.tsx",
  /accept="image\/\*"/,
  "Photos OI picker must advertise image-only input",
);
requireText(
  "src/components/cri/ExtraPhotosSection.tsx",
  /photo_extra_\$\{count \+ 1\}/,
  "Supplementary Photos OI must remain dynamically extendable",
);
requireText(
  ".github/workflows/build-release.yml",
  /ANDROID_KEYSTORE_BASE64[\s\S]*ANDROID_KEY_PASSWORD/,
  "Production APK updates must keep permanent signing credentials",
);
requireText(
  "capacitor.config.json",
  /"appId":\s*"com\.criblo\.app"/,
  "Android package identity must stay stable so updates preserve app data",
);
forbidText(
  "scripts/patch-android-updater.mjs",
  /ACTION_DELETE|\buninstall\b/i,
  "In-app updater must install over the existing app and never uninstall it",
);


/* Previously reported CRI regressions: keep these protected too. */
requireText(
  "src/routes/cri.$id.tsx",
  /setReviewing\(true\)[\s\S]{0,200}handleSaveDraft\(\)/,
  "Save/finalize must react on the first tap while persisting the draft",
);
requireText(
  "src/lib/export/zip.ts",
  /type:\s*"uint8array"/,
  "ZIP export must finish into stable bytes before Android receives the archive",
);
forbidText(
  "src/lib/export/zip.ts",
  /zip\.file\([^\n]*photo_extra_/,
  "Supplementary OI photos belong only in the Excel PHOTOS OI sheet, not as loose ZIP files",
);
requireText(
  "src/lib/export/xlsx.ts",
  /commentaires:\s*\{[^}]*cell:\s*"A52"/,
  "CRI comments must be written into the official Excel template",
);
requireText(
  "src/lib/export/xlsx.ts",
  /photo_extra_/,
  "Unlimited supplementary OI photo slots must remain supported",
);
requireText(
  "src/lib/export/xlsx.ts",
  /sheet:\s*"PHOTOS OI"[\s\S]{0,220}Math\.floor/,
  "Supplementary OI photos must be laid out dynamically in the PHOTOS OI sheet",
);
requireText(
  "src/lib/attachments/repository.ts",
  /file\.arrayBuffer\(\)[\s\S]{0,300}new Blob/,
  "Imported USB/external attachments must be copied into local IndexedDB storage",
);
requireText(
  "src/components/cri/AttachmentsSection.tsx",
  /navigator\.share[\s\S]{0,900}downloadBlob/,
  "Stored supplementary files must be openable/shareable from CRI BLO with a download fallback",
);
requireText(
  "src/lib/export/naming.ts",
  /CRI_BLO_\$\{safe\(commune\)\}_\$\{safe\(reference\)\}/,
  "Excel/PDF naming must be commune then dossier",
);
requireText(
  "src/lib/export/naming.ts",
  /\$\{safe\(reference\)\}_\$\{safe\(commune\)\}\.zip/,
  "ZIP naming must be dossier then commune",
);
requireText(
  "src/lib/cri/schema.ts",
  /photo_mesures_loc1[\s\S]{0,500}photo_mesures_loc2/,
  "MESURES must keep the two requested photo slots",
);
requireText(
  "src/lib/cri/schema.ts",
  /gpsBtnA[\s\S]{0,900}scope:\s*"A"[\s\S]{0,1200}gpsBtnB[\s\S]{0,900}scope:\s*"B"[\s\S]{0,1600}gpsBtnDefaut[\s\S]{0,900}scope:\s*"defaut"/,
  "GPS capture must remain available independently for A, B and defect",
);

/* Provider defaults must be model IDs that are currently published by each provider. */
requireText(
  "src/lib/ai/independent.ts",
  /model:\s*"gpt-6-luna"/,
  "OpenAI default model must use the current API model ID",
);
requireText(
  "src/lib/ai/independent.ts",
  /model:\s*"deepseek-v4-flash"/,
  "DeepSeek default model must use the current V4 API model ID",
);
requireText(
  "src/lib/ai/independent.ts",
  /model:\s*"claude-sonnet-5-5"/,
  "Anthropic default model must use the current Sonnet API model ID",
);

console.log("CRI BLO repair regression checks passed.");
