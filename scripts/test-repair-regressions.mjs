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
    "Workflows must build the triggering/default source, not the stale criblo-master-spec-v1 branch",
  );
}

requireText(
  ".github/workflows/build-release.yml",
  /node scripts\/patch-android-updater\.mjs/,
  "The single Android release build must install the native in-app updater bridge",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /android\.permission\.ACCESS_FINE_LOCATION/,
  "Every generated Android APK must retain precise-location permission",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /android\.permission\.CAMERA/,
  "Every generated Android APK must request camera permission",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /usesCleartextTraffic/,
  "Every generated Android APK must allow the integrated browser to reach explicitly entered HTTP sites",
);

forbidText(
  "src/components/PermissionSetupDialog.tsx",
  /navigator\.geolocation/,
  "Permission onboarding must not bypass the native GPS implementation",
);
requireText(
  "src/components/PermissionSetupDialog.tsx",
  /getCurrentPosition/,
  "Permission onboarding must use the same native-aware GPS path as CRI capture",
);
forbidText(
  ".github/workflows/build-release.yml",
  /Missing repository variable GOOGLE_WEB_CLIENT_ID|test -n "\$GOOGLE_WEB_CLIENT_ID"/,
  "Optional Google configuration must never block a signed CRI BLO release",
);

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



/* Schema-to-Excel coverage guard: a normal CRI field may not silently disappear from export. */
{
  const schemaText = read("src/lib/cri/schema.ts");
  const xlsxText = read("src/lib/export/xlsx.ts");
  const fieldIds = [...schemaText.matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*label:/g)].map((match) => match[1]);
  const mappedIds = new Set(
    [...xlsxText.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*\{\s*sheet:/gm)].map((match) => match[1]),
  );
  const explicitlyHandled = new Set([
    "company",
    "technicianName",
    "gpsCoordsDefaut",
    "commune",
    "codePostal",
    "nomVoie",
    "numeroVoie",
    "defautLocaliseAutre",
    "causePrincipaleAutre",
  ]);
  const missing = fieldIds.filter(
    (id) =>
      !id.startsWith("photo_") &&
      !id.startsWith("gpsBtn") &&
      !explicitlyHandled.has(id) &&
      !mappedIds.has(id),
  );
  if (missing.length) {
    throw new Error(`CRI fields missing from Excel export coverage: ${missing.join(", ")}`);
  }
}

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
  /Fichiers supplementaires\//,
  "Supplementary files must stay flat at ZIP root beside the official document",
);
requireText(
  "src/lib/export/zip.ts",
  /uniqueName\(used,\s*a\.name\)/,
  "Supplementary file names must be preserved at ZIP root with duplicate auto-renaming",
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

/* One production APK pipeline: Pages must never create a second signed Android version. */
forbidText(
  ".github/workflows/pages.yml",
  /cap add android|assembleRelease|ANDROID_KEYSTORE_BASE64|CRI-BLO\.apk/,
  "Pages must deploy only the PWA; build-release.yml is the single production APK builder",
);
requireText(
  ".github/workflows/build-release.yml",
  /downloads\/CRI-BLO\.apk/,
  "Signed release workflow must refresh the repository's direct APK download",
);
requireText(
  ".github/workflows/build-release.yml",
  /downloads\/CRI-BLO-PWA\.zip/,
  "Signed release workflow must refresh the downloadable PWA package alongside the APK",
);

/* Previously requested fixed form behavior. */
forbidText(
  "src/lib/cri/visibility.ts",
  /photo_rdsur_(?:avant|apres)\s*:/,
  "RDSUR before/after photos must always stay visible; they are optional evidence",
);
requireText(
  "src/lib/cri/schema.ts",
  /id:\s*"ripZone"[\s\S]{0,260}options:\s*\["RIP",\s*"AMII"\]/,
  "RIP/AMII must use the exact fixed choices requested",
);

/* Device fallbacks and compatibility. */
requireText(
  "scripts/patch-android-updater.mjs",
  /android\.permission\.RECORD_AUDIO/,
  "Every generated Android APK must request microphone permission for dictation",
);
requireText(
  "src/components/cri/PhotoSlot.tsx",
  /onNativeFallback=\{\(\)\s*=>\s*camRef\.current\?\.click\(\)\}/,
  "Photo camera overlay must fall back to the phone camera input when WebView camera fails",
);
requireText(
  "src/components/cri/TimestampCamera.tsx",
  /if\s*\(!stream\)\s*throw/,
  "Integrated camera must detect an unavailable WebView stream instead of showing a dead preview",
);
requireText(
  "src/components/cri/TimestampCamera.tsx",
  /Ouvrir la caméra du téléphone/,
  "Integrated camera errors must expose the phone-camera fallback",
);
requireText(
  "src/lib/cri/schema.ts",
  /id:\s*"ripZone"[\s\S]{0,320}freeTextWhen:\s*\["RIP"\]/,
  "RIP name free text must be available only when RIP is selected",
);
requireText(
  "src/routes/cri.$id.tsx",
  /ripZone\s*===\s*"AMI"[\s\S]{0,180}AMII/,
  "Existing CRI records saved with the old AMI value must migrate to AMII",
);

requireText(
  "src/components/cri/PhotoSlot.tsx",
  /if\s*\(!isImage\)\s*return/,
  "Photo slots must reject non-image files instead of storing them as broken photos",
);
requireText(
  "src/components/cri/PhotoSlot.tsx",
  /ref=\{fileRef\}[\s\S]{0,160}accept="image\/\*/,
  "The full file picker for a photo slot must still be image-only",
);

/* Integrated browser must bypass WebView CORS inside the native APK. */
for (const browserModule of ["src/lib/browser/proxy.browser.ts", "src/lib/browser/fetch.browser.ts"]) {
  requireText(
    browserModule,
    /CapacitorHttp/,
    "Integrated browser networking must use Capacitor native HTTP in the APK",
  );
  requireText(
    browserModule,
    /Capacitor\.isNativePlatform\(\)/,
    "Integrated browser networking must select its native path inside the APK",
  );
}

/* Permanent Android signer continuity: public fingerprint is pinned, private key remains secret. */
requireText(
  "android-release-certificate.sha256",
  /^36:61:19:6D:8E:DD:ED:FD:3C:D8:06:07:E1:64:2B:D4:EB:D2:13:78:52:DC:F3:3D:D5:98:CC:E2:4C:94:62:C8\s*$/m,
  "Permanent CRI BLO release certificate fingerprint must stay pinned",
);
requireText(
  ".github/workflows/build-release.yml",
  /android-release-certificate\.sha256[\s\S]{0,1200}signing-certificate\.txt/,
  "Signed release must verify its certificate against the pinned permanent fingerprint",
);
requireText(
  ".github/workflows/build-release.yml",
  /\^\.\*certificate SHA-256 digest:/,
  "Release certificate parser must accept V2 Signer output from current Android build tools",
);
forbidText(
  ".github/workflows/build-release.yml",
  /\^Signer #1 certificate SHA-256 digest:/,
  "Release certificate parser must not depend on the old Signer #1 label",
);

/* Android export-folder picker must use the native Storage Access Framework. */
requireText(
  "src/lib/export/folder.ts",
  /Capacitor\.isNativePlatform\(\)/,
  "Export folder logic must select a native Android path inside the APK",
);
requireText(
  "src/lib/export/native-folder.ts",
  /registerPlugin.*CriBloStorage/s,
  "Web layer must register the native CRI BLO storage bridge",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /ACTION_OPEN_DOCUMENT_TREE/,
  "Android folder selection must open the native Storage Access Framework folder picker",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /takePersistableUriPermission/,
  "Selected Android export folder permission must persist across app restarts",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /CriBloStoragePlugin\.class/,
  "The generated Android activity must register the CRI BLO storage plugin",
);
requireText(
  "src/lib/export/folder.ts",
  /beginWrite[\s\S]{0,2000}writeChunk[\s\S]{0,2000}finishWrite/,
  "Native Android exports must stream files in chunks instead of sending one huge bridge payload",
);

/* Android updater must validate the downloaded APK before opening Package Installer. */
requireText(
  "src/lib/updates/github.ts",
  /downloadSize\?:\s*number/,
  "Update metadata must carry the GitHub APK asset size",
);
requireText(
  "src/components/AppUpdateSection.tsx",
  /info\.downloadSize/,
  "Android update action must pass the expected APK size into the native downloader",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /expectedSize/,
  "Native updater must receive the expected GitHub APK size",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /PK\\u0003\\u0004|0x50[\s\S]{0,120}0x4b/,
  "Native updater must reject files that do not have an APK ZIP header",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /getPackageArchiveInfo/,
  "Native updater must parse the downloaded APK before opening the installer",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /activity\.getPackageName\(\)/,
  "Native updater must verify the downloaded package belongs to CRI BLO",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /GET_SIGNING_CERTIFICATES/,
  "Native updater must verify APK signing certificate compatibility",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /Content-Type|contentType/i,
  "Native updater must reject HTML/JSON responses masquerading as APK downloads",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /ClipData/,
  "Installer handoff must grant the APK content URI explicitly",
);

/* Cloud-folder sync must work without Google/Azure OAuth on Android. */
requireText(
  "src/lib/settings/repository.ts",
  /cloudProvider\?:\s*"onedrive"\s*\|\s*"google-drive"\s*\|\s*"cloud-folder"/,
  "Settings must support the native cloud-folder provider",
);
requireText(
  "src/lib/cloud/folder-sync.ts",
  /exportSyncSnapshot[\s\S]{0,1600}importSyncSnapshot/,
  "Cloud-folder provider must backup and restore the full CRI BLO snapshot",
);
requireText(
  "src/lib/cloud/folder-sync.ts",
  /writeChunk[\s\S]{0,1600}readChunk/,
  "Cloud-folder sync must stream snapshot data in chunks",
);
requireText(
  "src/lib/cloud/sync.ts",
  /cloud-folder[\s\S]{0,500}uploadCloudFolderSnapshot/,
  "Cloud sync router must support the native cloud-folder provider",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /cloud_tree_uri/,
  "Android native storage plugin must persist a separate cloud-folder URI",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /beginRead[\s\S]{0,2200}readChunk[\s\S]{0,2200}finishRead/,
  "Android native storage plugin must support chunked cloud snapshot restore",
);
requireText(
  "src/routes/parametres.tsx",
  /value="cloud-folder"/,
  "Settings must expose Cloud folder as a selectable sync provider",
);

/* Gemini comment rewriting must visibly change the source text. */
requireText(
  "src/components/cri/CommentAssistant.tsx",
  /ne recopie pas mot pour mot|ne répète pas mot pour mot/i,
  "Comment assistant must explicitly require a real rewrite",
);
requireText(
  "src/components/cri/CommentAssistant.tsx",
  /sameNormalizedText|sameMeaningfulText/,
  "Comment assistant must detect unchanged AI output",
);
requireText(
  "src/components/cri/CommentAssistant.tsx",
  /retry|deuxième|second/i,
  "Comment assistant must retry once when Gemini returns unchanged text",
);

/* Android updater regression: never claim installation UI appeared merely because
   startActivity returned, and always leave the verified APK in a public download. */
requireText(
  "scripts/patch-android-updater.mjs",
  /Intent install = new Intent\(Intent\.ACTION_INSTALL_PACKAGE\)/,
  "The PRIMARY installer intent must use ACTION_INSTALL_PACKAGE",
);
forbidText(
  "scripts/patch-android-updater.mjs",
  /Intent install = new Intent\(Intent\.ACTION_VIEW\)/,
  "Primary install intent must never use ACTION_VIEW (silent file handlers)",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/,
  "Updater must copy verified APKs to public Downloads so users can recover them",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /IS_PENDING, 0/,
  "Downloaded APK must be published and visible in Files after copy",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /openSystemPackageInstaller\(activity, publicApk\)/,
  "Installer should receive the readable published APK content URI",
);
requireText(
  "src/components/AppUpdateSection.tsx",
  /Mes fichiers > Téléchargements > CRI-BLO/,
  "If no installer appears, update UI must tell the user where the APK is",
);
for (const path of [
  "src/components/AppUpdateSection.tsx",
  "src/lib/updates/native.ts",
  "scripts/patch-android-updater.mjs",
]) {
  forbidText(
    path,
    /installer_opened|Android a ouvert l'installateur/,
    "UI cannot falsely claim Android showed the installer screen",
  );
}

/* Android updater must hand the APK to the system package installer, not a generic chooser. */
requireText(
  "scripts/patch-android-updater.mjs",
  /Intent\.ACTION_INSTALL_PACKAGE/,
  "Updater must use Android's install-package action",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /FLAG_SYSTEM/,
  "Updater must prefer the system package installer over third-party APK handlers",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /grantUriPermission/,
  "Updater must explicitly grant the selected installer read access to the APK URI",
);
requireText(
  "scripts/patch-android-updater.mjs",
  /install\.setPackage\(systemInstallerPackage\)/,
  "Primary APK handler must be explicitly restricted to a system package installer",
);

/* Gemini field-note requests must be genuinely fast and produce a real rewrite. */
requireText(
  "src/lib/ai/independent.ts",
  /model:\s*"gemini-3\.5-flash-lite"/,
  "Gemini default must use the current Flash-Lite model for low-latency field notes",
);
requireText(
  "src/lib/ai/independent.ts",
  /getGeminiReasoningEffort\(config\.model,\s*options\?\.fast\s*\?\?\s*false\)/,
  "Fast Gemini calls must choose a model-compatible reasoning level",
);
requireText(
  "src/lib/ai/independent.ts",
  /readTimeout:\s*provider\s*===\s*"gemini"[\s\S]{0,120}35000/,
  "Gemini native HTTP must fail quickly instead of waiting minutes",
);
requireText(
  "src/lib/ai/independent.ts",
  /max_tokens:\s*options\?\.maxTokens/,
  "AI calls must support a small output budget for field-note speed",
);
requireText(
  "src/routes/assistant.tsx",
  /maxTokens:\s*220[\s\S]{0,200}fast:\s*true/,
  "Main Assistant must use the fast small-output AI path",
);
requireText(
  "src/routes/assistant.tsx",
  /sameNormalizedText/,
  "Main Assistant must detect an unchanged AI response",
);
requireText(
  "src/routes/assistant.tsx",
  /OBJECTIVE_INSTRUCTIONS/,
  "Each Assistant objective must use a concise dedicated instruction",
);
requireText(
  "src/routes/assistant.tsx",
  /PRIMARY_TONES[\s\S]{0,500}ADVANCED_TONES/,
  "Common Assistant objectives must stay visible while email/explanation move under More",
);
requireText(
  "src/routes/assistant.tsx",
  /timeout\s*&&\s*activeProvider\s*===\s*"gemini"[\s\S]{0,500}output\s*=\s*""/,
  "Gemini timeout must not be saved as a fake offline Assistant response",
);


/* Android app update must be one-tap after checking. */
requireText(
  "src/components/AppUpdateSection.tsx",
  /const info = await checkForAppUpdate\(\)[\s\S]{0,900}openUpdate\(info\)/,
  "Android update check must immediately start the signed APK install flow when an update is found",
);
requireText(
  "src/components/AppUpdateSection.tsx",
  /Télécharger et installer/,
  "Update card must keep an explicit manual Download & Install retry button",
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
