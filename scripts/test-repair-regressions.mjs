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

console.log("CRI BLO repair regression checks passed.");
