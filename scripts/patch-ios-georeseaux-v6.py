from pathlib import Path
import re

path = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
text = path.read_text()

# 1) Keep semantic long-press registrations and also capture contextmenu property-family events.
old_regex = "/^(contextmenu|longpress|long-press|hold|press)$/.test(name)"
new_regex = "/^(contextmenu|longpress|long-press|hold|press)$/.test(name)"
if old_regex not in text:
    raise SystemExit('listener capture block not found')

# 2) Replace the old event facade + contextmenu-only dispatcher.
start = text.find('      function compatibleContextEvent(target, currentTarget, x, y, sourceEvent) {')
end = text.find('      function clamp01(value) {', start)
if start < 0 or end < 0:
    raise SystemExit('captured handler section not found')

replacement = r'''      function listenerUsesCapture(options) {
        try {
          if (options === true) return true;
          return !!(options && typeof options === 'object' && options.capture === true);
        } catch (_) { return false; }
      }

      function compatibleSemanticEvent(type, target, currentTarget, x, y, sourceEvent) {
        var raw;
        try {
          raw = new MouseEvent(type === 'contextmenu' ? 'contextmenu' : 'mousemove', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: type === 'contextmenu' ? 2 : 0,
            buttons: type === 'contextmenu' ? 2 : 1,
            view: window
          });
        } catch (_) { raw = {}; }

        var prevented = false;
        var stopped = false;
        var immediate = false;
        var touch = null;
        try { touch = sourceEvent && sourceEvent.touches && sourceEvent.touches[0]; } catch (_) {}
        var touchPoint = {
          identifier: touch && touch.identifier != null ? touch.identifier : 1,
          target: target,
          clientX: x,
          clientY: y,
          pageX: x + (window.scrollX || 0),
          pageY: y + (window.scrollY || 0),
          screenX: x,
          screenY: y,
          radiusX: 4,
          radiusY: 4,
          rotationAngle: 0,
          force: 0.5
        };
        var composed = [];
        var n = target;
        while (n) { composed.push(n); n = n.parentNode; }
        if (composed.indexOf(document) < 0) composed.push(document);
        composed.push(window);

        var overrides = {
          type: type,
          target: target,
          srcElement: target,
          currentTarget: currentTarget,
          eventPhase: currentTarget === target ? 2 : 3,
          button: type === 'contextmenu' ? 2 : 0,
          buttons: type === 'contextmenu' ? 2 : 1,
          which: type === 'contextmenu' ? 3 : 1,
          clientX: x,
          clientY: y,
          pageX: x + (window.scrollX || 0),
          pageY: y + (window.scrollY || 0),
          screenX: x,
          screenY: y,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          isTrusted: !!(sourceEvent && sourceEvent.isTrusted),
          touches: [touchPoint],
          targetTouches: [touchPoint],
          changedTouches: [touchPoint],
          originalEvent: sourceEvent || raw,
          nativeEvent: sourceEvent || raw,
          srcEvent: sourceEvent || raw,
          preventDefault: function () {
            prevented = true;
            try { sourceEvent && sourceEvent.preventDefault && sourceEvent.preventDefault(); } catch (_) {}
          },
          stopPropagation: function () { stopped = true; },
          stopImmediatePropagation: function () { stopped = true; immediate = true; },
          composedPath: function () { return composed.slice(); }
        };
        try {
          return new Proxy(raw, {
            get: function (obj, prop) {
              if (prop === '__cribloPrevented') return prevented;
              if (prop === '__cribloStopped') return stopped;
              if (prop === '__cribloImmediate') return immediate;
              if (prop === 'defaultPrevented') return prevented;
              if (Object.prototype.hasOwnProperty.call(overrides, prop)) return overrides[prop];
              var value;
              try { value = Reflect.get(obj, prop, obj); } catch (_) { value = obj[prop]; }
              return typeof value === 'function' ? value.bind(obj) : value;
            }
          });
        } catch (_) {
          return raw;
        }
      }

      function callCapturedListener(entry, currentTarget, event) {
        try {
          if (typeof entry.listener === 'function') entry.listener.call(currentTarget, event);
          else if (entry.listener && typeof entry.listener.handleEvent === 'function') entry.listener.handleEvent(event);
          return true;
        } catch (_) { return false; }
      }

      function invokeCapturedSemanticHandlers(target, x, y, sourceEvent) {
        if (!target) return false;
        var path = [];
        var node = target;
        while (node) { path.push(node); node = node.parentNode; }
        if (path.indexOf(document) < 0) path.push(document);
        path.push(window);
        __cribloGeoDiag.capturedListeners = listenerCountOnPath(target);

        var semanticTypes = ['contextmenu', 'longpress', 'long-press', 'hold', 'press'];
        var invoked = false;

        for (var t = 0; t < semanticTypes.length; t++) {
          var eventType = semanticTypes[t];

          // Capture phase: only listeners that were actually registered with capture=true.
          for (var p = path.length - 1; p >= 0; p--) {
            var current = path[p];
            var captureEntries = __cribloCapturedListeners.get(current) || [];
            for (var i = 0; i < captureEntries.length; i++) {
              var captureEntry = captureEntries[i];
              if (captureEntry.type !== eventType || !listenerUsesCapture(captureEntry.options)) continue;
              var captureEvent = compatibleSemanticEvent(eventType, target, current, x, y, sourceEvent);
              if (callCapturedListener(captureEntry, current, captureEvent)) {
                invoked = true;
                __cribloGeoDiag.capturedCalls++;
              }
              if (captureEvent.__cribloImmediate) break;
              if (captureEvent.__cribloStopped) break;
            }
          }

          // Bubble phase: only capture=false listeners, exactly once.
          for (var b = 0; b < path.length; b++) {
            var bubbleCurrent = path[b];
            var bubbleEntries = __cribloCapturedListeners.get(bubbleCurrent) || [];
            for (var j = 0; j < bubbleEntries.length; j++) {
              var bubbleEntry = bubbleEntries[j];
              if (bubbleEntry.type !== eventType || listenerUsesCapture(bubbleEntry.options)) continue;
              var bubbleEvent = compatibleSemanticEvent(eventType, target, bubbleCurrent, x, y, sourceEvent);
              if (callCapturedListener(bubbleEntry, bubbleCurrent, bubbleEvent)) {
                invoked = true;
                __cribloGeoDiag.capturedCalls++;
              }
              if (bubbleEvent.__cribloImmediate) break;
              if (bubbleEvent.__cribloStopped) break;
            }
          }
        }

        // Property handlers are not visible through addEventListener interception.
        // Call each oncontextmenu property at most once along the real target path.
        for (var k = 0; k < path.length; k++) {
          try {
            var propertyTarget = path[k];
            if (propertyTarget && typeof propertyTarget.oncontextmenu === 'function') {
              propertyTarget.oncontextmenu(compatibleSemanticEvent('contextmenu', target, propertyTarget, x, y, sourceEvent));
              invoked = true;
              __cribloGeoDiag.capturedCalls++;
            }
          } catch (_) {}
        }
        return invoked;
      }

'''
text = text[:start] + replacement + text[end:]

# 3) Add exact map-instance registration before invokeMapEngine and deepen fallback scan.
marker = '      function invokeMapEngine(target, x, y, sourceEvent) {'
pos = text.find(marker)
if pos < 0:
    raise SystemExit('invokeMapEngine marker not found')
if '__cribloMapInstances' not in text:
    registry = r'''      var __cribloMapInstances = [];

      function rememberMapInstance(map) {
        try {
          if (map && __cribloMapInstances.indexOf(map) < 0) {
            __cribloMapInstances.push(map);
            if (__cribloMapInstances.length > 20) __cribloMapInstances.shift();
          }
        } catch (_) {}
      }

      function wrapMapConstructors() {
        try {
          if (window.L && typeof window.L.map === 'function' && !window.L.map.__cribloWrapped) {
            var originalLeafletMap = window.L.map;
            var wrappedLeafletMap = function () {
              var map = originalLeafletMap.apply(this, arguments);
              rememberMapInstance(map);
              return map;
            };
            try { Object.keys(originalLeafletMap).forEach(function (key) { wrappedLeafletMap[key] = originalLeafletMap[key]; }); } catch (_) {}
            wrappedLeafletMap.__cribloWrapped = true;
            window.L.map = wrappedLeafletMap;
          }
        } catch (_) {}

        try {
          if (window.ol && typeof window.ol.Map === 'function' && !window.ol.Map.__cribloWrapped) {
            var OriginalOlMap = window.ol.Map;
            var WrappedOlMap = new Proxy(OriginalOlMap, {
              construct: function (target, args, newTarget) {
                var map = Reflect.construct(target, args, newTarget);
                rememberMapInstance(map);
                return map;
              }
            });
            WrappedOlMap.__cribloWrapped = true;
            window.ol.Map = WrappedOlMap;
          }
        } catch (_) {}

        ['mapboxgl', 'maplibregl'].forEach(function (name) {
          try {
            var lib = window[name];
            if (!lib || typeof lib.Map !== 'function' || lib.Map.__cribloWrapped) return;
            var OriginalMap = lib.Map;
            var WrappedMap = new Proxy(OriginalMap, {
              construct: function (target, args, newTarget) {
                var map = Reflect.construct(target, args, newTarget);
                rememberMapInstance(map);
                return map;
              }
            });
            WrappedMap.__cribloWrapped = true;
            lib.Map = WrappedMap;
          } catch (_) {}
        });
      }

      wrapMapConstructors();
      var __cribloMapWrapTimer = setInterval(wrapMapConstructors, 20);
      setTimeout(function () { try { clearInterval(__cribloMapWrapTimer); } catch (_) {} }, 20000);

'''
    text = text[:pos] + registry + text[pos:]

text, count = re.subn(
    r'(function invokeMapEngine\(target, x, y, sourceEvent\) \{\s*)var values = safeObjectValues\(window, 2\);',
    r'\1var values = __cribloMapInstances.concat(safeObjectValues(window, 3));',
    text,
    count=1,
)
if count != 1:
    raise SystemExit('invokeMapEngine values replacement failed')

# 4) Dispatch every common semantic event, not only the custom `longpress` name.
old_custom = re.compile(r'''      function customLongPress\(target, x, y\) \{.*?\n      \}\n\n      function candidateElements''', re.S)
new_custom = r'''      function customLongPress(target, x, y) {
        ['longpress', 'long-press', 'hold', 'press'].forEach(function (name) {
          try {
            target.dispatchEvent(new CustomEvent(name, {
              bubbles: true,
              cancelable: true,
              composed: true,
              detail: { clientX: x, clientY: y, x: x, y: y, source: 'criblo-ios' }
            }));
          } catch (_) {}
        });
      }

      function candidateElements'''
text, count = old_custom.subn(new_custom, text, count=1)
if count != 1:
    raise SystemExit('custom long press replacement failed')

# 5) Adaptive success detection: do not stop merely because a callback was invoked.
fire_start = text.find('      function fireRealTouchLongPress() {')
fire_end_marker = "\n\n      document.addEventListener('touchstart',"
fire_end = text.find(fire_end_marker, fire_start)
if fire_start < 0 or fire_end < 0:
    raise SystemExit('fireRealTouchLongPress block not found')

new_fire = r'''      function visiblePopupState() {
        var selectors = [
          '[role="dialog"]', '[role="menu"]', '[role="tooltip"]',
          '.popup', '.popover', '.modal', '.contextmenu', '.context-menu',
          '.leaflet-popup', '.mapboxgl-popup', '.maplibregl-popup', '.esri-popup',
          '[class*="popup"]', '[class*="popover"]', '[class*="contextmenu"]',
          '[class*="context-menu"]', '[class*="dialog"]', '[class*="modal"]'
        ].join(',');
        var out = [];
        try {
          var nodes = document.querySelectorAll(selectors);
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var rect = node.getBoundingClientRect();
            var style = getComputedStyle(node);
            if (rect.width > 20 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0) {
              out.push({
                node: node,
                text: String(node.textContent || '').slice(0, 400),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              });
            }
          }
        } catch (_) {}
        return out;
      }

      function popupChanged(before) {
        var after = visiblePopupState();
        for (var i = 0; i < after.length; i++) {
          var now = after[i];
          var previous = null;
          for (var j = 0; j < before.length; j++) {
            if (before[j].node === now.node) { previous = before[j]; break; }
          }
          if (!previous) return true;
          if (previous.text !== now.text || previous.width !== now.width || previous.height !== now.height) return true;
        }
        return false;
      }

      function fireRealTouchLongPress() {
        realTouchTimer = null;
        if (!realTouchTarget) return;
        realTouchFired = true;
        lastRealTouchLongPressAt = Date.now();
        clearSelection();

        // Keep iOS text selection/callout from stealing a map hold.
        var styleNode = realTouchTarget;
        for (var s = 0; styleNode && s < 7; s++, styleNode = styleNode.parentElement) {
          try {
            styleNode.style.webkitUserSelect = 'none';
            styleNode.style.webkitTouchCallout = 'none';
            styleNode.style.userSelect = 'none';
          } catch (_) {}
        }

        var signature = String((realTouchTarget.tagName || '') + '#' + (realTouchTarget.id || '') + '.' + (realTouchTarget.className && (realTouchTarget.className.baseVal || realTouchTarget.className) || ''));
        __cribloGeoDiag.lastTarget = signature.slice(0, 180);
        __cribloGeoDiag.lastResult = 'trying';

        var before = visiblePopupState();
        var trustedTouch = window.__cribloLastTrustedTouchStart || null;

        // Stage 1: call GeoReseaux's own semantic handlers exactly once each.
        invokeCapturedSemanticHandlers(realTouchTarget, realTouchX, realTouchY, trustedTouch);

        setTimeout(function () {
          if (popupChanged(before)) {
            __cribloGeoDiag.lastResult = 'page-handler-popup';
            return;
          }

          // Stage 2: map engine API (OpenLayers/Leaflet/Mapbox/ArcGIS).
          invokeMapEngine(realTouchTarget, realTouchX, realTouchY, trustedTouch);

          setTimeout(function () {
            if (popupChanged(before)) {
              __cribloGeoDiag.lastResult = 'map-engine-popup';
              return;
            }

            // Stage 3: ordinary DOM contextmenu + semantic custom events.
            dispatchToTarget(realTouchTarget, realTouchX, realTouchY);
            var parent = realTouchTarget.parentElement;
            for (var i = 0; parent && i < 7; i++, parent = parent.parentElement) {
              dispatchToTarget(parent, realTouchX, realTouchY);
            }

            setTimeout(function () {
              if (popupChanged(before)) {
                __cribloGeoDiag.lastResult = 'dom-popup';
                return;
              }

              // Stage 4: emulate Android's held touch for libraries with their own timer.
              scheduleAndroidTouchFallback(realTouchTarget, realTouchX, realTouchY);
              __cribloGeoDiag.lastResult = 'android-hold-fallback';
            }, 140);
          }, 120);
        }, 100);
      }'''
text = text[:fire_start] + new_fire + text[fire_end:]

# 6) Diagnostic tells us the actual stage rather than only whether a function ran.
if "lastResult: 'not-run'" not in text:
    text = text.replace("lastTarget: '',\n", "lastTarget: '',\n        lastResult: 'not-run',\n", 1)

engine_line = "          'Engine calls: ' + __cribloGeoDiag.engineCalls,\n"
if "Registered map instances" not in text and engine_line in text:
    text = text.replace(
        engine_line,
        engine_line + "          'Registered map instances: ' + __cribloMapInstances.length,\n          'Last result: ' + __cribloGeoDiag.lastResult,\n",
        1,
    )

# 7) Reduce UIKit's own touch delay. Do not cancel the web page's real touch stream.
scroll_line = '        webView.scrollView.keyboardDismissMode = .interactive\n'
if 'webView.scrollView.delaysContentTouches = false' not in text:
    if scroll_line not in text:
        raise SystemExit('WKWebView scroll anchor not found')
    text = text.replace(scroll_line, scroll_line + '        webView.scrollView.delaysContentTouches = false\n', 1)

path.write_text(text)
print('GeoReseaux v6 patch applied')
