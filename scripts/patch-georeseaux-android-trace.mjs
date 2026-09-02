import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const swiftPath = resolve(
  here,
  "../plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift",
);

let source = readFileSync(swiftPath, "utf8");
const original = source;

function replaceRequired(label, from, to) {
  if (!source.includes(from)) throw new Error(`Cleanup anchor missing: ${label}`);
  source = source.replace(from, to);
}

replaceRequired(
  "duplicate touch coordinate assignment",
  "          realTouchX = touch.clientX;          realTouchX = touch.clientX;\n",
  "          realTouchX = touch.clientX;\n",
);

replaceRequired(
  "delayed touchstart comment",
  "          // recognizer has already begun. If that happened, let this touchstart\n          // finish its normal capture/bubble propagation, then send contextmenu.\n          // GeoReseaux must see pointerdown/touchstart before the hold action.\n",
  "          // recognizer has already begun. If that happened, let this touchstart\n          // finish normal propagation, establish the Android press state, and arm\n          // the hold. contextmenu remains deferred until the physical release.\n",
);

if (source === original) throw new Error("GeoReseaux cleanup made no changes");
writeFileSync(swiftPath, source);
console.log("Cleaned the measured-Android-order iOS GeoReseaux bridge.");
