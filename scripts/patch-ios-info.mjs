import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const plistPath = resolve("ios/App/App/Info.plist");

if (!existsSync(plistPath)) {
  console.error(`CRI BLO iOS permissions: Info.plist not found at ${plistPath}`);
  process.exit(1);
}

let plist = await readFile(plistPath, "utf8");

const entries = [
  [
    "NSLocationWhenInUseUsageDescription",
    "CRI BLO utilise votre position pendant l'intervention pour enregistrer les coordonnées GPS et l'adresse des preuves terrain.",
  ],
  [
    "NSLocationAlwaysAndWhenInUseUsageDescription",
    "CRI BLO utilise votre position pendant l'intervention pour enregistrer les coordonnées GPS et l'adresse des preuves terrain.",
  ],
  [
    "NSCameraUsageDescription",
    "CRI BLO utilise l'appareil photo pour capturer les preuves terrain.",
  ],
  [
    "NSPhotoLibraryUsageDescription",
    "CRI BLO accède à vos photos lorsque vous choisissez des preuves depuis la photothèque.",
  ],
  [
    "NSPhotoLibraryAddUsageDescription",
    "CRI BLO peut enregistrer des photos de preuve dans votre photothèque lorsque vous le demandez.",
  ],
  [
    "NSMicrophoneUsageDescription",
    "CRI BLO utilise le microphone uniquement pour la dictée vocale lorsque vous l'activez.",
  ],
];

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const missing = entries.filter(([key]) => !plist.includes(`<key>${key}</key>`));
if (missing.length === 0) {
  console.log("CRI BLO iOS permissions: Info.plist already contains all required privacy descriptions.");
  process.exit(0);
}

const insertion = missing
  .map(([key, value]) => `\t<key>${key}</key>\n\t<string>${xmlEscape(value)}</string>`)
  .join("\n");

const marker = "</dict>";
const markerIndex = plist.lastIndexOf(marker);
if (markerIndex < 0) {
  console.error("CRI BLO iOS permissions: malformed Info.plist (missing </dict>).");
  process.exit(1);
}

plist = `${plist.slice(0, markerIndex)}${insertion}\n${plist.slice(markerIndex)}`;
await writeFile(plistPath, plist, "utf8");
console.log(`CRI BLO iOS permissions: added ${missing.length} privacy usage descriptions.`);
