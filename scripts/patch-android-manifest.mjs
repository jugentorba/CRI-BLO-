import { readFile, writeFile } from "node:fs/promises";

const manifestPath = "android/app/src/main/AndroidManifest.xml";
const permissions = [
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
];

let xml = await readFile(manifestPath, "utf8");

const missing = permissions.filter(
  (permission) => !xml.includes(`android:name=\"${permission}\"`),
);

if (missing.length > 0) {
  const entries = missing
    .map((permission) => `    <uses-permission android:name=\"${permission}\" />`)
    .join("\n");
  xml = xml.replace(/(<manifest\b[^>]*>)/, `$1\n${entries}`);
}

if (!xml.includes('android.hardware.camera')) {
  xml = xml.replace(
    /(<application\b)/,
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n\n$1',
  );
}

await writeFile(manifestPath, xml, "utf8");
console.log(`CRI-BLO Android manifest ready (${missing.length} permission entries added).`);
