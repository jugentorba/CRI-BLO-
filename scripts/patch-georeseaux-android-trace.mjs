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

function replaceOnce(label, from, to) {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Patch anchor missing: ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  source = source.slice(0, index) + to + source.slice(index + from.length);
}

function replaceBlock(label, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Patch start missing: ${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Patch end missing: ${label}`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceOnce(
  "synthetic context source map",
  "      var __cribloSyntheticContextFacades = new WeakMap();\n",
  "      var __cribloSyntheticContextFacades = new WeakMap();\n      var __cribloSyntheticContextSources = new WeakMap();\n",
);

replaceOnce(
  "trusted facade source",
  "        var source = window.__cribloLastTrustedTouchStart || null;\n        var sourceAge = lastRealTouchStartAt ? Date.now() - lastRealTouchStartAt : Number.POSITIVE_INFINITY;\n        var sourceIsTrusted = !!(source && source.isTrusted && sourceAge >= 0 && sourceAge < 1500);\n",
  "        // Bind each synthetic context event to the genuine iOS touch that\n        // caused this hold. This survives touchend, which is important because\n        // the measured Android event arrives only after the release/click tail.\n        var source = __cribloSyntheticContextSources.get(event) || window.__cribloLastTrustedTouchStart || null;\n        var sourceIsTrusted = !!(source && source.isTrusted);\n",
);

replaceOnce(
  "diagnostic counters",
  "        syntheticPointerDowns: 0,\n        contextDispatches: 0,\n",
  "        syntheticPointerDowns: 0,\n        syntheticMouseDowns: 0,\n        syntheticPointerUps: 0,\n        syntheticMouseUps: 0,\n        syntheticClicks: 0,\n        releaseCompletions: 0,\n        androidSequence: [],\n        contextDispatches: 0,\n",
);

replaceOnce(
  "diagnostic sequence helper",
  "      };\n\n      // Register actual map instances at construction time.",
  "      };\n\n      function traceAndroidEvent(name, trusted) {\n        try {\n          __cribloGeoDiag.androidSequence.push(String(name) + (trusted ? '*' : ''));\n          while (__cribloGeoDiag.androidSequence.length > 16) __cribloGeoDiag.androidSequence.shift();\n        } catch (_) {}\n      }\n\n      // Register actual map instances at construction time.",
);

replaceBlock(
  "contextmenu shape",
  "      function contextMenu(target, x, y) {",
  "      function jqueryContextMenu(target, x, y) {",
  `      function contextMenu(target, x, y, sourceEvent) {
        // Exact working Android trace supplied from the CRI-BLO Android WebView:
        // contextmenu is the LAST event and reports button=0/buttons=0.
        try {
          if (typeof PointerEvent === 'function') {
            var event = new PointerEvent('contextmenu', {
              bubbles: true, cancelable: true, composed: true,
              clientX: x, clientY: y, screenX: x, screenY: y,
              button: 0, buttons: 0, pointerId: 1, pointerType: 'touch',
              isPrimary: true, width: 9, height: 9, pressure: 0, view: window
            });
            __cribloSyntheticContextEvents.add(event);
            if (sourceEvent) __cribloSyntheticContextSources.set(event, sourceEvent);
            __cribloGeoDiag.contextDispatches++;
            traceAndroidEvent('contextmenu', !!(sourceEvent && sourceEvent.isTrusted));
            target.dispatchEvent(event);
            __cribloGeoDiag.syntheticContextPrevented = !!event.defaultPrevented;
            return true;
          }
        } catch (_) {}
        try {
          var fallback = new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, screenX: x, screenY: y,
            button: 0, buttons: 0, view: window
          });
          __cribloSyntheticContextEvents.add(fallback);
          if (sourceEvent) __cribloSyntheticContextSources.set(fallback, sourceEvent);
          __cribloGeoDiag.contextDispatches++;
          traceAndroidEvent('contextmenu', !!(sourceEvent && sourceEvent.isTrusted));
          target.dispatchEvent(fallback);
          __cribloGeoDiag.syntheticContextPrevented = !!fallback.defaultPrevented;
          return true;
        } catch (_) { return false; }
      }

`,
);

replaceOnce(
  "jquery context button",
  "            button: -1,\n            buttons: 0,\n            which: 0\n",
  "            button: 0,\n            buttons: 0,\n            which: 1\n",
);

replaceOnce(
  "semantic context pointer shape",
  "              button: -1,\n              buttons: 0,\n",
  "              button: 0,\n              buttons: 0,\n",
);

replaceOnce(
  "semantic context mouse shape",
  "              button: isContext ? -1 : 0,\n              buttons: isContext ? 0 : 1,\n",
  "              button: 0,\n              buttons: isContext ? 0 : 1,\n",
);

replaceOnce(
  "semantic facade button",
  "          button: isContext ? -1 : 0,\n          buttons: isContext ? 0 : 1,\n          which: isContext ? 0 : 1,\n",
  "          button: 0,\n          buttons: isContext ? 0 : 1,\n          which: 1,\n",
);

replaceBlock(
  "synthetic fallback Android sequence",
  "      function scheduleAndroidTouchFallback(target, x, y) {",
  "      function dispatchAt(x, y) {",
  `      function scheduleAndroidTouchFallback(target, x, y) {
        if (!target || !target.dispatchEvent) return;
        var pointerId = 47;
        var syntheticTouch = null;
        var touchStartEvent = null;

        // Replay the measured Android order, not the older assumption:
        // touchstart -> pointerdown -> mousedown -> touchend -> pointerup ->
        // mouseup -> click -> contextmenu.
        try {
          if (typeof Touch === 'function' && typeof TouchEvent === 'function') {
            syntheticTouch = new Touch({
              identifier:pointerId,target:target,clientX:x,clientY:y,
              screenX:x,screenY:y,pageX:x+(window.scrollX||0),pageY:y+(window.scrollY||0),
              radiusX:4,radiusY:4,rotationAngle:0,force:0.5
            });
            touchStartEvent = new TouchEvent('touchstart', {
              bubbles:true,cancelable:true,composed:true,
              touches:[syntheticTouch],targetTouches:[syntheticTouch],changedTouches:[syntheticTouch]
            });
            target.dispatchEvent(touchStartEvent);
            traceAndroidEvent('touchstart', false);
          }
        } catch (_) {}

        try {
          if (typeof PointerEvent === 'function') {
            target.dispatchEvent(new PointerEvent('pointerdown', {
              bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,
              screenX:x,screenY:y,button:0,buttons:1,pointerId:pointerId,
              pointerType:'touch',isPrimary:true,width:9,height:9,pressure:1
            }));
            __cribloGeoDiag.syntheticPointerDowns++;
            traceAndroidEvent('pointerdown', false);
          }
        } catch (_) {}
        mouse(target, 'mousedown', x, y, 0, 1);
        __cribloGeoDiag.syntheticMouseDowns++;
        traceAndroidEvent('mousedown', false);

        setTimeout(function () {
          try {
            if (syntheticTouch && typeof TouchEvent === 'function') {
              target.dispatchEvent(new TouchEvent('touchend', {
                bubbles:true,cancelable:true,composed:true,
                touches:[],targetTouches:[],changedTouches:[syntheticTouch]
              }));
              traceAndroidEvent('touchend', false);
            }
          } catch (_) {}
          try {
            if (typeof PointerEvent === 'function') {
              target.dispatchEvent(new PointerEvent('pointerup', {
                bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,
                screenX:x,screenY:y,button:0,buttons:0,pointerId:pointerId,
                pointerType:'touch',isPrimary:true,width:9,height:9,pressure:0
              }));
              __cribloGeoDiag.syntheticPointerUps++;
              traceAndroidEvent('pointerup', false);
            }
          } catch (_) {}
          mouse(target, 'mouseup', x, y, 0, 0);
          __cribloGeoDiag.syntheticMouseUps++;
          traceAndroidEvent('mouseup', false);
          mouse(target, 'click', x, y, 0, 0);
          __cribloGeoDiag.syntheticClicks++;
          traceAndroidEvent('click', false);
          contextMenu(target, x, y, touchStartEvent);
        }, 20);
      }

`,
);

replaceOnce(
  "real event state",
  "      var lastRealPointerDownAt = 0;\n      var lastRealPointerDownTarget = null;\n      var pendingNativeLongPress = null;\n",
  "      var lastRealPointerDownAt = 0;\n      var lastRealPointerDownTarget = null;\n      var lastRealMouseDownAt = 0;\n      var lastRealMouseDownTarget = null;\n      var lastRealPointerUpAt = 0;\n      var lastRealPointerUpTarget = null;\n      var lastRealMouseUpAt = 0;\n      var lastRealMouseUpTarget = null;\n      var lastRealClickAt = 0;\n      var lastRealClickTarget = null;\n      var pendingNativeLongPress = null;\n",
);

replaceBlock(
  "native long press arm/complete",
  "      function dispatchNativeLongPressRequest(request) {",
  "      function fallbackNativeLongPressRequest(request) {",
  `      function ensureAndroidPressStart(target, x, y, touchStartedAt) {
        if (!target || !target.dispatchEvent) return;
        // The Android trace has pointerdown/mousedown AFTER touchstart. Only
        // synthesize a missing event when WebKit did not provide a trusted one
        // after this touchstart.
        if (!(lastRealPointerDownTarget === target && lastRealPointerDownAt >= touchStartedAt)) {
          try {
            if (typeof PointerEvent === 'function') {
              target.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles:true,cancelable:true,composed:true,
                clientX:x,clientY:y,screenX:x,screenY:y,
                button:0,buttons:1,pointerId:realTouchIdentifier == null ? 1 : realTouchIdentifier,
                pointerType:'touch',isPrimary:true,width:9,height:9,pressure:1,view:window
              }));
              __cribloGeoDiag.syntheticPointerDowns++;
              traceAndroidEvent('pointerdown', false);
            }
          } catch (_) {}
        }
        if (!(lastRealMouseDownTarget === target && lastRealMouseDownAt >= touchStartedAt)) {
          mouse(target, 'mousedown', x, y, 0, 1);
          __cribloGeoDiag.syntheticMouseDowns++;
          traceAndroidEvent('mousedown', false);
        }
      }

      function completeAndroidLongPress(request) {
        if (!request || pendingNativeLongPress !== request || !request.armed) return false;
        pendingNativeLongPress = null;
        var target = request.target;
        var x = request.x;
        var y = request.y;
        if (!target || !target.dispatchEvent) {
          __cribloGeoDiag.lastResult = 'android-trace-release-no-target';
          return false;
        }

        var releasedAt = request.releasedAt || Date.now();
        if (!(lastRealPointerUpTarget === target && lastRealPointerUpAt >= releasedAt)) {
          try {
            if (typeof PointerEvent === 'function') {
              target.dispatchEvent(new PointerEvent('pointerup', {
                bubbles:true,cancelable:true,composed:true,
                clientX:x,clientY:y,screenX:x,screenY:y,
                button:0,buttons:0,pointerId:request.pointerId == null ? 1 : request.pointerId,
                pointerType:'touch',isPrimary:true,width:9,height:9,pressure:0,view:window
              }));
              __cribloGeoDiag.syntheticPointerUps++;
              traceAndroidEvent('pointerup', false);
            }
          } catch (_) {}
        }
        if (!(lastRealMouseUpTarget === target && lastRealMouseUpAt >= releasedAt)) {
          mouse(target, 'mouseup', x, y, 0, 0);
          __cribloGeoDiag.syntheticMouseUps++;
          traceAndroidEvent('mouseup', false);
        }
        if (!(lastRealClickTarget === target && lastRealClickAt >= releasedAt)) {
          mouse(target, 'click', x, y, 0, 0);
          __cribloGeoDiag.syntheticClicks++;
          traceAndroidEvent('click', false);
        }

        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var dispatched = contextMenu(target, x, y, request.sourceEvent || request.releaseEvent || null);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        __cribloGeoDiag.directTrustedHandlerFires += delta;
        __cribloGeoDiag.releaseCompletions++;
        __cribloGeoDiag.lastResult = dispatched ? 'android-trace-release-dispatched' : 'android-trace-release-error';
        setTimeout(function () {
          if (popupChanged(before)) __cribloGeoDiag.lastResult = 'android-trace-popup';
          else if (dispatched) __cribloGeoDiag.lastResult = 'android-trace-no-popup';
        }, 220);
        return dispatched;
      }

      function dispatchNativeLongPressRequest(request) {
        if (!request || pendingNativeLongPress !== request) return false;

        var estimatedX = window.innerWidth * request.rx;
        var estimatedY = window.innerHeight * request.ry;
        var touchAge = lastRealTouchStartAt ? Date.now() - lastRealTouchStartAt : Number.POSITIVE_INFINITY;
        var hasFreshTouch = !!(realTouchTarget && touchAge >= 0 && touchAge < 1500);
        if (!hasFreshTouch) return false;

        request.target = realTouchTarget;
        request.x = realTouchX;
        request.y = realTouchY;
        request.pointerId = realTouchIdentifier;
        request.touchStartedAt = lastRealTouchStartAt;
        request.sourceEvent = window.__cribloLastTrustedTouchStart || null;
        request.armed = true;

        __cribloGeoDiag.directSourceTrusted = !!(request.sourceEvent && request.sourceEvent.isTrusted);
        __cribloGeoDiag.contextAfterTouchMs = -1;
        __cribloGeoDiag.coordinateDelta = String(Math.round(estimatedX - request.x)) + ',' + String(Math.round(estimatedY - request.y));
        __cribloGeoDiag.directTarget = String((request.target.tagName || '') + '#' + (request.target.id || '') + '.' + (request.target.className && (request.target.className.baseVal || request.target.className) || '')).slice(0, 180);
        __cribloGeoDiag.lastTarget = __cribloGeoDiag.directTarget;
        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);
        lastRealTouchLongPressAt = Date.now();

        ensureAndroidPressStart(request.target, request.x, request.y, request.touchStartedAt);
        __cribloGeoDiag.lastResult = 'android-trace-armed-waiting-release';
        return true;
      }

`,
);

replaceOnce(
  "armed fallback guard",
  "      function fallbackNativeLongPressRequest(request) {\n        if (!request || pendingNativeLongPress !== request) return;\n",
  "      function fallbackNativeLongPressRequest(request) {\n        if (!request || pendingNativeLongPress !== request || request.armed) return;\n",
);

replaceBlock(
  "trusted real event trackers",
  "      document.addEventListener('pointerdown', function (event) {",
  "      // Bypass the page-listener wrapper for CRI-BLO's own observer.",
  `      document.addEventListener('pointerdown', function (event) {
        try {
          if (!event || !event.isTrusted || String(event.pointerType || '') !== 'touch') return;
          lastRealPointerDownAt = Date.now();
          lastRealPointerDownTarget = event.target || null;
          traceAndroidEvent('pointerdown', true);
        } catch (_) {}
      }, true);

      document.addEventListener('mousedown', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealMouseDownAt = Date.now();
          lastRealMouseDownTarget = event.target || null;
          traceAndroidEvent('mousedown', true);
        } catch (_) {}
      }, true);

      document.addEventListener('pointerup', function (event) {
        try {
          if (!event || !event.isTrusted || String(event.pointerType || '') !== 'touch') return;
          lastRealPointerUpAt = Date.now();
          lastRealPointerUpTarget = event.target || null;
          traceAndroidEvent('pointerup', true);
        } catch (_) {}
      }, true);

      document.addEventListener('mouseup', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealMouseUpAt = Date.now();
          lastRealMouseUpTarget = event.target || null;
          traceAndroidEvent('mouseup', true);
        } catch (_) {}
      }, true);

      document.addEventListener('click', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealClickAt = Date.now();
          lastRealClickTarget = event.target || null;
          traceAndroidEvent('click', true);
        } catch (_) {}
      }, true);

`,
);

replaceOnce(
  "context observer trace",
  "          if (__cribloSyntheticContextEvents.has(event)) {\n            __cribloGeoDiag.syntheticContextmenus++;\n            return;\n          }\n",
  "          if (__cribloSyntheticContextEvents.has(event)) {\n            __cribloGeoDiag.syntheticContextmenus++;\n            return;\n          }\n",
);

replaceOnce(
  "touchstart trace",
  "          var touchStartNow = Date.now();\n\n          clearRealTouchTimer();\n",
  "          var touchStartNow = Date.now();\n          traceAndroidEvent('touchstart', !!event.isTrusted);\n\n          clearRealTouchTimer();\n",
);

replaceBlock(
  "touchstart press ordering",
  "          // Android emits pointerdown before touchstart.",
  "          realTouchX = touch.clientX;",
  `          // The measured Android WebView does the opposite of our previous
          // assumption: touchstart is observed first, then pointerdown/mousedown.
          // Save coordinates first; missing press events are filled only after
          // this real touchstart has completed propagation.

          realTouchX = touch.clientX;`,
);

replaceOnce(
  "post-touchstart press completion",
  "          realTouchFired = false;\n          realTouchTimer = null;\n\n          // WKWebView can hold DOM touch delivery",
  "          realTouchFired = false;\n          realTouchTimer = null;\n\n          setTimeout(function () {\n            if (realTouchTarget === target && lastRealTouchStartAt === touchStartNow) {\n              ensureAndroidPressStart(target, realTouchX, realTouchY, touchStartNow);\n            }\n          }, 0);\n\n          // WKWebView can hold DOM touch delivery",
);

replaceOnce(
  "touchmove gate",
  "          if (!realTouchTimer) return;\n",
  "          if (!realTouchTarget) return;\n",
);

replaceOnce(
  "touchcancel pending reset",
  "      document.addEventListener('touchcancel', function () {\n        clearRealTouchTimer();\n        realTouchTarget = null;\n",
  "      document.addEventListener('touchcancel', function () {\n        clearRealTouchTimer();\n        pendingNativeLongPress = null;\n        realTouchTarget = null;\n",
);

replaceBlock(
  "touchend release completion",
  "      document.addEventListener('touchend', function (event) {",
  "      window.addEventListener('message', function (event) {",
  `      document.addEventListener('touchend', function (event) {
        try {
          traceAndroidEvent('touchend', !!(event && event.isTrusted));
          var request = pendingNativeLongPress;
          var target = realTouchTarget || (event && event.target) || null;
          var sourceEvent = window.__cribloLastTrustedTouchStart || event || null;
          var releaseAt = Date.now();

          if (request && request.armed && target) {
            request.target = request.target || target;
            request.x = request.x == null ? realTouchX : request.x;
            request.y = request.y == null ? realTouchY : request.y;
            request.pointerId = request.pointerId == null ? realTouchIdentifier : request.pointerId;
            request.sourceEvent = request.sourceEvent || sourceEvent;
            request.releaseEvent = event || null;
            request.releasedAt = releaseAt;
            __cribloGeoDiag.contextAfterTouchMs = lastRealTouchStartAt ? Math.max(0, releaseAt - lastRealTouchStartAt) : -1;
            __cribloGeoDiag.lastResult = 'android-trace-touchend-waiting-tail';
            // Let WebKit deliver its genuine pointerup/mouseup/click first. The
            // zero-delay task then fills only missing tail events and emits the
            // contextmenu LAST, matching the Android trace exactly.
            setTimeout(function () { completeAndroidLongPress(request); }, 0);
          }
        } catch (_) {}

        clearRealTouchTimer();
        realTouchTarget = null;
        realTouchIdentifier = null;
        realTouchFired = false;
        lastRealTouchStartAt = 0;
        window.__cribloLastTrustedTouchStart = null;
      }, { capture: true, passive: false });

`,
);

replaceOnce(
  "native arm comment",
  "            // Run after the current JavaScript stack so any remaining page\n            // gesture bookkeeping completes before contextmenu dispatch.\n",
  "            // Arm after the current stack. The actual contextmenu is held\n            // until the genuine touchend and release/click tail complete.\n",
);

replaceOnce(
  "native wait comment",
  "            // Android-shaped pointer/touch hold sequence instead of sending\n            // contextmenu before gesture state exists.\n",
  "            // Android-shaped sequence instead of sending contextmenu before\n            // gesture state exists.\n",
);

replaceOnce(
  "diagnostics release counters",
  "          'Synthetic pointerdowns: ' + __cribloGeoDiag.syntheticPointerDowns,\n          'Real WebKit contextmenus: ' + __cribloGeoDiag.trustedContextmenus,\n",
  "          'Synthetic press/release: pd=' + __cribloGeoDiag.syntheticPointerDowns + ' md=' + __cribloGeoDiag.syntheticMouseDowns + ' pu=' + __cribloGeoDiag.syntheticPointerUps + ' mu=' + __cribloGeoDiag.syntheticMouseUps + ' click=' + __cribloGeoDiag.syntheticClicks,\n          'Release completions: ' + __cribloGeoDiag.releaseCompletions,\n          'Android-order trace (*=trusted source): ' + (__cribloGeoDiag.androidSequence.join(' > ') || 'none'),\n          'Real WebKit contextmenus: ' + __cribloGeoDiag.trustedContextmenus,\n",
);

if (source === original) throw new Error("GeoReseaux patch made no changes");
writeFileSync(swiftPath, source);
console.log("Patched iOS GeoReseaux bridge to match the measured Android release sequence.");
