import fs from 'node:fs';

const swiftPath = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';
const testPath = 'scripts/test-ios-longpress-bridge.mjs';
const workflowPath = '.github/workflows/apply-georeseaux-openlayers-ios.yml';

function replaceOnce(text, label, from, to) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: source block not found`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: source block is not unique`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

let swift = fs.readFileSync(swiftPath, 'utf8');

swift = replaceOnce(
  swift,
  'trusted facade OpenLayers pointer shape',
  `              if (prop === 'isTrusted') return sourceIsTrusted;\n              if (prop === 'sourceCapabilities') return { firesTouchEvents: true };`,
  `              if (prop === 'isTrusted') return sourceIsTrusted;\n              if (prop === 'sourceCapabilities') return { firesTouchEvents: true };\n              // The raw event is synthetic, but page code should see the same\n              // touch-pointer semantic shape Chrome/Android exposes for a hold.\n              if (prop === 'pointerType') return 'touch';\n              if (prop === 'pointerId') return 1;\n              if (prop === 'isPrimary') return true;\n              if (prop === 'width' || prop === 'height') return 9;\n              if (prop === 'pressure') return 0;`,
);

swift = replaceOnce(
  swift,
  'OpenLayers diagnostics fields',
  `        directTrustedHandlerFires: 0,\n        directSourceTrusted: false,\n        directTarget: 'none'`,
  `        directTrustedHandlerFires: 0,\n        directSourceTrusted: false,\n        directTarget: 'none',\n        openLayersViewportDispatches: 0,\n        mapTouchStartsPrevented: 0,\n        openLayersViewportTarget: 'none'`,
);

swift = replaceOnce(
  swift,
  'OpenLayers viewport helpers',
  `\n\n      function viewportPoint(element, x, y) {`,
  `\n\n      // SIGReseaux is documented by Orange as an Angular/OpenLayers viewer.\n      // OpenLayers context-menu controls attach their DOM listener to\n      // map.getViewport(), i.e. the .ol-viewport element.  On iOS the browser\n      // does not synthesize Chrome/Android's long-press contextmenu, so target\n      // that viewport explicitly instead of replaying a fake mouse sequence.\n      function openLayersViewportFor(target, x, y) {\n        try {\n          var node = target;\n          for (var i = 0; node && i < 12; i++, node = node.parentElement) {\n            var cls = String(node.className && (node.className.baseVal || node.className) || '');\n            if (/(^|\\s)ol-viewport(\\s|$)/.test(cls)) return node;\n          }\n        } catch (_) {}\n        try {\n          var closest = target && target.closest && target.closest('.ol-viewport');\n          if (closest) return closest;\n        } catch (_) {}\n        try {\n          var viewports = document.querySelectorAll('.ol-viewport');\n          for (var v = 0; v < viewports.length; v++) {\n            var rect = viewports[v].getBoundingClientRect();\n            if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return viewports[v];\n          }\n        } catch (_) {}\n        return null;\n      }\n\n      function suppressIOSMapCallout(viewport, target) {\n        try {\n          var node = target;\n          for (var i = 0; node && i < 12; i++, node = node.parentElement) {\n            if (node.style) {\n              node.style.webkitTouchCallout = 'none';\n              node.style.webkitUserSelect = 'none';\n              node.style.userSelect = 'none';\n            }\n            if (node === viewport) break;\n          }\n          if (viewport && viewport.style) {\n            viewport.style.webkitTouchCallout = 'none';\n            viewport.style.webkitUserSelect = 'none';\n            viewport.style.userSelect = 'none';\n          }\n        } catch (_) {}\n      }\n\n      function dispatchOpenLayersViewportContextMenu(target, x, y, sourceEvent) {\n        var viewport = openLayersViewportFor(target, x, y);\n        if (!viewport) return false;\n        suppressIOSMapCallout(viewport, target);\n        var callsBefore = __cribloGeoDiag.wrappedContextCalls;\n        __cribloGeoDiag.openLayersViewportTarget = String((viewport.tagName || '') + '#' + (viewport.id || '') + '.' + (viewport.className && (viewport.className.baseVal || viewport.className) || '')).slice(0, 180);\n        __cribloGeoDiag.openLayersViewportDispatches++;\n        var dispatched = contextMenu(viewport, x, y, sourceEvent);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;\n        __cribloGeoDiag.directTrustedHandlerFires += Math.max(0, delta);\n        return dispatched;\n      }\n\n      function viewportPoint(element, x, y) {`,
);

swift = replaceOnce(
  swift,
  'prevent iOS native long press on OpenLayers touchstart',
  `          var target = event.target;\n          if (!mapLikeTarget(target)) return;\n          var touchStartNow = Date.now();`,
  `          var target = event.target;\n          if (!mapLikeTarget(target)) return;\n\n          // WebKit can take ownership of a long press before page code sees a\n          // contextmenu.  Its own bug tracker recommends an active touchstart\n          // preventDefault() for canvas-style interfaces.  Restrict this to the\n          // OpenLayers viewport so normal links/forms in Orange remain native.\n          var openLayersViewport = openLayersViewportFor(target, touch.clientX, touch.clientY);\n          if (openLayersViewport) {\n            suppressIOSMapCallout(openLayersViewport, target);\n            try {\n              if (event.cancelable) {\n                event.preventDefault();\n                if (event.defaultPrevented) __cribloGeoDiag.mapTouchStartsPrevented++;\n              }\n            } catch (_) {}\n          }\n\n          var touchStartNow = Date.now();`,
);

swift = replaceOnce(
  swift,
  'make OpenLayers touchstart listener active',
  `        } catch (_) {}\n      }, { capture: true, passive: true });\n\n      document.addEventListener('touchmove', function (event) {`,
  `        } catch (_) {}\n      }, { capture: true, passive: false });\n\n      document.addEventListener('touchmove', function (event) {`,
);

swift = replaceOnce(
  swift,
  'dispatch directly to OpenLayers viewport at hold time',
  `        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);\n        lastRealTouchLongPressAt = Date.now();\n\n        __cribloGeoDiag.lastResult = 'trusted-webkit-tail-armed-waiting-release';\n        return true;`,
  `        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);\n        lastRealTouchLongPressAt = Date.now();\n\n        // Orange documents SIGReseaux as Angular + OpenLayers.  The common\n        // OpenLayers context-menu control listens on map.getViewport() and then\n        // derives map pixel/coordinate directly from event.clientX/clientY.\n        // Chrome Android creates this event from a hold; iOS does not.  Emit the\n        // one missing event at recognition time and stop here: no fake release\n        // tail, no duplicate pointer/mouse events, and no dependency on a click.\n        if (openLayersViewportFor(request.target, request.x, request.y)) {\n          var before = visiblePopupState();\n          var dispatched = dispatchOpenLayersViewportContextMenu(\n            request.target, request.x, request.y, request.sourceEvent\n          );\n          pendingNativeLongPress = null;\n          __cribloGeoDiag.lastResult = dispatched\n            ? 'openlayers-viewport-contextmenu-at-hold'\n            : 'openlayers-viewport-contextmenu-error';\n          setTimeout(function () {\n            if (popupChanged(before)) __cribloGeoDiag.lastResult = 'openlayers-viewport-popup';\n          }, 220);\n          return dispatched;\n        }\n\n        // Non-OpenLayers pages keep the older generic release-tail fallback.\n        __cribloGeoDiag.lastResult = 'trusted-webkit-tail-armed-waiting-release';\n        return true;`,
);

swift = replaceOnce(
  swift,
  'OpenLayers diagnostics text',
  `          'Synthetic context prevented: ' + String(!!__cribloGeoDiag.syntheticContextPrevented),\n          'Synthetic press/release: pd=' + __cribloGeoDiag.syntheticPointerDowns`,
  `          'Synthetic context prevented: ' + String(!!__cribloGeoDiag.syntheticContextPrevented),\n          'OpenLayers viewport dispatches: ' + __cribloGeoDiag.openLayersViewportDispatches,\n          'OpenLayers viewport target: ' + __cribloGeoDiag.openLayersViewportTarget,\n          'Map touchstart prevented: ' + __cribloGeoDiag.mapTouchStartsPrevented,\n          'Synthetic press/release: pd=' + __cribloGeoDiag.syntheticPointerDowns`,
);

fs.writeFileSync(swiftPath, swift);

let test = fs.readFileSync(testPath, 'utf8');

test = replaceOnce(
  test,
  'test OpenLayers viewport identity',
  `documentTarget.className = \"\";\ndocumentTarget.getBoundingClientRect = () => ({\n  left: 0,\n  top: 0,\n  width: 200,\n  height: 100,\n});\ndocumentTarget.closest = () => null;`,
  `documentTarget.className = \"ol-viewport\";\ndocumentTarget.style = {};\ndocumentTarget.getBoundingClientRect = () => ({\n  left: 0,\n  top: 0,\n  right: 200,\n  bottom: 100,\n  width: 200,\n  height: 100,\n});\ndocumentTarget.closest = (selector) => selector === \".ol-viewport\" ? documentTarget : null;`,
);

test = replaceOnce(
  test,
  'test querySelectorAll viewport',
  `documentTarget.querySelectorAll = () => [];`,
  `documentTarget.querySelectorAll = (selector) => selector === \".ol-viewport\" ? [documentTarget] : [];`,
);

test = replaceOnce(
  test,
  'return touch event for prevention assertion',
  `  canvas.dispatchEvent(event);\n}\n\nfunction wait(ms = 15) {`,
  `  canvas.dispatchEvent(event);\n  return event;\n}\n\nfunction wait(ms = 15) {`,
);

test = replaceOnce(
  test,
  'return touchstart from iOS press helper',
  `function iosPressStart(x, y) {\n  realPointerEvent(\"pointerdown\", x, y, 1);\n  realTouchEvent(\"touchstart\", x, y);\n}`,
  `function iosPressStart(x, y) {\n  realPointerEvent(\"pointerdown\", x, y, 1);\n  return realTouchEvent(\"touchstart\", x, y);\n}`,
);

const testStart = test.indexOf('// Normal real-iPhone path.');
if (testStart < 0) throw new Error('test main block marker not found');

test = test.slice(0, testStart) + `// Research-backed OpenLayers/iOS path. Orange documents SIGReseaux as an\n// Angular/OpenLayers viewer. OpenLayers context-menu controls listen directly\n// on .ol-viewport; Chrome Android synthesizes contextmenu for a long hold while\n// iOS does not. CRI-BLO must prevent the iOS native callout at touchstart and\n// emit exactly one contextmenu on the OpenLayers viewport at native hold time.\nconst firstTouchStart = iosPressStart(82, 31);\nif (!firstTouchStart.defaultPrevented) {\n  throw new Error(\"OpenLayers touchstart was not actively prevented on iOS\");\n}\nawait wait(1);\n\nif (!windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5)) {\n  throw new Error(\"native long-press bridge did not accept the OpenLayers hold\");\n}\nawait wait(20);\n\nif (!received) {\n  throw new Error(\`OpenLayers viewport contextmenu did not fire at hold time: \${pageOrder.join(\",\")}\`);\n}\nconst holdFlags = received && [\n  received.trusted,\n  received.prevented,\n  received.target,\n  received.pointerEvent,\n  received.touchSource,\n];\nif (holdFlags.some((value) => value !== true)) {\n  throw new Error(\`OpenLayers trusted facade failed: \${JSON.stringify(received)}\`);\n}\nif (received.clientX !== 82 || received.clientY !== 31) {\n  throw new Error(\`OpenLayers hold coordinates changed: \${JSON.stringify(received)}\`);\n}\nif (received.button !== 0 || received.buttons !== 0 || received.pointerType !== \"touch\") {\n  throw new Error(\`OpenLayers contextmenu shape is wrong: \${JSON.stringify(received)}\`);\n}\nif (pageOrder.join(\",\") !== \"pointerdown,touchstart,contextmenu\") {\n  throw new Error(\`contextmenu was not emitted directly at hold time: \${pageOrder.join(\",\")}\`);\n}\n\n// Even if WKWebView later emits the release/mouse compatibility tail, the\n// OpenLayers path is already complete and must never emit a second menu event.\niosReleaseBeforeMouseTail(82, 31);\niosTrustedMouseTail(82, 31, 7, 9);\nawait wait(30);\nif (pageOrder.filter((name) => name === \"contextmenu\").length !== 1) {\n  throw new Error(\`duplicate contextmenu after WebKit release tail: \${pageOrder.join(\",\")}\`);\n}\nconst fullExpected =\n  \"pointerdown,touchstart,contextmenu,pointerup,touchend,mousedown,mouseup,click\";\nif (pageOrder.join(\",\") !== fullExpected) {\n  throw new Error(\`unexpected OpenLayers iPhone order: \${pageOrder.join(\",\")}\`);\n}\n\n// Delayed WKWebView path: native recognizer can begin just before DOM\n// touchstart. Once the trusted touch arrives, it must still prevent iOS's\n// native callout and dispatch to .ol-viewport without waiting for touchend.\nreceived = null;\npageOrder = [];\nwindowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);\nawait wait(5);\nconst delayedTouchStart = iosPressStart(73, 27);\nif (!delayedTouchStart.defaultPrevented) {\n  throw new Error(\"delayed OpenLayers touchstart was not prevented\");\n}\nawait wait(20);\n\nif (!received || received.clientX !== 73 || received.clientY !== 27) {\n  throw new Error(\`delayed OpenLayers hold failed: \${JSON.stringify(received)}\`);\n}\nif (pageOrder.join(\",\") !== \"pointerdown,touchstart,contextmenu\") {\n  throw new Error(\`delayed OpenLayers order is wrong: \${pageOrder.join(\",\")}\`);\n}\n\niosReleaseBeforeMouseTail(73, 27);\niosTrustedMouseTail(73, 27, 1, 1);\nawait wait(20);\nif (pageOrder.filter((name) => name === \"contextmenu\").length !== 1) {\n  throw new Error(\`delayed path duplicated contextmenu: \${pageOrder.join(\",\")}\`);\n}\n\nconst diagnostics = windowTarget.__cribloGeoDiagnosticsText();\nif (!diagnostics.includes(\"Native waits for touchstart: 1\")) {\n  throw new Error(\`delayed native wait was not recorded: \${diagnostics}\`);\n}\nif (!diagnostics.includes(\"Native/touch coordinate delta: 27,23\")) {\n  throw new Error(\`touch coordinate correction was not recorded: \${diagnostics}\`);\n}\nif (!diagnostics.includes(\"OpenLayers viewport dispatches: 2\")) {\n  throw new Error(\`OpenLayers viewport dispatch count is wrong: \${diagnostics}\`);\n}\nif (!diagnostics.includes(\"OpenLayers viewport target: CANVAS#.ol-viewport\")) {\n  throw new Error(\`OpenLayers viewport target was not recorded: \${diagnostics}\`);\n}\nif (!diagnostics.includes(\"Map touchstart prevented: 2\")) {\n  throw new Error(\`active map touch prevention was not recorded: \${diagnostics}\`);\n}\nif (!diagnostics.includes(\"Synthetic press/release: pd=0 md=0 pu=0 mu=0 click=0\")) {\n  throw new Error(\`OpenLayers path fabricated low-level events: \${diagnostics}\`);\n}\nif (!diagnostics.includes(\"Release completions: 0\")) {\n  throw new Error(\`OpenLayers path incorrectly waited for release: \${diagnostics}\`);\n}\nif (!diagnostics.includes(\"contextmenu*\")) {\n  throw new Error(\`trusted-source contextmenu was not traced: \${diagnostics}\`);\n}\n\n// Listener removal must still preserve the page's original listener identity.\ncanvas.removeEventListener(\"contextmenu\", pageContextHandler);\nreceived = null;\npageOrder = [];\niosPressStart(60, 20);\nawait wait(1);\nwindowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);\nawait wait(20);\nif (received !== null) {\n  throw new Error(\"wrapped context listener was not removed by its original identity\");\n}\n\nconsole.log(\"iOS GeoReseaux OpenLayers viewport long-press bridge test passed\");\n`;

fs.writeFileSync(testPath, test);

// One-shot patch helper: remove both the helper and workflow in the generated
// source commit so the working branch remains clean after this action runs.
try { fs.unlinkSync(new URL(import.meta.url)); } catch (_) {}
try { fs.rmSync(workflowPath, { force: true }); } catch (_) {}

console.log('Applied researched OpenLayers iOS long-press fix and regression test.');
