import fs from 'node:fs';

const swiftPath = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';

function replaceOnce(text, label, from, to) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: source block not found`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: source block not unique`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

let swift = fs.readFileSync(swiftPath, 'utf8');

swift = replaceOnce(
  swift,
  'dispatch native hold at recognition time',
  `        __cribloGeoDiag.lastResult = 'trusted-webkit-tail-armed-waiting-release';\n        return true;\n      }`,
  `        // The working Android diagnostic shows contextmenu at ~600 ms while\n        // the finger is STILL DOWN, before pointerup/touchend. The previous iOS\n        // bridge waited until physical release (often >1.5 s), which is too late\n        // for GeoReseaux's internal feature-selection state. Dispatch the one\n        // missing contextmenu now, at native recognition time, and clear the\n        // request so release can never emit a duplicate.\n        var before = visiblePopupState();\n        var callsBefore = __cribloGeoDiag.wrappedContextCalls;\n        var dispatched = contextMenu(request.target, request.x, request.y, request.sourceEvent);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;\n        __cribloGeoDiag.directTrustedHandlerFires += delta;\n        __cribloGeoDiag.contextAfterTouchMs = lastRealTouchStartAt\n          ? Math.max(0, Date.now() - lastRealTouchStartAt)\n          : -1;\n        pendingNativeLongPress = null;\n        __cribloGeoDiag.lastResult = dispatched\n          ? 'native-hold-contextmenu'\n          : 'native-hold-contextmenu-error';\n        setTimeout(function () {\n          if (popupChanged(before)) __cribloGeoDiag.lastResult = 'native-hold-popup';\n          else if (dispatched) __cribloGeoDiag.lastResult = 'native-hold-no-popup';\n        }, 220);\n        return dispatched;\n      }`,
);

swift = replaceOnce(
  swift,
  'fallback no fake android sequence',
  `        __cribloGeoDiag.lastResult = 'touchstart-timeout-android-sequence';\n        scheduleAndroidTouchFallback(target, x, y);`,
  `        // If WKWebView delays DOM touchstart beyond the native recognizer,\n        // do not fabricate a second touch/pointer/mouse lifecycle. The native\n        // point is already in CSS-point coordinates for this full-screen\n        // WKWebView, so emit the same single hold contextmenu directly.\n        __cribloGeoDiag.lastResult = 'touchstart-timeout-contextmenu-at-hold';\n        var before = visiblePopupState();\n        var callsBefore = __cribloGeoDiag.wrappedContextCalls;\n        var dispatched = contextMenu(target, x, y, null);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;\n        __cribloGeoDiag.directTrustedHandlerFires += delta;\n        setTimeout(function () {\n          if (popupChanged(before)) __cribloGeoDiag.lastResult = 'touchstart-timeout-popup';\n          else if (dispatched) __cribloGeoDiag.lastResult = 'touchstart-timeout-no-popup';\n        }, 220);`,
);

swift = replaceOnce(
  swift,
  'native fallback comment/timing',
  `            // The normal delayed WKWebView touchstart arrives within a few\n            // milliseconds. If it never arrives, fall back to a complete\n            // Android-shaped sequence instead of sending contextmenu before\n            // gesture state exists.\n            setTimeout(function () {\n              fallbackNativeLongPressRequest(request);\n            }, 260);`,
  `            // Give delayed WKWebView touchstart a short chance to bind the\n            // genuine target/coordinates. If it still has not arrived, use the\n            // native hold point directly. Do not wait for finger release and do\n            // not fabricate pointer/mouse events.\n            setTimeout(function () {\n              fallbackNativeLongPressRequest(request);\n            }, 90);`,
);

fs.writeFileSync(swiftPath, swift);
