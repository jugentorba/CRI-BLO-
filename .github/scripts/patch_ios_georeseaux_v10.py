from pathlib import Path

p = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
s = p.read_text()

old = "        lastResult: 'not-run',\n        eventProperties: {}\n      };"
new = "        lastResult: 'not-run',\n        eventProperties: {},\n        syntheticPointerDowns: 0,\n        contextDispatches: 0\n      };"
if s.count(old) != 1:
    raise SystemExit('diagnostic object mismatch')
s = s.replace(old, new, 1)

old = "      var realTouchFired = false;\n      var lastRealTouchLongPressAt = 0;"
new = "      var realTouchFired = false;\n      var lastRealTouchLongPressAt = 0;\n      var lastRealPointerDownAt = 0;\n      var lastRealPointerDownTarget = null;"
if s.count(old) != 1:
    raise SystemExit('real touch vars mismatch')
s = s.replace(old, new, 1)

start = s.index('      function fireRealTouchLongPress() {')
end = s.index("      document.addEventListener('touchstart', function (event) {", start)
replacement = '''      function fireRealTouchLongPress() {
        realTouchTimer = null;
        if (!realTouchTarget) return;
        realTouchFired = true;
        lastRealTouchLongPressAt = Date.now();
        clearSelection();

        var styleNode = realTouchTarget;
        for (var si = 0; styleNode && si < 7; si++, styleNode = styleNode.parentElement) {
          try {
            styleNode.style.webkitUserSelect = 'none';
            styleNode.style.webkitTouchCallout = 'none';
            styleNode.style.userSelect = 'none';
          } catch (_) {}
        }

        var signature = String((realTouchTarget.tagName || '') + '#' + (realTouchTarget.id || '') + '.' + (realTouchTarget.className && (realTouchTarget.className.baseVal || realTouchTarget.className) || ''));
        __cribloGeoDiag.lastTarget = signature.slice(0, 180);
        __cribloGeoDiag.lastResult = 'contextmenu-dispatched';

        // Android trace proves Chromium sends ONE bubbling contextmenu on the
        // CANVAS about 600ms after pointerdown/touchstart. Do exactly that.
        // Do not directly call handlers first and do not redispatch to parents:
        // either approach invokes the same framework listener multiple times.
        var before = visiblePopupState();
        __cribloGeoDiag.contextDispatches++;
        dispatchToTarget(realTouchTarget, realTouchX, realTouchY);

        setTimeout(function () {
          if (popupChanged(before)) {
            __cribloGeoDiag.lastResult = 'dom-popup';
            return;
          }

          // If WebKit's synthetic DOM dispatch was ignored by the framework,
          // call the captured contextmenu handlers once as a fallback. This is
          // deliberately after the faithful one-event path, never before it.
          var trustedTouch = window.__cribloLastTrustedTouchStart || null;
          invokeCapturedSemanticHandlers(realTouchTarget, realTouchX, realTouchY, trustedTouch);

          setTimeout(function () {
            __cribloGeoDiag.lastResult = popupChanged(before) ? 'page-handler-popup' : 'no-popup';
          }, 180);
        }, 180);
      }

      document.addEventListener('pointerdown', function (event) {
        try {
          if (!event || String(event.pointerType || '') !== 'touch') return;
          lastRealPointerDownAt = Date.now();
          lastRealPointerDownTarget = event.target || null;
        } catch (_) {}
      }, true);

'''
s = s[:start] + replacement + s[end:]

marker = "          window.__cribloLastTrustedTouchStart = event;\n          realTouchX = touch.clientX;"
inject = '''          window.__cribloLastTrustedTouchStart = event;

          // Android emits pointerdown before touchstart. If this WKWebView did
          // not emit a matching touch PointerEvent, provide exactly one so the
          // GeoReseaux framework can establish the same gesture state.
          if (!(lastRealPointerDownTarget === target && (Date.now() - lastRealPointerDownAt) < 80)) {
            try {
              if (typeof PointerEvent === 'function') {
                target.dispatchEvent(new PointerEvent('pointerdown', {
                  bubbles:true,cancelable:true,composed:true,
                  clientX:touch.clientX,clientY:touch.clientY,
                  screenX:touch.screenX,screenY:touch.screenY,
                  button:0,buttons:1,pointerId:touch.identifier == null ? 1 : touch.identifier,
                  pointerType:'touch',isPrimary:true,width:9,height:9,pressure:1,view:window
                }));
                __cribloGeoDiag.syntheticPointerDowns++;
              }
            } catch (_) {}
          }

          realTouchX = touch.clientX;'''
if s.count(marker) != 1:
    raise SystemExit('touchstart marker mismatch')
s = s.replace(marker, inject, 1)

old = "        if (fired) {\n          try { event.preventDefault(); } catch (_) {}\n        }"
new = "        // Let the real iOS touchend continue normally. Android also releases\n        // the physical touch after contextmenu; blocking the release can leave\n        // framework gesture state inconsistent.\n        void fired;"
if s.count(old) != 1:
    raise SystemExit('touchend block mismatch')
s = s.replace(old, new, 1)

old = "          'Last result: ' + __cribloGeoDiag.lastResult,\n          'Event properties read: ' + (Object.keys(__cribloGeoDiag.eventProperties).sort().join(', ') || 'none'),"
new = "          'Last result: ' + __cribloGeoDiag.lastResult,\n          'Context dispatches: ' + __cribloGeoDiag.contextDispatches,\n          'Synthetic pointerdowns: ' + __cribloGeoDiag.syntheticPointerDowns,\n          'Event properties read: ' + (Object.keys(__cribloGeoDiag.eventProperties).sort().join(', ') || 'none'),"
if s.count(old) != 1:
    raise SystemExit('diagnostic text mismatch')
s = s.replace(old, new, 1)

p.write_text(s)
