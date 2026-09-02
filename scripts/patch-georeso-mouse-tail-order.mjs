import fs from "node:fs";

const swiftPath = "plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift";

function replaceOnce(text, label, from, to) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`${label}: source block not found`);
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(`${label}: source block not unique`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

let swift = fs.readFileSync(swiftPath, "utf8");

swift = replaceOnce(
  swift,
  "held mouse-tail state",
  `      var __cribloHeldPointerDownFallback = null;\n      var __cribloHeldPointerUpFallback = null;\n      var __cribloObservedPhysicalPointers = new WeakSet();`,
  `      var __cribloHeldPointerDownFallback = null;\n      var __cribloHeldPointerUpFallback = null;\n      var __cribloHeldMouseUp = null;\n      var __cribloHeldClick = null;\n      var __cribloObservedPhysicalPointers = new WeakSet();`,
);

swift = replaceOnce(
  swift,
  "dispatch pointer up then held mouse tail",
  `          traceAndroidEvent(isDown ? 'pointerdown' : 'pointerup', true);\n          target.dispatchEvent(event);\n          return true;`,
  `          traceAndroidEvent(isDown ? 'pointerdown' : 'pointerup', true);\n          target.dispatchEvent(event);\n          if (!isDown) {\n            var request = pendingNativeLongPress;\n            if (request && request.armed && request.releasedAt) {\n              request.pointerUpPresented = true;\n              replayHeldCompatibilityMouseTail(request);\n            }\n          }\n          return true;`,
);

swift = replaceOnce(
  swift,
  "late physical pointer up immediate replay",
  `              __cribloHeldPointerUpFallback = setTimeout(function () {\n                if (__cribloHeldPointerUp === event) dispatchHeldAndroidPointer('up');\n              }, 55);`,
  `              __cribloHeldPointerUpFallback = setTimeout(function () {\n                if (__cribloHeldPointerUp === event) dispatchHeldAndroidPointer('up');\n              }, 55);\n              var activeRequest = pendingNativeLongPress;\n              if (activeRequest && activeRequest.armed && activeRequest.releasedAt) {\n                setTimeout(function () {\n                  if (__cribloHeldPointerUp === event) dispatchHeldAndroidPointer('up');\n                }, 0);\n              }`,
);

swift = replaceOnce(
  swift,
  "mouse-tail boundary helpers",
  `      function suppressDuplicateCompatibilityMouseDown(event) {\n        try {`,
  `      function shouldHoldCompatibilityMouseTail(event, name) {\n        try {\n          if (!event || __cribloSyntheticContextEvents.has(event) || !event.isTrusted) return false;\n          if (name !== 'mouseup' && name !== 'click') return false;\n          var request = pendingNativeLongPress;\n          if (!request || !request.armed || !request.releasedAt || request.pointerUpPresented) return false;\n          if (!sameMapPressTarget(event.target, request.target || compatSyntheticMouseDownTarget)) return false;\n          if (name === 'mouseup' && !__cribloHeldMouseUp) __cribloHeldMouseUp = event;\n          if (name === 'click' && !__cribloHeldClick) __cribloHeldClick = event;\n          return true;\n        } catch (_) { return false; }\n      }\n\n      function holdCompatibilityMouseTailAtBoundary(event) {\n        var name = String(event && event.type || '').toLowerCase();\n        if (!shouldHoldCompatibilityMouseTail(event, name)) return;\n        try { event.stopImmediatePropagation(); } catch (_) {}\n        try { event.stopPropagation(); } catch (_) {}\n      }\n\n      function replayHeldCompatibilityMouseTail(request) {\n        if (!request || pendingNativeLongPress !== request || !request.pointerUpPresented) return false;\n        var target = request.target;\n        if (!target || !target.dispatchEvent) return false;\n        var x = request.x == null ? compatSyntheticMouseDownX : request.x;\n        var y = request.y == null ? compatSyntheticMouseDownY : request.y;\n        var hadUp = !!__cribloHeldMouseUp;\n        var hadClick = !!__cribloHeldClick;\n        var upSource = __cribloHeldMouseUp;\n        var clickSource = __cribloHeldClick;\n        __cribloHeldMouseUp = null;\n        __cribloHeldClick = null;\n\n        if (hadUp) {\n          mouse(target, 'mouseup', x, y, 0, 0, upSource);\n          lastRealMouseUpTarget = target;\n          lastRealMouseUpAt = Date.now();\n          __cribloGeoDiag.syntheticMouseUps++;\n          traceAndroidEvent('mouseup', true);\n        }\n        if (hadClick) {\n          mouse(target, 'click', x, y, 0, 0, clickSource);\n          lastRealClickTarget = target;\n          lastRealClickAt = Date.now();\n          __cribloGeoDiag.syntheticClicks++;\n          traceAndroidEvent('click', true);\n          if (!request.tailCompletionScheduled) {\n            request.tailCompletionScheduled = true;\n            setTimeout(function () { completeAndroidLongPress(request, 'held-trusted-click'); }, 0);\n          }\n        }\n        return hadUp || hadClick;\n      }\n\n      function ensureAndroidPointerUpAfterTouchEnd(request) {\n        if (!request || pendingNativeLongPress !== request || request.pointerUpPresented) return true;\n        if (dispatchHeldAndroidPointer('up')) return true;\n        var target = request.target;\n        if (!target || !target.dispatchEvent || typeof PointerEvent !== 'function') return false;\n        var source = request.releaseEvent || request.sourceEvent || null;\n        try {\n          var event = new PointerEvent('pointerup', {\n            bubbles: true, cancelable: true, composed: true,\n            clientX: Number(request.x || 0), clientY: Number(request.y || 0),\n            screenX: Number(request.x || 0), screenY: Number(request.y || 0),\n            button: 0, buttons: 0,\n            pointerId: Number(request.pointerId || 1), pointerType: 'touch',\n            isPrimary: true, width: 9, height: 9, pressure: 0, view: window\n          });\n          __cribloSyntheticContextEvents.add(event);\n          if (source) __cribloSyntheticContextSources.set(event, source);\n          target.dispatchEvent(event);\n          request.pointerUpPresented = true;\n          __cribloGeoDiag.syntheticPointerUps++;\n          traceAndroidEvent('pointerup', !!(source && source.isTrusted));\n          replayHeldCompatibilityMouseTail(request);\n          return true;\n        } catch (_) { return false; }\n      }\n\n      function suppressDuplicateCompatibilityMouseDown(event) {\n        try {`,
);

swift = replaceOnce(
  swift,
  "strong duplicate mousedown stop",
  `          event.stopImmediatePropagation();\n        } catch (_) {}\n      }\n\n      // Installed before page scripts`,
  `          event.stopImmediatePropagation();\n          try { event.stopPropagation(); } catch (_) {}\n        } catch (_) {}\n      }\n\n      // Installed before page scripts`,
);

swift = replaceOnce(
  swift,
  "install mouse-tail boundary capture",
  `      __cribloOriginalAddEventListener.call(window, 'mousedown', suppressDuplicateCompatibilityMouseDown, true);\n      __cribloOriginalAddEventListener.call(document, 'mousedown', suppressDuplicateCompatibilityMouseDown, true);`,
  `      __cribloOriginalAddEventListener.call(window, 'mousedown', suppressDuplicateCompatibilityMouseDown, true);\n      __cribloOriginalAddEventListener.call(document, 'mousedown', suppressDuplicateCompatibilityMouseDown, true);\n      __cribloOriginalAddEventListener.call(window, 'mouseup', holdCompatibilityMouseTailAtBoundary, true);\n      __cribloOriginalAddEventListener.call(window, 'click', holdCompatibilityMouseTailAtBoundary, true);\n      __cribloOriginalAddEventListener.call(document, 'mouseup', holdCompatibilityMouseTailAtBoundary, true);\n      __cribloOriginalAddEventListener.call(document, 'click', holdCompatibilityMouseTailAtBoundary, true);`,
);

swift = replaceOnce(
  swift,
  "page wrapper holds early tail",
  `        var wrapper = function (event) {\n          var name = String(event && event.type || '').toLowerCase();\n          var presented = syntheticContextFacade(event);`,
  `        var wrapper = function (event) {\n          var name = String(event && event.type || '').toLowerCase();\n          if (shouldHoldCompatibilityMouseTail(event, name)) return;\n          if (name === 'mousedown') {\n            try {\n              if (event && event.isTrusted && compatSyntheticMouseDownTarget\n                  && Date.now() - compatSyntheticMouseDownAt < 2500\n                  && sameMapPressTarget(event.target, compatSyntheticMouseDownTarget)) return;\n            } catch (_) {}\n          }\n          var presented = syntheticContextFacade(event);`,
);

swift = replaceOnce(
  swift,
  "touchend fallback waits for pointer/tail",
  `            // The real iPhone trace shows no WebKit mouseup/click for a hold.\n            // Finish the Android compatibility mouse tail in the next task, after\n            // GeoReseaux's genuine touchend handlers have completed. If WebKit\n            // did produce a real click, the capture listener wins and this is a no-op.\n            setTimeout(function () {\n              if (pendingNativeLongPress === request && request.armed && !request.tailCompletionScheduled) {\n                request.tailCompletionScheduled = true;\n                completeAndroidLongPress(request, 'android-compat-tail');\n              }\n            }, 0);`,
  `            // OpenLayers 7/Chromium can produce mouseup/click before its\n            // trusted pointerup. Hold that tail, present pointerup first, then\n            // replay the tail. WKWebView with no native mouse tail uses this\n            // watchdog to create only the missing release events afterwards.\n            setTimeout(function () {\n              if (pendingNativeLongPress !== request || !request.armed || request.tailCompletionScheduled) return;\n              ensureAndroidPointerUpAfterTouchEnd(request);\n              if (request.tailCompletionScheduled) return;\n              request.tailCompletionScheduled = true;\n              completeAndroidLongPress(request, 'android-compat-tail');\n            }, 90);`,
);

fs.writeFileSync(swiftPath, swift);
