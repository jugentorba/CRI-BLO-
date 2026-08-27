from pathlib import Path
import re

path = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
text = path.read_text()

text = text.replace('longPress.minimumPressDuration = 0.48', 'longPress.minimumPressDuration = 0.72')
text = text.replace(
    'let script = "window.__cribloDispatchLongPress && window.__cribloDispatchLongPress(\\(rx), \\(ry));"',
    'let script = "window.__cribloNativeFallbackLongPress && window.__cribloNativeFallbackLongPress(\\(rx), \\(ry));"'
)

old_context = re.compile(r'''      function contextMenu\(target, x, y\) \{.*?\n      \}\n\n      function jqueryContextMenu''', re.S)
new_context = r'''      function contextMenu(target, x, y) {
        // iOS map libraries are more compatible with a real MouseEvent here
        // than with PointerEvent('contextmenu'). This mirrors the established
        // Leaflet/OpenLayers iOS long-touch workaround.
        try {
          var event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: 2,
            buttons: 2,
            view: window
          });
          return !target.dispatchEvent(event) || event.defaultPrevented;
        } catch (_) {
          return mouse(target, 'contextmenu', x, y, 2, 2);
        }
      }

      function jqueryContextMenu'''
text, count = old_context.subn(new_context, text, count=1)
if count != 1:
    raise SystemExit('Could not replace contextMenu function')

marker = "      window.addEventListener('message', function (event) {"
if marker not in text:
    raise SystemExit('Could not find message-listener insertion point')

touch_bridge = r'''      var realTouchTimer = null;
      var realTouchTarget = null;
      var realTouchX = 0;
      var realTouchY = 0;
      var realTouchIdentifier = null;
      var realTouchFired = false;
      var lastRealTouchLongPressAt = 0;

      function clearRealTouchTimer() {
        if (realTouchTimer) {
          clearTimeout(realTouchTimer);
          realTouchTimer = null;
        }
      }

      function mapLikeTarget(target) {
        if (!target || target.nodeType !== 1) return false;
        var tag = String(target.tagName || '').toUpperCase();
        if (/^(CANVAS|SVG|PATH|CIRCLE|RECT|LINE|POLYLINE|POLYGON|USE)$/.test(tag)) return true;
        var node = target;
        for (var i = 0; node && i < 8; i++, node = node.parentElement) {
          var signature = String((node.id || '') + ' ' + (node.className && (node.className.baseVal || node.className) || '')).toLowerCase();
          if (/leaflet|ol-|openlayers|mapbox|maplibre|esri|map|carte|geo|viewer|canvas/.test(signature)) return true;
        }
        return false;
      }

      function touchByIdentifier(event) {
        var touches = (event && event.touches) || [];
        for (var i = 0; i < touches.length; i++) {
          if (realTouchIdentifier === null || touches[i].identifier === realTouchIdentifier) return touches[i];
        }
        return null;
      }

      function fireRealTouchLongPress() {
        realTouchTimer = null;
        if (!realTouchTarget) return;
        realTouchFired = true;
        lastRealTouchLongPressAt = Date.now();
        clearSelection();

        // Deliver the context menu to the exact DOM/SVG/canvas layer that
        // received the real iPhone touchstart. This avoids coordinate/iframe
        // drift from the native WebView gesture recognizer.
        var handled = dispatchToTarget(realTouchTarget, realTouchX, realTouchY);

        // Enterprise map shells sometimes stop contextmenu propagation. Try a
        // short ancestor chain as a compatibility fallback.
        if (!handled) {
          var parent = realTouchTarget.parentElement;
          for (var i = 0; parent && i < 6; i++, parent = parent.parentElement) {
            if (dispatchToTarget(parent, realTouchX, realTouchY)) {
              handled = true;
              break;
            }
          }
        }

        if (!handled) dispatchAt(realTouchX, realTouchY);
      }

      document.addEventListener('touchstart', function (event) {
        try {
          if (!event || !event.touches || event.touches.length !== 1) return;
          var touch = event.touches[0];
          var target = event.target;
          if (!mapLikeTarget(target)) return;

          clearRealTouchTimer();
          realTouchTarget = target;
          realTouchX = touch.clientX;
          realTouchY = touch.clientY;
          realTouchIdentifier = touch.identifier;
          realTouchFired = false;
          realTouchTimer = setTimeout(fireRealTouchLongPress, 560);
        } catch (_) {}
      }, { capture: true, passive: true });

      document.addEventListener('touchmove', function (event) {
        try {
          if (!realTouchTimer) return;
          var touch = touchByIdentifier(event);
          if (!touch) { clearRealTouchTimer(); return; }
          var dx = touch.clientX - realTouchX;
          var dy = touch.clientY - realTouchY;
          if ((dx * dx + dy * dy) > 144) clearRealTouchTimer();
        } catch (_) { clearRealTouchTimer(); }
      }, { capture: true, passive: true });

      document.addEventListener('touchcancel', function () {
        clearRealTouchTimer();
        realTouchTarget = null;
        realTouchIdentifier = null;
      }, true);

      document.addEventListener('touchend', function (event) {
        var fired = realTouchFired;
        clearRealTouchTimer();
        realTouchTarget = null;
        realTouchIdentifier = null;
        realTouchFired = false;
        if (fired) {
          try { event.preventDefault(); } catch (_) {}
        }
      }, { capture: true, passive: false });

'''
text = text.replace(marker, touch_bridge + marker, 1)

old_end = r'''      window.__cribloDispatchLongPress = function (rx, ry) {
        return dispatchAt(
          window.innerWidth * clamp01(rx),
          window.innerHeight * clamp01(ry)
        );
      };'''
new_end = r'''      window.__cribloDispatchLongPress = function (rx, ry) {
        return dispatchAt(
          window.innerWidth * clamp01(rx),
          window.innerHeight * clamp01(ry)
        );
      };

      window.__cribloNativeFallbackLongPress = function (rx, ry) {
        if (Date.now() - lastRealTouchLongPressAt < 1200) return true;
        return window.__cribloDispatchLongPress(rx, ry);
      };'''
if old_end not in text:
    raise SystemExit('Could not find long-press export block')
text = text.replace(old_end, new_end, 1)

path.write_text(text)
