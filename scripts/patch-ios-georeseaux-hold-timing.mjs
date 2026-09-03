import { existsSync, readFileSync, writeFileSync } from "node:fs";

const swiftPaths = [
  new URL(
    "../plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift",
    import.meta.url,
  ),
  new URL(
    "../node_modules/@criblo/native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift",
    import.meta.url,
  ),
];

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`${label} anchor not found`);
  return source.replace(from, to);
}

function patchSwift(swiftPath) {
  if (!existsSync(swiftPath)) return "missing";
  let swift = readFileSync(swiftPath, "utf8");
  if (swift.includes("holdTimeContextDispatches: 0")) return "already";

  swift = replaceOnce(
    swift,
    "        mapEscalationRuns: 0\n      };",
    "        mapEscalationRuns: 0,\n        holdTimeContextDispatches: 0,\n        suppressedLongPressClicks: 0\n      };",
    "diagnostic counters",
  );

  swift = replaceOnce(
    swift,
    "              if (prop === 'isTrusted') return sourceIsTrusted;\n              if (prop === 'sourceCapabilities') return { firesTouchEvents: true };",
    "              if (prop === 'isTrusted') return sourceIsTrusted;\n              // Dynatrace/Ruxit inspects this marker on synthetic events. Android's\n              // real long-touch contextmenu does not expose it, so do not advertise\n              // our bridge event as a Ruxit synthetic event.\n              if (prop === 'isRuxitSynthetic') return undefined;\n              if (prop === 'sourceCapabilities') return { firesTouchEvents: true };",
    "synthetic facade Ruxit parity",
  );

  swift = replaceOnce(
    swift,
    "              if (prop === '__cribloPrevented') return prevented;\n              if (prop === '__cribloStopped') return stopped;",
    "              if (prop === '__cribloPrevented') return prevented;\n              if (prop === 'isRuxitSynthetic') return undefined;\n              if (prop === '__cribloStopped') return stopped;",
    "semantic facade Ruxit parity",
  );

  const contextStart = swift.indexOf("      function contextMenu(target, x, y, sourceEvent) {");
  const contextEnd = swift.indexOf("      function jqueryContextMenu", contextStart);
  if (contextStart < 0 || contextEnd < 0) throw new Error("contextMenu function not found");
  let contextBlock = swift.slice(contextStart, contextEnd);
  contextBlock = replaceOnce(
    contextBlock,
    "            button: 0, buttons: 0, pointerId: 1, pointerType: 'touch',",
    "            button: 0, buttons: 0,\n            pointerId: realTouchIdentifier == null ? 1 : realTouchIdentifier,\n            pointerType: 'touch',",
    "contextmenu pointerId",
  );
  swift = swift.slice(0, contextStart) + contextBlock + swift.slice(contextEnd);

  swift = replaceOnce(
    swift,
    "      function holdCompatibilityMouseTailAtBoundary(event) {\n        var name = String(event && event.type || '').toLowerCase();\n        if (!shouldHoldCompatibilityMouseTail(event, name)) return;\n        try { event.stopImmediatePropagation(); } catch (_) {}\n        try { event.stopPropagation(); } catch (_) {}\n      }",
    `      function holdCompatibilityMouseTailAtBoundary(event) {
        var name = String(event && event.type || '').toLowerCase();

        // Chrome/Android does not turn a successful long-touch contextmenu into a
        // normal click. Once the hold contextmenu has fired, drop WebKit's delayed
        // compatibility click so GeoReseaux cannot tear down the pressed feature
        // before/after its contextmenu handler runs.
        try {
          var active = pendingNativeLongPress;
          var recentTarget = (lastCompletedLongPressTarget && Date.now() - lastCompletedLongPressAt < 1200)
            ? lastCompletedLongPressTarget
            : null;
          var suppressTarget = active && active.contextDispatched
            ? (active.target || compatSyntheticMouseDownTarget)
            : recentTarget;
          if (name === 'click' && event && event.isTrusted && suppressTarget
              && sameMapPressTarget(event.target, suppressTarget)) {
            __cribloGeoDiag.suppressedLongPressClicks++;
            event.stopImmediatePropagation();
            try { event.stopPropagation(); } catch (_) {}
            try { event.preventDefault(); } catch (_) {}
            return;
          }
        } catch (_) {}

        if (!shouldHoldCompatibilityMouseTail(event, name)) return;
        try { event.stopImmediatePropagation(); } catch (_) {}
        try { event.stopPropagation(); } catch (_) {}
      }`,
    "long-press click suppression",
  );


  swift = replaceOnce(
    swift,
    "      var compatPressMoved = false;\n",
    "      var compatPressMoved = false;\n      var lastCompletedLongPressTarget = null;\n      var lastCompletedLongPressAt = 0;\n",
    "completed long-press click guard state",
  );

  const helper = `      // Android/Chrome fires the long-touch contextmenu while the finger is still
      // DOWN, at the hold threshold, before touchend/pointerup. GeoReseaux keeps
      // important hit/press state only during that active gesture. Previous CRI-BLO
      // builds waited until finger release, which the real-iPhone diagnostic exposed
      // as ~2400 ms after touchstart; by then both the DOM and OpenLayers paths ran
      // after the state they needed had already been torn down.
      function dispatchAndroidContextWhileHeld(request, reason) {
        if (!request || pendingNativeLongPress !== request || !request.armed
            || request.contextDispatched || !request.target) return false;
        var target = request.target;
        if (!target.dispatchEvent) return false;
        var x = request.x;
        var y = request.y;
        var source = request.sourceEvent || window.__cribloLastTrustedTouchStart || null;
        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;

        request.contextDispatched = true;
        request.contextDispatchedAt = Date.now();
        __cribloGeoDiag.holdTimeContextDispatches++;
        __cribloGeoDiag.contextAfterTouchMs = request.touchStartedAt
          ? Math.max(0, request.contextDispatchedAt - request.touchStartedAt)
          : -1;

        var dispatched = contextMenu(target, x, y, source);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        __cribloGeoDiag.directTrustedHandlerFires += delta;
        __cribloGeoDiag.lastResult = dispatched
          ? 'trusted-webkit-hold-contextmenu-' + String(reason || 'threshold')
          : 'trusted-webkit-hold-contextmenu-error';

        // Let the synchronous DOM/Angular contextmenu handlers finish, then in
        // the very next task escalate if they did not open a popup. Do NOT wait
        // hundreds of milliseconds here: the finger may be released immediately
        // after the haptic/hold threshold, and OpenLayers must see active press state.
        setTimeout(function () {
          if (popupChanged(before)) {
            __cribloGeoDiag.lastResult = 'trusted-webkit-hold-popup';
            return;
          }
          __cribloGeoDiag.popupEscalations++;
          var engineHandled = invokeMapEngine(target, x, y, source);
          if (engineHandled) __cribloGeoDiag.mapEscalationRuns++;
          setTimeout(function () {
            if (popupChanged(before)) {
              __cribloGeoDiag.lastResult = 'trusted-webkit-hold-popup-after-map-direct';
            } else {
              __cribloGeoDiag.lastResult = engineHandled
                ? 'trusted-webkit-hold-no-popup-map-direct-ran'
                : 'trusted-webkit-hold-no-popup-map-direct-unavailable';
            }
          }, 180);
        }, 0);
        return dispatched;
      }

`;

  swift = replaceOnce(
    swift,
    "      function completeAndroidLongPress(request, reason) {",
    helper + "      function completeAndroidLongPress(request, reason) {",
    "hold-time context helper insertion",
  );

  const completeStart = swift.indexOf("      function completeAndroidLongPress(request, reason) {");
  const completeEnd = swift.indexOf("      function dispatchNativeLongPressRequest", completeStart);
  if (completeStart < 0 || completeEnd < 0) throw new Error("completeAndroidLongPress function not found");
  let completeBlock = swift.slice(completeStart, completeEnd);
  completeBlock = replaceOnce(
    completeBlock,
    "        if (!request || pendingNativeLongPress !== request || !request.armed) return false;\n        pendingNativeLongPress = null;",
    `        if (!request || pendingNativeLongPress !== request || !request.armed) return false;

        // The successful Android long-press contextmenu was already emitted at the
        // 600 ms threshold. Release now only balances the synthetic Android press;
        // never emit a second contextmenu and never manufacture a click.
        if (request.contextDispatched) {
          lastCompletedLongPressTarget = request.target || null;
          lastCompletedLongPressAt = Date.now();
          pendingNativeLongPress = null;
          finishAndroidCompatibilityMouse(request, false);
          __cribloGeoDiag.releaseCompletions++;
          return true;
        }

        // Legacy fallback for a request that somehow reached release before a
        // hold-time contextmenu could be dispatched.
        pendingNativeLongPress = null;`,
    "release-only long-press completion",
  );
  swift = swift.slice(0, completeStart) + completeBlock + swift.slice(completeEnd);

  const nativeDispatchStart = swift.indexOf("      function dispatchNativeLongPressRequest(request) {");
  const nativeDispatchEnd = swift.indexOf("      function fallbackNativeLongPressRequest", nativeDispatchStart);
  if (nativeDispatchStart < 0 || nativeDispatchEnd < 0) throw new Error("dispatchNativeLongPressRequest not found");
  let nativeDispatchBlock = swift.slice(nativeDispatchStart, nativeDispatchEnd);
  nativeDispatchBlock = replaceOnce(
    nativeDispatchBlock,
    "        __cribloGeoDiag.lastResult = 'native-hold-armed-waiting-release';\n        return true;",
    "        __cribloGeoDiag.lastResult = 'native-hold-armed-at-threshold';\n        dispatchAndroidContextWhileHeld(request, 'native-recognizer');\n        return true;",
    "native hold-time dispatch",
  );
  swift = swift.slice(0, nativeDispatchStart) + nativeDispatchBlock + swift.slice(nativeDispatchEnd);

  const fireStart = swift.indexOf("      function fireRealTouchLongPress() {");
  const fireEnd = swift.indexOf("      __cribloOriginalAddEventListener.call(document, 'mousedown'", fireStart);
  if (fireStart < 0 || fireEnd < 0) throw new Error("fireRealTouchLongPress not found");
  let fireBlock = swift.slice(fireStart, fireEnd);
  fireBlock = replaceOnce(
    fireBlock,
    "        __cribloGeoDiag.lastResult = 'js-hold-armed-waiting-release';\n\n        clearSelection();\n        suppressIOSCalloutChain(request.target);",
    "        __cribloGeoDiag.lastResult = 'js-hold-armed-at-threshold';\n\n        clearSelection();\n        suppressIOSCalloutChain(request.target);\n        dispatchAndroidContextWhileHeld(request, 'trusted-js-touch-timer');",
    "trusted JS hold-time dispatch",
  );
  swift = swift.slice(0, fireStart) + fireBlock + swift.slice(fireEnd);

  const touchEndStart = swift.indexOf("      document.addEventListener('touchend', function (event) {");
  const touchEndEnd = swift.indexOf("      window.addEventListener('message'", touchEndStart);
  if (touchEndStart < 0 || touchEndEnd < 0) throw new Error("touchend handler not found");
  let touchEndBlock = swift.slice(touchEndStart, touchEndEnd);
  touchEndBlock = replaceOnce(
    touchEndBlock,
    "            __cribloGeoDiag.contextAfterTouchMs = lastRealTouchStartAt ? Math.max(0, releaseAt - lastRealTouchStartAt) : -1;\n            __cribloGeoDiag.lastResult = 'trusted-webkit-tail-touchend-waiting-click';",
    `            // Do not overwrite the hold-time diagnostic/result after a real
            // long-press. contextAfterTouchMs now measures contextmenu timing,
            // not how long the user happened to keep the finger down.
            if (!request.contextDispatched) {
              __cribloGeoDiag.contextAfterTouchMs = lastRealTouchStartAt ? Math.max(0, releaseAt - lastRealTouchStartAt) : -1;
              __cribloGeoDiag.lastResult = 'trusted-webkit-tail-touchend-waiting-click';
            }`,
    "touchend preserves hold-time result",
  );
  swift = swift.slice(0, touchEndStart) + touchEndBlock + swift.slice(touchEndEnd);

  swift = replaceOnce(
    swift,
    "          'Popup escalations: ' + __cribloGeoDiag.popupEscalations + ' / map-direct escalations: ' + __cribloGeoDiag.mapEscalationRuns,\n          'Context handlers called: '",
    "          'Popup escalations: ' + __cribloGeoDiag.popupEscalations + ' / map-direct escalations: ' + __cribloGeoDiag.mapEscalationRuns,\n          'Hold-time context dispatches: ' + __cribloGeoDiag.holdTimeContextDispatches + ' / suppressed long-press clicks: ' + __cribloGeoDiag.suppressedLongPressClicks,\n          'Context handlers called: '",
    "diagnostic text",
  );

  writeFileSync(swiftPath, swift);
  return "patched";
}

let available = 0;
let patched = 0;
for (const swiftPath of swiftPaths) {
  const result = patchSwift(swiftPath);
  if (result !== "missing") available += 1;
  if (result === "patched") patched += 1;
  console.log(`${result}: ${swiftPath.pathname}`);
}
if (available === 0) throw new Error("No CRI-BLO iOS browser plugin source was found");
console.log(`iOS GeoReseaux hold-timing patch ready (${patched} source copies patched)`);
