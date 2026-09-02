import fs from "node:fs";
import { execFileSync } from "node:child_process";

const swiftPath = "plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift";
const testPath = "scripts/test-ios-longpress-bridge.mjs";
const intactBase = "2d9dbc317a77dc27c41a687b3f4de7a20c02ad97";

function gitShow(path) {
  return execFileSync("git", ["show", `${intactBase}:${path}`], { encoding: "utf8" });
}

let swift = gitShow(swiftPath);
let test = gitShow(testPath);

function replaceSwift(label, regex, replacement) {
  if (!regex.test(swift)) throw new Error(`${label}: source block not found`);
  regex.lastIndex = 0;
  swift = swift.replace(regex, replacement);
}

// Remove the old raw pointer observers before adding the top-of-path replacement.
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
  `      // WebKit physically sends touch pointerdown before touchstart (and\n      // pointerup before touchend), while the measured working Android WebView\n      // exposes the reverse order. Capture the genuine WebKit pointer once at\n      // the top of the path and retain it as the trusted source. Its semantics\n      // are replayed only after the matching genuine TouchEvent has completed\n      // all page listeners, but still before browser compatibility-mouse defaults.\n      var __cribloHeldPointerDown = null;\n      var __cribloHeldPointerUp = null;\n      var __cribloObservedPhysicalPointers = new WeakSet();\n\n      function afterTouchPropagation(eventType, callback) {\n        var finished = false;\n        var fallbackTimer = null;\n        function finish() {\n          if (finished) return;\n          finished = true;\n          if (fallbackTimer) { try { clearTimeout(fallbackTimer); } catch (_) {} }\n          try { __cribloOriginalRemoveEventListener.call(window, eventType, finish, false); } catch (_) {}\n          callback();\n        }\n        try {\n          // This listener is appended during document capture. By the time the\n          // same TouchEvent reaches window bubble, all pre-existing page target,\n          // ancestor, document and window listeners have run. Browser default\n          // compatibility mouse actions have not run yet.\n          __cribloOriginalAddEventListener.call(window, eventType, finish, { capture: false, once: true });\n          // Minimal EventTarget test fixtures do not propagate through Window.\n          // Their fallback runs on the next task; production browsers hit the\n          // window-bubble listener synchronously first.\n          fallbackTimer = setTimeout(finish, 0);\n        } catch (_) {\n          fallbackTimer = setTimeout(finish, 0);\n        }\n      }\n\n      function dispatchHeldAndroidPointer(kind) {\n        var isDown = kind === 'down';\n        var source = isDown ? __cribloHeldPointerDown : __cribloHeldPointerUp;\n        if (!source) return false;\n        if (isDown) __cribloHeldPointerDown = null; else __cribloHeldPointerUp = null;\n        var target = source.target;\n        if (!target || !target.dispatchEvent) return false;\n        try {\n          var event = new PointerEvent(isDown ? 'pointerdown' : 'pointerup', {\n            bubbles: true, cancelable: true, composed: true,\n            clientX: Number(source.clientX || 0), clientY: Number(source.clientY || 0),\n            screenX: Number(source.screenX || source.clientX || 0),\n            screenY: Number(source.screenY || source.clientY || 0),\n            button: Number(source.button == null ? 0 : source.button),\n            buttons: isDown ? Number(source.buttons || 1) : 0,\n            pointerId: Number(source.pointerId || 1), pointerType: 'touch',\n            isPrimary: source.isPrimary !== false,\n            width: Number(source.width || 9), height: Number(source.height || 9),\n            pressure: isDown ? Number(source.pressure || 0.5) : 0, view: window\n          });\n          __cribloSyntheticContextEvents.add(event);\n          __cribloSyntheticContextSources.set(event, source);\n          traceAndroidEvent(isDown ? 'pointerdown' : 'pointerup', true);\n          target.dispatchEvent(event);\n          return true;\n        } catch (_) { return false; }\n      }\n\n      function capturePhysicalTouchPointer(event, kind) {\n        try {\n          if (!event || __cribloSyntheticContextEvents.has(event)) return;\n          if (__cribloObservedPhysicalPointers.has(event)) return;\n          __cribloObservedPhysicalPointers.add(event);\n          if (!event.isTrusted || String(event.pointerType || '') !== 'touch') return;\n          var isDown = kind === 'down';\n          if (isDown) {\n            lastRealPointerDownAt = Date.now();\n            lastRealPointerDownTarget = event.target || null;\n          } else {\n            lastRealPointerUpAt = Date.now();\n            lastRealPointerUpTarget = event.target || null;\n          }\n          if (window.__cribloGeoReseauxAndroidCompat && mapLikeTarget(event.target)) {\n            if (isDown) __cribloHeldPointerDown = event; else __cribloHeldPointerUp = event;\n            // Suppress propagation only. Never preventDefault: WebKit must still\n            // generate the genuine TouchEvent and its normal default behavior.\n            event.stopImmediatePropagation();\n            return;\n          }\n          traceAndroidEvent(isDown ? 'pointerdown' : 'pointerup', true);\n        } catch (_) {}\n      }\n\n      function sameMapPressTarget(a, b) {\n        if (!a || !b) return false;\n        if (a === b) return true;\n        try { if (a.contains && a.contains(b)) return true; } catch (_) {}\n        try { if (b.contains && b.contains(a)) return true; } catch (_) {}\n        return mapLikeTarget(a) && mapLikeTarget(b);\n      }\n\n      function suppressDuplicateCompatibilityMouseDown(event) {\n        try {\n          if (!event || __cribloSyntheticContextEvents.has(event) || !event.isTrusted) return;\n          if (!compatSyntheticMouseDownTarget || !compatSyntheticMouseDownAt) return;\n          if (Date.now() - compatSyntheticMouseDownAt > 2500) return;\n          if (!sameMapPressTarget(event.target, compatSyntheticMouseDownTarget)) return;\n          // We already delivered Android's single mousedown beside touchstart.\n          // Some WebKit/Chromium versions generate another mousedown after\n          // touchend. Drop only that duplicate; genuine mouseup/click are kept.\n          event.stopImmediatePropagation();\n        } catch (_) {}\n      }\n\n      // Installed before page scripts so premature physical pointer events cannot\n      // reach later GeoReseaux/OpenLayers listeners. Marked replays bypass this.\n      __cribloOriginalAddEventListener.call(window, 'pointerdown', function (event) { capturePhysicalTouchPointer(event, 'down'); }, true);\n      __cribloOriginalAddEventListener.call(window, 'pointerup', function (event) { capturePhysicalTouchPointer(event, 'up'); }, true);\n      __cribloOriginalAddEventListener.call(document, 'pointerdown', function (event) { capturePhysicalTouchPointer(event, 'down'); }, true);\n      __cribloOriginalAddEventListener.call(document, 'pointerup', function (event) { capturePhysicalTouchPointer(event, 'up'); }, true);\n      __cribloOriginalAddEventListener.call(window, 'mousedown', suppressDuplicateCompatibilityMouseDown, true);\n      __cribloOriginalAddEventListener.call(document, 'mousedown', suppressDuplicateCompatibilityMouseDown, true);\n\n      // GeoReseaux is bundled,`,
);

replaceSwift(
  "remove listener-level defer branch",
  /          \/\/ Real iOS pointerdown arrives before touchstart and pointerup before\n          \/\/ touchend\. Hold only the application callback; CRI-BLO's raw native\n          \/\/ observers still receive the genuine trusted event immediately\.\n          if \(\(name === 'pointerdown' \|\| name === 'pointerup'\) && shouldDeferTrustedTouchPointer\(name, event\)\) \{\n            queueDeferredPointer\(name === 'pointerdown' \? 'down' : 'up', listener, this, event, target, options\);\n            return;\n          \}\n/,
  "",
);

replaceSwift(
  "touchstart replay after full propagation",
  /          if \(event\.isTrusted\) \{\n            \/\/ Microtask checkpoint runs after touchstart propagation and before\n            \/\/ WebKit's compatibility mouse default action, restoring Android's\n            \/\/ page-visible touchstart -> pointerdown -> mousedown order\.\n            runAfterCurrentEvent\(function \(\) \{ flushDeferredPointers\('down'\); \}\);\n          \}/,
  `          if (event.isTrusted) {\n            afterTouchPropagation('touchstart', function () { dispatchHeldAndroidPointer('down'); });\n          }`,
);
replaceSwift(
  "touchend replay after full propagation",
  /          if \(event && event\.isTrusted\) \{\n            \/\/ Same conversion on release: GeoReseaux finishes touchend first,\n            \/\/ then sees the genuine trusted pointerup, then mouseup\/click\/context\.\n            runAfterCurrentEvent\(function \(\) \{ flushDeferredPointers\('up'\); \}\);\n          \}/,
  `          if (event && event.isTrusted) {\n            afterTouchPropagation('touchend', function () { dispatchHeldAndroidPointer('up'); });\n          }`,
);

const marker = "globalThis.window = windowTarget;\nglobalThis.document = documentTarget;\nglobalThis.location = windowTarget.location;\nnew Function(match[1])();";
if (!test.includes(marker)) throw new Error("test production-mode marker not found");
test = test.replace(marker, "globalThis.window = windowTarget;\nglobalThis.document = documentTarget;\nglobalThis.location = windowTarget.location;\nwindowTarget.__cribloGeoReseauxAndroidCompat = true;\nnew Function(match[1])();");

// Pointer replay adds two trusted lifecycle-facade deliveries. Do not pin the\n// assertion to the obsolete pre-replay value of 3.
test = test.replace(
  'if (!diagnostics.includes("Lifecycle facade calls: 3")) throw new Error("lifecycle facade handlers were not exercised: " + diagnostics);',
  'const lifecycleFacadeCalls = Number((diagnostics.match(/Lifecycle facade calls: (\\d+)/) || [])[1] || 0);\nif (lifecycleFacadeCalls < 5) throw new Error("lifecycle facade handlers were not exercised: " + diagnostics);',
);

fs.writeFileSync(swiftPath, swift);
fs.writeFileSync(testPath, test);
console.log(`Restored ${intactBase} and applied full-propagation Android lifecycle ordering`);
