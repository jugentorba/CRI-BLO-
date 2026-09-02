import fs from 'node:fs';

const swiftPath = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';
const testPath = 'scripts/test-ios-longpress-bridge.mjs';

function replaceOnce(text, label, from, to) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`${label}: source block not found`);
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(`${label}: source block not unique`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

let swift = fs.readFileSync(swiftPath, 'utf8');

swift = replaceOnce(
  swift,
  'deferred trusted pointer infrastructure',
  `      var __cribloOriginalAddEventListener = EventTarget.prototype.addEventListener;\n      var __cribloOriginalRemoveEventListener = EventTarget.prototype.removeEventListener;`,
  `      var __cribloOriginalAddEventListener = EventTarget.prototype.addEventListener;\n      var __cribloOriginalRemoveEventListener = EventTarget.prototype.removeEventListener;\n\n      // WKWebView exposes a different touch/pointer ordering than the working\n      // Android WebView. Keep WebKit's genuine events for internal timing and\n      // coordinates, but defer only PAGE listener delivery of trusted touch\n      // pointerdown/pointerup until the matching touch event has propagated.\n      // This makes application state see the measured Android order without\n      // fabricating a second pointer lifecycle.\n      var __cribloDeferredPointerDown = [];\n      var __cribloDeferredPointerUp = [];\n      var __cribloDeferredPointerDownTimer = null;\n      var __cribloDeferredPointerUpTimer = null;\n\n      function runAfterCurrentEvent(callback) {\n        try {\n          if (typeof queueMicrotask === 'function') { queueMicrotask(callback); return; }\n          if (typeof Promise === 'function') { Promise.resolve().then(callback); return; }\n        } catch (_) {}\n        setTimeout(callback, 0);\n      }\n\n      function deferredTrustedPointerFacade(event, currentTarget, options) {\n        var path = [];\n        try { path = event && event.composedPath ? event.composedPath() : []; } catch (_) {}\n        if (!path || !path.length) {\n          var node = event && event.target;\n          while (node) { path.push(node); node = node.parentNode; }\n          if (path.indexOf(document) < 0) path.push(document);\n          path.push(window);\n        }\n        var capture = captureOption(options);\n        try {\n          return new Proxy(event, {\n            get: function (raw, prop, receiver) {\n              if (prop === 'currentTarget') return currentTarget;\n              if (prop === 'eventPhase') return capture ? 1 : (currentTarget === raw.target ? 2 : 3);\n              if (prop === 'isTrusted') return true;\n              if (prop === 'sourceCapabilities') return { firesTouchEvents: true };\n              if (prop === 'composedPath') return function () { return path.slice(); };\n              if (prop === 'originalEvent' || prop === 'nativeEvent' || prop === 'srcEvent') return receiver;\n              var value;\n              try { value = Reflect.get(raw, prop, raw); } catch (_) { value = raw[prop]; }\n              return typeof value === 'function' ? value.bind(raw) : value;\n            }\n          });\n        } catch (_) { return event; }\n      }\n\n      function callDeferredPointerEntry(entry) {\n        if (!entry || entry.delivered) return;\n        entry.delivered = true;\n        var presented = deferredTrustedPointerFacade(entry.event, entry.currentTarget, entry.options);\n        try {\n          if (typeof entry.listener === 'function') entry.listener.call(entry.thisArg, presented);\n          else if (entry.listener && typeof entry.listener.handleEvent === 'function') entry.listener.handleEvent(presented);\n        } catch (_) {}\n      }\n\n      function flushDeferredPointers(kind) {\n        var isDown = kind === 'down';\n        var queue = isDown ? __cribloDeferredPointerDown : __cribloDeferredPointerUp;\n        var timer = isDown ? __cribloDeferredPointerDownTimer : __cribloDeferredPointerUpTimer;\n        if (timer) { try { clearTimeout(timer); } catch (_) {} }\n        if (isDown) __cribloDeferredPointerDownTimer = null; else __cribloDeferredPointerUpTimer = null;\n        var entries = queue.splice(0, queue.length);\n        for (var i = 0; i < entries.length; i++) callDeferredPointerEntry(entries[i]);\n      }\n\n      function queueDeferredPointer(kind, listener, thisArg, event, currentTarget, options) {\n        var isDown = kind === 'down';\n        var queue = isDown ? __cribloDeferredPointerDown : __cribloDeferredPointerUp;\n        queue.push({ listener: listener, thisArg: thisArg, event: event, currentTarget: currentTarget, options: options, delivered: false });\n        var timerName = isDown ? '__cribloDeferredPointerDownTimer' : '__cribloDeferredPointerUpTimer';\n        var existing = isDown ? __cribloDeferredPointerDownTimer : __cribloDeferredPointerUpTimer;\n        if (!existing) {\n          var timer = setTimeout(function () { flushDeferredPointers(kind); }, 55);\n          if (timerName === '__cribloDeferredPointerDownTimer') __cribloDeferredPointerDownTimer = timer;\n          else __cribloDeferredPointerUpTimer = timer;\n        }\n      }\n\n      function shouldDeferTrustedTouchPointer(name, event) {\n        try {\n          if (!window.__cribloGeoReseauxAndroidCompat) return false;\n          if (!event || !event.isTrusted || String(event.pointerType || '') !== 'touch') return false;\n          if (!mapLikeTarget(event.target)) return false;\n          if (name === 'pointerdown') return true;\n          if (name === 'pointerup') return lastRealTouchStartAt > 0;\n        } catch (_) {}\n        return false;\n      }`,
);

swift = replaceOnce(
  swift,
  'defer page pointer listeners',
  `        var wrapper = function (event) {\n          var presented = syntheticContextFacade(event);\n          if (presented !== event) {\n            if (String(event.type || '').toLowerCase() === 'contextmenu') __cribloGeoDiag.wrappedContextCalls++;\n            else __cribloGeoDiag.wrappedLifecycleCalls++;\n          }\n          if (typeof listener === 'function') return listener.call(this, presented);\n          if (listener && typeof listener.handleEvent === 'function') return listener.handleEvent(presented);\n        };`,
  `        var wrapper = function (event) {\n          var name = String(event && event.type || '').toLowerCase();\n          // Real iOS pointerdown arrives before touchstart and pointerup before\n          // touchend. Hold only the application callback; CRI-BLO's raw native\n          // observers still receive the genuine trusted event immediately.\n          if ((name === 'pointerdown' || name === 'pointerup') && shouldDeferTrustedTouchPointer(name, event)) {\n            queueDeferredPointer(name === 'pointerdown' ? 'down' : 'up', listener, this, event, target, options);\n            return;\n          }\n          var presented = syntheticContextFacade(event);\n          if (presented !== event) {\n            if (name === 'contextmenu') __cribloGeoDiag.wrappedContextCalls++;\n            else __cribloGeoDiag.wrappedLifecycleCalls++;\n          }\n          if (typeof listener === 'function') return listener.call(this, presented);\n          if (listener && typeof listener.handleEvent === 'function') return listener.handleEvent(presented);\n        };`,
);

swift = replaceOnce(
  swift,
  'flush down after touchstart propagation',
  `          var touchStartNow = Date.now();\n          traceAndroidEvent('touchstart', !!event.isTrusted);\n\n          clearRealTouchTimer();`,
  `          var touchStartNow = Date.now();\n          traceAndroidEvent('touchstart', !!event.isTrusted);\n          if (event.isTrusted) {\n            // Microtask checkpoint runs after touchstart propagation and before\n            // WebKit's compatibility mouse default action, restoring Android's\n            // page-visible touchstart -> pointerdown -> mousedown order.\n            runAfterCurrentEvent(function () { flushDeferredPointers('down'); });\n          }\n\n          clearRealTouchTimer();`,
);

swift = replaceOnce(
  swift,
  'flush up after touchend propagation',
  `        try {\n          traceAndroidEvent('touchend', !!(event && event.isTrusted));\n          var request = pendingNativeLongPress;`,
  `        try {\n          traceAndroidEvent('touchend', !!(event && event.isTrusted));\n          if (event && event.isTrusted) {\n            // Same conversion on release: GeoReseaux finishes touchend first,\n            // then sees the genuine trusted pointerup, then mouseup/click/context.\n            runAfterCurrentEvent(function () { flushDeferredPointers('up'); });\n          }\n          var request = pendingNativeLongPress;`,
);

fs.writeFileSync(swiftPath, swift);

let test = fs.readFileSync(testPath, 'utf8');

test = replaceOnce(
  test,
  'press expected measured Android order',
  `pointer("pointerdown", 82, 31, 1);\ntouch("touchstart", 82, 31);\nawait wait(25);\nif (order.join(",") !== "pointerdown,touchstart,mousedown") throw new Error("Android mousedown was not prepared near touchstart: " + order.join(","));`,
  `pointer("pointerdown", 82, 31, 1);\nif (order.length !== 0) throw new Error("iOS pointerdown leaked to page before touchstart: " + order.join(","));\ntouch("touchstart", 82, 31);\nawait Promise.resolve();\nawait wait(25);\nif (order.join(",") !== "touchstart,pointerdown,mousedown") throw new Error("measured Android press order was not presented: " + order.join(","));`,
);

test = replaceOnce(
  test,
  'release expected measured Android order',
  `pointer("pointerup", 82, 31, 0);\ntouch("touchend", 82, 31);\n// Simulate the delayed native callback observed on the real iPhone. It must not\n// replace the already armed trusted-JS request.\nwindowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);\nawait wait(35);\nconst expected = "pointerdown,touchstart,mousedown,pointerup,touchend,mouseup,click,contextmenu";`,
  `pointer("pointerup", 82, 31, 0);\nif (order.join(",") !== "touchstart,pointerdown,mousedown") throw new Error("iOS pointerup leaked to page before touchend: " + order.join(","));\ntouch("touchend", 82, 31);\n// Simulate the delayed native callback observed on the real iPhone. It must not\n// replace the already armed trusted-JS request.\nwindowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);\nawait Promise.resolve();\nawait wait(35);\nconst expected = "touchstart,pointerdown,mousedown,touchend,pointerup,mouseup,click,contextmenu";`,
);

test = replaceOnce(
  test,
  'test description Android conversion',
  `// Real iPhone long-hold sequence from the user's diagnostic: trusted pointerdown\n// arrives before trusted touchstart, and WKWebView supplies no mouseup/click tail.`,
  `// Physical iPhone input arrives pointerdown before touchstart. The bridge must\n// present the exact measured WORKING Android order to GeoReseaux listeners:\n// touchstart -> pointerdown -> mousedown ... touchend -> pointerup -> mouseup -> click -> contextmenu.`,
);

const marker = `// A short tap must never become a hold. Its synthetic Android mousedown is`;
if (!test.includes(marker)) throw new Error('short-tap marker not found');
test = test.replace(marker, `// A trusted touch pointer event with no matching TouchEvent must not be lost.\n// The 55ms escape hatch preserves normal Pointer Events behavior off the map path.\norder.length = 0;\nlifecycle.length = 0;\ncontext = null;\npointer("pointerdown", 66, 22, 1);\nif (order.length !== 0) throw new Error("unpaired pointerdown was not initially deferred");\nawait wait(75);\nif (order.join(",") !== "pointerdown") throw new Error("unpaired pointerdown fallback was lost/duplicated: " + order.join(","));\n\n${marker}`);

fs.writeFileSync(testPath, test);
