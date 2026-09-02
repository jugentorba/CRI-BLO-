import fs from 'node:fs';

const swiftPath = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';
const testPath = 'scripts/test-ios-longpress-bridge.mjs';

function replaceOnce(text, label, from, to) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: source block not found`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: source block not unique`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

let swift = fs.readFileSync(swiftPath, 'utf8');

swift = replaceOnce(
  swift,
  'diagnostic counters',
  `        nativeRecognizerFires: 0,\n        nativeWaitsForTouchStart: 0,`,
  `        nativeRecognizerFires: 0,\n        nativeWaitsForTouchStart: 0,\n        jsHoldArms: 0,\n        nativeLateSuppressed: 0,`,
);

swift = replaceOnce(
  swift,
  'press-start pointer tolerance',
  `        if (!(lastRealPointerDownTarget === target && lastRealPointerDownAt >= touchStartedAt)) {`,
  `        var pointerNearTouchStart = lastRealPointerDownTarget === target\n          && lastRealPointerDownAt > 0\n          && Math.abs(lastRealPointerDownAt - touchStartedAt) < 160;\n        if (!pointerNearTouchStart) {`,
);

const oldDispatchStart = `      function dispatchNativeLongPressRequest(request) {\n        if (!request || pendingNativeLongPress !== request) return false;`;
const oldDispatchEnd = `        return dispatched;\n      }\n\n      function fallbackNativeLongPressRequest(request) {`;
const startIndex = swift.indexOf(oldDispatchStart);
const endIndex = swift.indexOf(oldDispatchEnd, startIndex);
if (startIndex < 0 || endIndex < 0) throw new Error('dispatchNativeLongPressRequest block not found');
const dispatchReplacement = `      function dispatchNativeLongPressRequest(request) {\n        if (!request || pendingNativeLongPress !== request) return false;\n\n        var estimatedX = window.innerWidth * request.rx;\n        var estimatedY = window.innerHeight * request.ry;\n        var touchAge = lastRealTouchStartAt ? Date.now() - lastRealTouchStartAt : Number.POSITIVE_INFINITY;\n        var hasFreshTouch = !!(realTouchTarget && touchAge >= 0 && touchAge < 1500);\n        if (!hasFreshTouch) return false;\n\n        request.target = realTouchTarget;\n        request.x = realTouchX;\n        request.y = realTouchY;\n        request.pointerId = realTouchIdentifier;\n        request.touchStartedAt = lastRealTouchStartAt;\n        request.sourceEvent = window.__cribloLastTrustedTouchStart || null;\n        request.armed = true;\n\n        // The native recognizer can reach WKWebView JavaScript late. Its only\n        // job here is to ARM the hold while the trusted touch is alive. The\n        // actual contextmenu is deliberately deferred until the genuine iOS\n        // release/click tail, which is the measured Android ordering.\n        ensureAndroidPressStart(request.target, request.x, request.y, request.touchStartedAt);\n        clearRealTouchTimer();\n        realTouchFired = true;\n        lastRealTouchLongPressAt = Date.now();\n        __cribloGeoDiag.directSourceTrusted = !!(request.sourceEvent && request.sourceEvent.isTrusted);\n        __cribloGeoDiag.contextAfterTouchMs = -1;\n        __cribloGeoDiag.coordinateDelta = String(Math.round(estimatedX - request.x)) + ',' + String(Math.round(estimatedY - request.y));\n        __cribloGeoDiag.directTarget = String((request.target.tagName || '') + '#' + (request.target.id || '') + '.' + (request.target.className && (request.target.className.baseVal || request.target.className) || '')).slice(0, 180);\n        __cribloGeoDiag.lastTarget = __cribloGeoDiag.directTarget;\n        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);\n        __cribloGeoDiag.lastResult = 'native-hold-armed-waiting-release';\n        return true;\n      }\n\n      function fallbackNativeLongPressRequest(request) {`;
swift = swift.slice(0, startIndex) + dispatchReplacement + swift.slice(endIndex + oldDispatchEnd.length);

const fireStart = `      function fireRealTouchLongPress() {`;
const fireEnd = `      document.addEventListener('pointerdown', function (event) {`;
const fireStartIndex = swift.indexOf(fireStart);
const fireEndIndex = swift.indexOf(fireEnd, fireStartIndex);
if (fireStartIndex < 0 || fireEndIndex < 0) throw new Error('fireRealTouchLongPress block not found');
const fireReplacement = `      function fireRealTouchLongPress() {\n        realTouchTimer = null;\n        if (!realTouchTarget || realTouchFired) return;\n\n        var sourceEvent = window.__cribloLastTrustedTouchStart || null;\n        var request = {\n          id: ++nativeLongPressSequence,\n          rx: window.innerWidth ? clamp01(realTouchX / window.innerWidth) : 0,\n          ry: window.innerHeight ? clamp01(realTouchY / window.innerHeight) : 0,\n          requestedAt: Date.now(),\n          target: realTouchTarget,\n          x: realTouchX,\n          y: realTouchY,\n          pointerId: realTouchIdentifier,\n          touchStartedAt: lastRealTouchStartAt,\n          sourceEvent: sourceEvent,\n          armed: true,\n          origin: 'trusted-js-touch-timer'\n        };\n\n        // This timer runs inside the page from the genuine trusted touchstart,\n        // so it is not delayed by native evaluateJavaScript IPC. At 600 ms we\n        // ARM the long press only. touchend + the real WebKit click complete it\n        // and contextmenu is emitted last, exactly like the Android trace.\n        pendingNativeLongPress = request;\n        realTouchFired = true;\n        lastRealTouchLongPressAt = Date.now();\n        ensureAndroidPressStart(request.target, request.x, request.y, request.touchStartedAt);\n        __cribloGeoDiag.jsHoldArms++;\n        __cribloGeoDiag.directSourceTrusted = !!(sourceEvent && sourceEvent.isTrusted);\n        __cribloGeoDiag.coordinateDelta = 'trusted-touch';\n        __cribloGeoDiag.directTarget = String((request.target.tagName || '') + '#' + (request.target.id || '') + '.' + (request.target.className && (request.target.className.baseVal || request.target.className) || '')).slice(0, 180);\n        __cribloGeoDiag.lastTarget = __cribloGeoDiag.directTarget;\n        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);\n        __cribloGeoDiag.lastResult = 'js-hold-armed-waiting-release';\n\n        clearSelection();\n        var styleNode = request.target;\n        for (var si = 0; styleNode && si < 7; si++, styleNode = styleNode.parentElement) {\n          try {\n            styleNode.style.webkitUserSelect = 'none';\n            styleNode.style.webkitTouchCallout = 'none';\n            styleNode.style.userSelect = 'none';\n          } catch (_) {}\n        }\n      }\n\n      document.addEventListener('pointerdown', function (event) {`;
swift = swift.slice(0, fireStartIndex) + fireReplacement + swift.slice(fireEndIndex + fireEnd.length);

swift = replaceOnce(
  swift,
  'touchstart timer arm',
  `          realTouchFired = false;\n          realTouchTimer = null;\n\n          // WKWebView can hold DOM touch delivery until the simultaneous native`,
  `          realTouchFired = false;\n          realTouchTimer = null;\n          if (event.isTrusted) {\n            realTouchTimer = setTimeout(function () {\n              fireRealTouchLongPress();\n            }, 600);\n          }\n\n          // WKWebView can hold DOM touch delivery until the simultaneous native`,
);

swift = replaceOnce(
  swift,
  'touch movement threshold',
  `          if ((dx * dx + dy * dy) > 144) clearRealTouchTimer();`,
  `          if ((dx * dx + dy * dy) > 784) clearRealTouchTimer();`,
);

swift = replaceOnce(
  swift,
  'native late suppression',
  `      window.__cribloNativeWrappedContextLongPress = function (rx, ry) {\n        try {\n          __cribloGeoDiag.nativeRecognizerFires++;\n          var now = Date.now();`,
  `      window.__cribloNativeWrappedContextLongPress = function (rx, ry) {\n        try {\n          __cribloGeoDiag.nativeRecognizerFires++;\n          var now = Date.now();\n          // On real iPhone WKWebView the native callback can be delivered only\n          // after touchend or even around the compatibility click. Never let a\n          // late native callback overwrite the request already armed by the\n          // trusted in-page 600 ms timer.\n          if ((pendingNativeLongPress && pendingNativeLongPress.armed)\n              || (lastRealTouchLongPressAt && now - lastRealTouchLongPressAt < 1800)) {\n            __cribloGeoDiag.nativeLateSuppressed++;\n            __cribloGeoDiag.lastResult = 'native-late-suppressed-js-hold';\n            return true;\n          }`,
);

swift = replaceOnce(
  swift,
  'context timing at completion',
  `        __cribloGeoDiag.releaseCompletions++;\n        __cribloGeoDiag.lastResult = dispatched`,
  `        __cribloGeoDiag.releaseCompletions++;\n        __cribloGeoDiag.contextAfterTouchMs = request.touchStartedAt\n          ? Math.max(0, Date.now() - request.touchStartedAt)\n          : -1;\n        __cribloGeoDiag.lastResult = dispatched`,
);

swift = replaceOnce(
  swift,
  'diagnostic output',
  `          'Native waits for touchstart: ' + __cribloGeoDiag.nativeWaitsForTouchStart,\n          'Touch -> native: ' + __cribloGeoDiag.touchToNativeMs + ' ms',`,
  `          'Native waits for touchstart: ' + __cribloGeoDiag.nativeWaitsForTouchStart,\n          'JS trusted hold arms: ' + __cribloGeoDiag.jsHoldArms,\n          'Late native bridge suppressed: ' + __cribloGeoDiag.nativeLateSuppressed,\n          'Touch -> native: ' + __cribloGeoDiag.touchToNativeMs + ' ms',`,
);

swift = replaceOnce(
  swift,
  'native handler comment',
  `        // The native recognizer only arms the long press. JavaScript waits for\n        // the genuine WKWebView release/mouse/click tail, then emits exactly one\n        // contextmenu last, matching the measured Android event order.`,
  `        // Native provides immediate haptic feedback and a backup arm signal.\n        // The page-side trusted touchstart timer is the primary 600 ms arm path;\n        // this avoids WKWebView evaluateJavaScript delivery latency.`,
);

fs.writeFileSync(swiftPath, swift);

let test = fs.readFileSync(testPath, 'utf8');
const marker = '// Working Android behavior: contextmenu happens around the hold threshold while';
const markerIndex = test.indexOf(marker);
const logLine = 'console.log("iOS GeoReseaux Android-timed hold bridge test passed");';
const logIndex = test.indexOf(logLine, markerIndex);
if (markerIndex < 0 || logIndex < 0) throw new Error('test scenario block not found');
const newScenario = `// The trusted in-page touch timer must ARM at 600 ms while the finger is down,\n// but contextmenu must wait for the real release/click tail and be LAST.\npointer("pointerdown", 82, 31, 1);\ntouch("touchstart", 82, 31);\nawait wait(650);\nif (received !== null) {\n  throw new Error("contextmenu fired before release: " + pageOrder.join(","));\n}\nif (!pageOrder.includes("mousedown")) {\n  throw new Error("Android press-start state was not prepared: " + pageOrder.join(","));\n}\n\npointer("pointerup", 82, 31, 0);\ntouch("touchend", 82, 31);\n// Simulate the real-device late native callback observed in the user's trace.\nif (!windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5)) {\n  throw new Error("late native hold was not safely suppressed");\n}\nawait wait(5);\nmouse("mousedown", 82, 31, 1);\nmouse("mouseup", 82, 31, 0);\nmouse("click", 82, 31, 0);\nawait wait(30);\nif (!received) {\n  throw new Error("contextmenu did not complete after trusted click: " + pageOrder.join(","));\n}\nif (![received.trusted, received.prevented, received.target, received.pointerEvent, received.touchSource].every(Boolean)) {\n  throw new Error("trusted-tail facade is wrong: " + JSON.stringify(received));\n}\nif (received.clientX !== 82 || received.clientY !== 31) {\n  throw new Error("trusted-tail coordinates changed: " + JSON.stringify(received));\n}\nif (received.button !== 0 || received.buttons !== 0 || received.pointerType !== "touch") {\n  throw new Error("trusted-tail context shape is wrong: " + JSON.stringify(received));\n}\nif (pageOrder[pageOrder.length - 1] !== "contextmenu") {\n  throw new Error("contextmenu is not last: " + pageOrder.join(","));\n}\nif (pageOrder.filter((name) => name === "contextmenu").length !== 1) {\n  throw new Error("contextmenu duplicated: " + pageOrder.join(","));\n}\n\n// A short tap must never arm or create contextmenu.\nreceived = null;\npageOrder = [];\npointer("pointerdown", 70, 26, 1);\ntouch("touchstart", 70, 26);\nawait wait(80);\npointer("pointerup", 70, 26, 0);\ntouch("touchend", 70, 26);\nmouse("mousedown", 70, 26, 1);\nmouse("mouseup", 70, 26, 0);\nmouse("click", 70, 26, 0);\nawait wait(620);\nif (received !== null || pageOrder.includes("contextmenu")) {\n  throw new Error("short tap incorrectly became a hold: " + pageOrder.join(","));\n}\n\nconst diagnostics = windowTarget.__cribloGeoDiagnosticsText();\nif (!diagnostics.includes("JS trusted hold arms: 1")) {\n  throw new Error("trusted JS hold was not armed: " + diagnostics);\n}\nif (!diagnostics.includes("Late native bridge suppressed: 1")) {\n  throw new Error("late native callback was not suppressed: " + diagnostics);\n}\nif (!diagnostics.includes("Release completions: 1")) {\n  throw new Error("trusted release/click tail did not complete: " + diagnostics);\n}\nif (!diagnostics.includes("pu=0 mu=0 click=0")) {\n  throw new Error("bridge fabricated the release/click tail: " + diagnostics);\n}\nif (!diagnostics.includes("contextmenu*")) {\n  throw new Error("trusted-source contextmenu trace missing: " + diagnostics);\n}\nif (!diagnostics.includes("Trusted touch source: true")) {\n  throw new Error("trusted touch source was lost: " + diagnostics);\n}\n\n// Listener removal by original identity must still work on the timer path.\ncanvas.removeEventListener("contextmenu", pageContextHandler);\nreceived = null;\npageOrder = [];\npointer("pointerdown", 60, 20, 1);\ntouch("touchstart", 60, 20);\nawait wait(650);\npointer("pointerup", 60, 20, 0);\ntouch("touchend", 60, 20);\nmouse("mousedown", 60, 20, 1);\nmouse("mouseup", 60, 20, 0);\nmouse("click", 60, 20, 0);\nawait wait(30);\nif (received !== null) {\n  throw new Error("wrapped listener removal identity is broken");\n}\n\nconsole.log("iOS GeoReseaux trusted-touch arm/release bridge test passed");`;
test = test.slice(0, markerIndex) + newScenario + test.slice(logIndex + logLine.length);
fs.writeFileSync(testPath, test);
