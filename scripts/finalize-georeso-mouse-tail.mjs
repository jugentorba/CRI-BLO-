import fs from "node:fs";

const swiftPath = "plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift";
const testPath = "scripts/test-ios-longpress-bridge.mjs";

const swift = fs.readFileSync(swiftPath, "utf8");
for (const marker of [
  "var __cribloHeldMouseUp = null;",
  "function replayHeldCompatibilityMouseTail(request)",
  "function ensureAndroidPointerUpAfterTouchEnd(request)",
  "request.pointerUpPresented = true;",
  "}, 90);",
]) {
  if (!swift.includes(marker)) throw new Error("mouse-tail production fix marker missing: " + marker);
}

let test = fs.readFileSync(testPath, "utf8");

const oldReleaseBlock = `windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);\nawait Promise.resolve();\nawait wait(35);\nconst expected = "touchstart,pointerdown,mousedown,touchend,pointerup,mouseup,click,contextmenu";`;
const newReleaseBlock = `windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);\nawait Promise.resolve();\n// Production deliberately waits up to 90 ms for a late trusted pointerup before\n// synthesizing any missing mouse release tail. The unit gate must allow that\n// window instead of approving only the old immediate-completion behavior.\nawait wait(130);\nconst expected = "touchstart,pointerdown,mousedown,touchend,pointerup,mouseup,click,contextmenu";`;
if (test.includes(oldReleaseBlock)) test = test.replace(oldReleaseBlock, newReleaseBlock);
if (!test.includes("await wait(130);\nconst expected = \"touchstart,pointerdown,mousedown,touchend,pointerup,mouseup,click,contextmenu\";")) {
  throw new Error("trusted release regression wait block not found");
}

const oldHiddenBlock = `pointer("pointerup", 91, 42, 0);\ntouch("touchend", 91, 42);\nawait wait(40);\nif (geoDomCalls !== 1 || !geoDomTrusted)`;
const newHiddenBlock = `pointer("pointerup", 91, 42, 0);\ntouch("touchend", 91, 42);\n// Same 90 ms pointer-release watchdog applies to the hidden OpenLayers/DOM\n// fixture. Wait beyond it before judging whether contextmenu reached the app.\nawait wait(130);\nif (geoDomCalls !== 1 || !geoDomTrusted)`;
if (test.includes(oldHiddenBlock)) test = test.replace(oldHiddenBlock, newHiddenBlock);
if (!test.includes("touch(\"touchend\", 91, 42);\n// Same 90 ms pointer-release watchdog")) {
  throw new Error("hidden OpenLayers regression wait block not found");
}

fs.writeFileSync(testPath, test);
