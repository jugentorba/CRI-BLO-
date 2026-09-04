from pathlib import Path

path = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
text = path.read_text()

anchor = '''      function completeAndroidLongPress(request, reason) {
'''
helper = '''      function dispatchHoldContextNow(request, reason) {
        if (!request || !request.armed || request.contextDispatched) return !!(request && request.contextDispatched);
        var target = request.target;
        var x = request.x;
        var y = request.y;
        if (!target || !target.dispatchEvent) {
          __cribloGeoDiag.lastResult = 'hold-threshold-no-target';
          return false;
        }

        // The working Android WebView emits long-touch contextmenu at the hold
        // threshold while the finger is still down. Do the semantic action now;
        // touchend/pointerup/mouseup/click are only the later release tail.
        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var openLayersBefore = __cribloOpenLayersDomIntercepts;
        var source = request.sourceEvent || null;
        var dispatched = contextMenu(target, x, y, source);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        var openLayersIntercepted = __cribloOpenLayersDomIntercepts > openLayersBefore;
        if (openLayersIntercepted || (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented)) {
          dispatched = invokeMapEngine(target, x, y, source) || dispatched;
        } else if (__cribloMapRegistry.length) {
          setTimeout(function () {
            if (!popupChanged(before) && invokeMapEngine(target, x, y, source)) {
              __cribloGeoDiag.lastResult = 'hold-threshold-openlayers-recovered';
            }
          }, 32);
        }
        __cribloGeoDiag.directTrustedHandlerFires += delta;
        request.contextDispatched = true;
        request.contextDispatchedAt = Date.now();
        __cribloGeoDiag.contextAfterTouchMs = request.touchStartedAt
          ? Math.max(0, request.contextDispatchedAt - request.touchStartedAt)
          : -1;
        __cribloGeoDiag.lastResult = dispatched
          ? 'android-hold-contextmenu-' + String(reason || 'threshold')
          : 'android-hold-contextmenu-error';
        setTimeout(function () {
          if (popupChanged(before)) __cribloGeoDiag.lastResult = 'android-hold-popup-before-release';
          else if (dispatched) __cribloGeoDiag.lastResult = 'android-hold-context-no-popup-yet';
        }, 220);
        return dispatched;
      }

      function completeAndroidLongPress(request, reason) {
'''
if anchor not in text:
    raise SystemExit('completeAndroidLongPress anchor not found')
text = text.replace(anchor, helper, 1)

old = '''        finishAndroidCompatibilityMouse(request, true);
        // Android delivers contextmenu through the viewport DOM first. That is
'''
new = '''        finishAndroidCompatibilityMouse(request, true);
        if (request.contextDispatched) {
          __cribloGeoDiag.releaseCompletions++;
          __cribloGeoDiag.lastResult = 'android-hold-release-tail-complete';
          return true;
        }
        // Legacy recovery path: if a hold reached release without a threshold
        // contextmenu, keep the existing release-time fallback as a safety net.
        // Android delivers contextmenu through the viewport DOM first. That is
'''
if old not in text:
    raise SystemExit('release duplicate-prevention anchor not found')
text = text.replace(old, new, 1)

old = '''        // The native recognizer can reach WKWebView JavaScript late. Its only
        // job here is to ARM the hold while the trusted touch is alive. The
        // actual contextmenu is deliberately deferred until the genuine iOS
        // release/click tail, which is the measured Android ordering.
        clearRealTouchTimer();
'''
new = '''        // The native recognizer represents the Android hold threshold. Keep
        // the trusted touch source and dispatch contextmenu now, while the finger
        // is still down; release events only balance the input lifecycle later.
        clearRealTouchTimer();
'''
if old not in text:
    raise SystemExit('native timing comment anchor not found')
text = text.replace(old, new, 1)

old = '''        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);
        __cribloGeoDiag.lastResult = 'native-hold-armed-waiting-release';
        return true;
      }
'''
new = '''        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);
        __cribloGeoDiag.lastResult = 'native-hold-threshold';
        dispatchHoldContextNow(request, 'native-threshold');
        return true;
      }
'''
if old not in text:
    raise SystemExit('native dispatch anchor not found')
text = text.replace(old, new, 1)

old = '''        // This timer runs inside the page from the genuine trusted touchstart,
        // so it is not delayed by native evaluateJavaScript IPC. At 600 ms we
        // ARM the long press only. touchend + the real WebKit click complete it
        // and contextmenu is emitted last, exactly like the Android trace.
'''
new = '''        // This timer runs inside the page from the genuine trusted touchstart,
        // so it is not delayed by native evaluateJavaScript IPC. At 600 ms it
        // emits the Android long-touch contextmenu while the finger is still down.
        // The later touch/pointer/mouse release tail must not emit it again.
'''
if old not in text:
    raise SystemExit('JS timer timing comment anchor not found')
text = text.replace(old, new, 1)

old = '''        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);
        __cribloGeoDiag.lastResult = 'js-hold-armed-waiting-release';

        clearSelection();
'''
new = '''        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);
        __cribloGeoDiag.lastResult = 'js-hold-threshold';

        clearSelection();
'''
if old not in text:
    raise SystemExit('JS hold result anchor not found')
text = text.replace(old, new, 1)

old = '''        for (var si = 0; styleNode && si < 7; si++, styleNode = styleNode.parentElement) {
          try {
            styleNode.style.webkitUserSelect = 'none';
            styleNode.style.webkitTouchCallout = 'none';
            styleNode.style.userSelect = 'none';
          } catch (_) {}
        }
      }
'''
new = '''        for (var si = 0; styleNode && si < 7; si++, styleNode = styleNode.parentElement) {
          try {
            styleNode.style.webkitUserSelect = 'none';
            styleNode.style.webkitTouchCallout = 'none';
            styleNode.style.userSelect = 'none';
          } catch (_) {}
        }
        dispatchHoldContextNow(request, 'trusted-js-threshold');
      }
'''
if old not in text:
    raise SystemExit('JS threshold dispatch insertion anchor not found')
text = text.replace(old, new, 1)

old = '''          // recognizer has already begun. If that happened, let this touchstart
          // finish normal propagation, establish the Android press state, and arm
          // the hold. contextmenu remains deferred until the physical release.
'''
new = '''          // recognizer has already begun. If that happened, let this touchstart
          // finish normal propagation, establish the Android press state, then
          // dispatch the hold context immediately while this touch is still live.
'''
if old not in text:
    raise SystemExit('delayed touchstart timing comment anchor not found')
text = text.replace(old, new, 1)

path.write_text(text)
print('applied Android hold-threshold contextmenu timing fix')
