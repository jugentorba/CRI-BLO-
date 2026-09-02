import fs from "node:fs";
import { execFileSync } from "node:child_process";

const swiftPath = "plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift";
const testPath = "scripts/test-ios-longpress-bridge.mjs";
const intactBase = "2d9dbc317a77dc27c41a687b3f4de7a20c02ad97";

function gitShow(path) {
  return execFileSync("git", ["show", `${intactBase}:${path}`], { encoding: "utf8" });
}

// Never patch a possibly damaged experimental bridge in place. Start from the
// last intact source that already contains DOM-first context dispatch and the
// validated Orange HTTP/JS Android identity parity fix.
let swift = gitShow(swiftPath);
let test = gitShow(testPath);

function replaceSwift(label, regex, replacement) {
  if (!regex.test(swift)) throw new Error(`${label}: source block not found`);
  regex.lastIndex = 0;
  swift = swift.replace(regex, replacement);
}

// Remove the old raw pointer observers BEFORE inserting the new top-of-path
// observers, so the replacement cannot accidentally match its own new code.
replaceSwift(
  "remove old raw pointerdown observer",
  /      __cribloOriginalAddEventListener\.call\(document, 'pointerdown', function \(event\) \{\n        try \{\n          if \(!event \|\| !event\.isTrusted \|\| String\(event\.pointerType \|\| ''\) !== 'touch'\) return;\n          lastRealPointerDownAt = Date\.now\(\);\n          lastRealPointerDownTarget = event\.target \|\| null;\n          traceAndroidEvent\('pointerdown', true\);\n        \} catch \(_\) \{\}\n      \}, true\);\n\n/,
  "",
);
replaceSwift(
  "remove old raw pointerup observer",
  /      __cribloOriginalAddEventListener\.call\(document, 'pointerup', function \(event\) \{\n        try \{\n          if \(!event \|\| !event\.isTrusted \|\| String\(event\.pointerType \|\| ''\) !== 'touch'\) return;\n          lastRealPointerUpAt = Date\.now\(\);\n          lastRealPointerUpTarget = event\.target \|\| null;\n          traceAndroidEvent\('pointerup', true\);\n        \} catch \(_\) \{\}\n      \}, true\);\n\n/,
  "",
);

replaceSwift(
  "replace per-listener deferral infrastructure",
  /      \/\/ WKWebView exposes a different touch\/pointer ordering than the working[\s\S]*?      \/\/ GeoReseaux is bundled,/,
  `      // WebKit physically sends touch pointerdown before touchstart (and\n      // pointerup before touchend), while the measured working Android WebView\n      // exposes the reverse order to GeoReseaux. Intercept the genuine pointer\n      // event once at the top of the DOM path, preserve it as the trusted source,\n      // then replay the pointer semantics immediately after the matching genuine\n      // TouchEvent. We never preventDefault(), so WebKit's native touch/default\n      // processing remains intact.\n      var __cribloHeldPointerDown = null;\n      var __cribloHeldPointerUp = null;\n      var __cribloObservedPhysicalPointers = new WeakSet();\n\n      function runAfterCurrentEvent(callback) {\n        try {\n          if (typeof queueMicrotask === 'function') { queueMicrotask(callback); return; }\n          if (typeof Promise === 'function') { Promise.resolve().then(callback); return; }\n        } catch (_) {}\n        setTimeout(callback, 0);\n      }\n\n      function dispatchHeldAndroidPointer(kind) {\n        var isDown = kind === 'down';\n        var source = isDown ? __cribloHeldPointerDown : __cribloHeldPointerUp;\n        if (!source) return false;\n        if (isDown) __cribloHeldPointerDown = null; else __cribloHeldPointerUp = null;\n        var target = source.target;\n        if (!target || !target.dispatchEvent) return false;\n        try {\n          var event = new PointerEvent(isDown ? 'pointerdown' : 'pointerup', {\n            bubbles: true, cancelable: true, composed: true,\n            clientX: Number(source.clientX || 0), clientY: Number(source.clientY || 0),\n            screenX: Number(source.screenX || source.clientX || 0),\n            screenY: Number(source.screenY || source.clientY || 0),\n            button: Number(source.button == null ? 0 : source.button),\n            buttons: isDown ? Number(source.buttons || 1) : 0,\n            pointerId: Number(source.pointerId || 1), pointerType: 'touch',\n            isPrimary: source.isPrimary !== false,\n            width: Number(source.width || 9), height: Number(source.height || 9),\n            pressure: isDown ? Number(source.pressure || 0.5) : 0, view: window\n          });\n          __cribloSyntheticContextEvents.add(event);\n          __cribloSyntheticContextSources.set(event, source);\n          traceAndroidEvent(isDown ? 'pointerdown' : 'pointerup', true);\n          target.dispatchEvent(event);\n          return true;\n        } catch (_) { return false; }\n      }\n\n      function capturePhysicalTouchPointer(event, kind) {\n        try {\n          if (!event || __cribloSyntheticContextEvents.has(event)) return;\n          if (__cribloObservedPhysicalPointers.has(event)) return;\n          __cribloObservedPhysicalPointers.add(event);\n          if (!event.isTrusted || String(event.pointerType || '') !== 'touch') return;\n          var isDown = kind === 'down';\n          if (isDown) {\n            lastRealPointerDownAt = Date.now();\n            lastRealPointerDownTarget = event.target || null;\n          } else {\n            lastRealPointerUpAt = Date.now();\n            lastRealPointerUpTarget = event.target || null;\n          }\n          if (window.__cribloGeoReseauxAndroidCompat && mapLikeTarget(event.target)) {\n            if (isDown) __cribloHeldPointerDown = event; else __cribloHeldPointerUp = event;\n            event.stopImmediatePropagation();\n            return;\n          }\n          traceAndroidEvent(isDown ? 'pointerdown' : 'pointerup', true);\n        } catch (_) {}\n      }\n\n      // Register before page scripts. Window capture blocks the premature WebKit\n      // pointer event before any later GeoReseaux/OpenLayers listener can see it.\n      // Document registration is a fallback for embedded/test DOMs without a full\n      // Window propagation path. Marked replay events are explicitly ignored.\n      __cribloOriginalAddEventListener.call(window, 'pointerdown', function (event) { capturePhysicalTouchPointer(event, 'down'); }, true);\n      __cribloOriginalAddEventListener.call(window, 'pointerup', function (event) { capturePhysicalTouchPointer(event, 'up'); }, true);\n      __cribloOriginalAddEventListener.call(document, 'pointerdown', function (event) { capturePhysicalTouchPointer(event, 'down'); }, true);\n      __cribloOriginalAddEventListener.call(document, 'pointerup', function (event) { capturePhysicalTouchPointer(event, 'up'); }, true);\n\n      // GeoReseaux is bundled,`,
);

replaceSwift(
  "remove listener-level defer branch",
  /          \/\/ Real iOS pointerdown arrives before touchstart and pointerup before\n          \/\/ touchend\. Hold only the application callback; CRI-BLO's raw native\n          \/\/ observers still receive the genuine trusted event immediately\.\n          if \(\(name === 'pointerdown' \|\| name === 'pointerup'\) && shouldDeferTrustedTouchPointer\(name, event\)\) \{\n            queueDeferredPointer\(name === 'pointerdown' \? 'down' : 'up', listener, this, event, target, options\);\n            return;\n          \}\n/,
  "",
);

replaceSwift(
  "touchstart replay",
  /          if \(event\.isTrusted\) \{\n            \/\/ Microtask checkpoint runs after touchstart propagation and before\n            \/\/ WebKit's compatibility mouse default action, restoring Android's\n            \/\/ page-visible touchstart -> pointerdown -> mousedown order\.\n            runAfterCurrentEvent\(function \(\) \{ flushDeferredPointers\('down'\); \}\);\n          \}/,
  `          if (event.isTrusted) {\n            runAfterCurrentEvent(function () { dispatchHeldAndroidPointer('down'); });\n          }`,
);
replaceSwift(
  "touchend replay",
  /          if \(event && event\.isTrusted\) \{\n            \/\/ Same conversion on release: GeoReseaux finishes touchend first,\n            \/\/ then sees the genuine trusted pointerup, then mouseup\/click\/context\.\n            runAfterCurrentEvent\(function \(\) \{ flushDeferredPointers\('up'\); \}\);\n          \}/,
  `          if (event && event.isTrusted) {\n            runAfterCurrentEvent(function () { dispatchHeldAndroidPointer('up'); });\n          }`,
);

// The bridge-only Node fixture must reproduce production document-start mode.
const marker = "globalThis.window = windowTarget;\nglobalThis.document = documentTarget;\nglobalThis.location = windowTarget.location;\nnew Function(match[1])();";
if (!test.includes(marker)) throw new Error("test production-mode marker not found");
test = test.replace(marker, "globalThis.window = windowTarget;\nglobalThis.document = documentTarget;\nglobalThis.location = windowTarget.location;\nwindowTarget.__cribloGeoReseauxAndroidCompat = true;\nnew Function(match[1])();");

fs.writeFileSync(swiftPath, swift);
fs.writeFileSync(testPath, test);
console.log(`Restored ${intactBase} and applied browser-level Android ordering cleanly`);
