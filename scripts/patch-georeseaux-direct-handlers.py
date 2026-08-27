from pathlib import Path

path = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
text = path.read_text()

install_marker = "      window.__cribloLongPressInstalled = true;\n"
if install_marker not in text:
    raise SystemExit('long press install marker not found')

capture = r'''

      // Capture the page's own long-press/context handlers as they are
      // registered. On iOS WebKit a synthetic dispatchEvent is always
      // isTrusted=false; calling the already-registered application handler
      // directly avoids depending on WebKit manufacturing an Android-style
      // trusted contextmenu event.
      var __cribloCapturedListeners = new WeakMap();
      var __cribloOriginalAddEventListener = EventTarget.prototype.addEventListener;
      try {
        EventTarget.prototype.addEventListener = function (type, listener, options) {
          try {
            var name = String(type || '').toLowerCase();
            if (listener && /^(contextmenu|longpress|long-press|hold|press)$/.test(name)) {
              var list = __cribloCapturedListeners.get(this);
              if (!list) { list = []; __cribloCapturedListeners.set(this, list); }
              if (!list.some(function (entry) { return entry.type === name && entry.listener === listener; })) {
                list.push({ type: name, listener: listener, options: options });
              }
            }
          } catch (_) {}
          return __cribloOriginalAddEventListener.apply(this, arguments);
        };
      } catch (_) {}

      var __cribloGeoDiag = {
        capturedCalls: 0,
        capturedListeners: 0,
        engine: 'none',
        engineCalls: 0,
        lastTarget: '',
        lastResult: 'not-run'
      };

      function listenerCountOnPath(target) {
        var count = 0;
        var node = target;
        var seen = [];
        while (node) {
          seen.push(node);
          var list = __cribloCapturedListeners.get(node) || [];
          count += list.length;
          node = node.parentNode;
        }
        try {
          var dl = __cribloCapturedListeners.get(document) || [];
          if (seen.indexOf(document) < 0) count += dl.length;
          var wl = __cribloCapturedListeners.get(window) || [];
          count += wl.length;
        } catch (_) {}
        return count;
      }

      function compatibleContextEvent(target, currentTarget, x, y, sourceEvent) {
        var raw;
        try {
          raw = new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, screenX: x, screenY: y,
            button: 2, buttons: 2, view: window
          });
        } catch (_) { raw = {}; }

        var prevented = false;
        var stopped = false;
        var immediate = false;
        var overrides = {
          type: 'contextmenu', target: target, srcElement: target,
          currentTarget: currentTarget, eventPhase: currentTarget === target ? 2 : 3,
          button: 2, buttons: 2, which: 3,
          clientX: x, clientY: y, pageX: x + (window.scrollX || 0),
          pageY: y + (window.scrollY || 0), screenX: x, screenY: y,
          isTrusted: true,
          preventDefault: function () { prevented = true; try { sourceEvent && sourceEvent.preventDefault && sourceEvent.preventDefault(); } catch (_) {} },
          stopPropagation: function () { stopped = true; },
          stopImmediatePropagation: function () { stopped = true; immediate = true; },
          composedPath: function () {
            var path = []; var n = target;
            while (n) { path.push(n); n = n.parentNode; }
            path.push(window); return path;
          }
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
          Object.keys(overrides).forEach(function (key) { try { raw[key] = overrides[key]; } catch (_) {} });
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

      function invokeCapturedContextMenu(target, x, y, sourceEvent) {
        if (!target) return false;
        var path = [];
        var node = target;
        while (node) { path.push(node); node = node.parentNode; }
        if (path.indexOf(document) < 0) path.push(document);
        path.push(window);
        __cribloGeoDiag.capturedListeners = listenerCountOnPath(target);

        var invoked = false;
        // Native contextmenu capture phase: window/document/ancestors -> target.
        for (var p = path.length - 1; p >= 0; p--) {
          var current = path[p];
          var entries = __cribloCapturedListeners.get(current) || [];
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].type !== 'contextmenu') continue;
            var event = compatibleContextEvent(target, current, x, y, sourceEvent);
            if (callCapturedListener(entries[i], current, event)) {
              invoked = true; __cribloGeoDiag.capturedCalls++;
              if (event.__cribloImmediate || event.__cribloStopped) return true;
              if (event.__cribloPrevented) return true;
            }
          }
        }
        // Bubble phase: target -> window.
        for (var b = 0; b < path.length; b++) {
          var bubbleCurrent = path[b];
          var bubbleEntries = __cribloCapturedListeners.get(bubbleCurrent) || [];
          for (var j = 0; j < bubbleEntries.length; j++) {
            if (bubbleEntries[j].type !== 'contextmenu') continue;
            var bubbleEvent = compatibleContextEvent(target, bubbleCurrent, x, y, sourceEvent);
            if (callCapturedListener(bubbleEntries[j], bubbleCurrent, bubbleEvent)) {
              invoked = true; __cribloGeoDiag.capturedCalls++;
              if (bubbleEvent.__cribloImmediate || bubbleEvent.__cribloStopped) return true;
              if (bubbleEvent.__cribloPrevented) return true;
            }
          }
        }
        try {
          if (typeof target.oncontextmenu === 'function') {
            var directEvent = compatibleContextEvent(target, target, x, y, sourceEvent);
            target.oncontextmenu(directEvent);
            __cribloGeoDiag.capturedCalls++;
            invoked = true;
          }
        } catch (_) {}
        return invoked;
      }
'''
text = text.replace(install_marker, install_marker + capture, 1)

adapter_marker = "      function dispatchToTarget(target, x, y) {\n"
if adapter_marker not in text:
    raise SystemExit('dispatchToTarget marker not found')

adapters = r'''
      function viewportPoint(element, x, y) {
        try {
          var rect = element && element.getBoundingClientRect && element.getBoundingClientRect();
          if (!rect) return [x, y];
          return [x - rect.left, y - rect.top];
        } catch (_) { return [x, y]; }
      }

      function safeObjectValues(root, maxDepth) {
        var found = [];
        var queue = [{ value: root, depth: 0 }];
        var seen = [];
        while (queue.length && found.length < 500) {
          var item = queue.shift();
          var value = item.value;
          if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
          if (seen.indexOf(value) >= 0) continue;
          seen.push(value); found.push(value);
          if (item.depth >= maxDepth) continue;
          var names = [];
          try { names = Object.getOwnPropertyNames(value).slice(0, 80); } catch (_) {}
          for (var i = 0; i < names.length; i++) {
            try {
              var descriptor = Object.getOwnPropertyDescriptor(value, names[i]);
              if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
              var child = descriptor.value;
              if (!child || child === window || child === document || child === value) continue;
              if (typeof child === 'object' || typeof child === 'function') queue.push({ value: child, depth: item.depth + 1 });
            } catch (_) {}
          }
        }
        return found;
      }

      function invokeMapEngine(target, x, y, sourceEvent) {
        var values = safeObjectValues(window, 2);
        for (var i = 0; i < values.length; i++) {
          var map = values[i];
          try {
            // OpenLayers Map
            if (map && typeof map.getViewport === 'function' && typeof map.getCoordinateFromPixel === 'function' && typeof map.dispatchEvent === 'function') {
              var viewport = map.getViewport();
              if (!viewport || !(viewport === target || (viewport.contains && viewport.contains(target)))) continue;
              var pixel = viewportPoint(viewport, x, y);
              var coordinate = map.getCoordinateFromPixel(pixel);
              var original = compatibleContextEvent(target, viewport, x, y, sourceEvent);
              var payload = { type: 'contextmenu', map: map, pixel: pixel, coordinate: coordinate, dragging: false, originalEvent: original };
              map.dispatchEvent(payload);
              try { map.dispatchEvent({ type: 'longpress', map: map, pixel: pixel, coordinate: coordinate, dragging: false, originalEvent: original }); } catch (_) {}
              try { map.dispatchEvent({ type: 'hold', map: map, pixel: pixel, coordinate: coordinate, dragging: false, originalEvent: original }); } catch (_) {}
              __cribloGeoDiag.engine = 'OpenLayers'; __cribloGeoDiag.engineCalls++; return true;
            }

            // Leaflet Map
            if (map && map._container && typeof map.containerPointToLatLng === 'function' && typeof map.fire === 'function') {
              var container = map._container;
              if (!(container === target || (container.contains && container.contains(target)))) continue;
              var cp = viewportPoint(container, x, y);
              var latlng = map.containerPointToLatLng(cp);
              var lp = typeof map.containerPointToLayerPoint === 'function' ? map.containerPointToLayerPoint(cp) : cp;
              var le = compatibleContextEvent(target, container, x, y, sourceEvent);
              map.fire('contextmenu', { latlng: latlng, containerPoint: cp, layerPoint: lp, originalEvent: le });
              try { map.fire('longpress', { latlng: latlng, containerPoint: cp, layerPoint: lp, originalEvent: le }); } catch (_) {}
              try { map.fire('hold', { latlng: latlng, containerPoint: cp, layerPoint: lp, originalEvent: le }); } catch (_) {}
              __cribloGeoDiag.engine = 'Leaflet'; __cribloGeoDiag.engineCalls++; return true;
            }

            // Mapbox GL / MapLibre GL
            if (map && typeof map.getCanvas === 'function' && typeof map.unproject === 'function' && typeof map.fire === 'function') {
              var canvas = map.getCanvas();
              if (!canvas || !(canvas === target || (canvas.contains && canvas.contains(target)) || (canvas.parentElement && canvas.parentElement.contains && canvas.parentElement.contains(target)))) continue;
              var mp = viewportPoint(canvas, x, y);
              var lngLat = map.unproject(mp);
              var me = compatibleContextEvent(target, canvas, x, y, sourceEvent);
              map.fire('contextmenu', { point: { x: mp[0], y: mp[1] }, lngLat: lngLat, originalEvent: me });
              try { map.fire('longpress', { point: { x: mp[0], y: mp[1] }, lngLat: lngLat, originalEvent: me }); } catch (_) {}
              __cribloGeoDiag.engine = 'Mapbox/MapLibre'; __cribloGeoDiag.engineCalls++; return true;
            }

            // ArcGIS JS MapView / SceneView
            if (map && map.container && typeof map.toMap === 'function' && typeof map.emit === 'function') {
              var ac = map.container;
              if (!(ac === target || (ac.contains && ac.contains(target)))) continue;
              var ap = viewportPoint(ac, x, y);
              var mapPoint = map.toMap({ x: ap[0], y: ap[1] });
              map.emit('hold', { x: ap[0], y: ap[1], mapPoint: mapPoint, button: 2, native: sourceEvent });
              try { map.emit('contextmenu', { x: ap[0], y: ap[1], mapPoint: mapPoint, button: 2, native: sourceEvent }); } catch (_) {}
              __cribloGeoDiag.engine = 'ArcGIS'; __cribloGeoDiag.engineCalls++; return true;
            }
          } catch (_) {}
        }
        return false;
      }

'''
text = text.replace(adapter_marker, adapters + adapter_marker, 1)

old_fire = r'''        // Deliver the context menu to the exact DOM/SVG/canvas layer that
        // received the real iPhone touchstart. This avoids coordinate/iframe
        // drift from the native WebView gesture recognizer.
        var handled = dispatchToTarget(realTouchTarget, realTouchX, realTouchY);'''
new_fire = r'''        var signature = String((realTouchTarget.tagName || '') + '#' + (realTouchTarget.id || '') + '.' + (realTouchTarget.className && (realTouchTarget.className.baseVal || realTouchTarget.className) || ''));
        __cribloGeoDiag.lastTarget = signature.slice(0, 180);

        // First call GeoReseaux's own registered handler directly. This is the
        // key difference from previous builds: the page's callback receives a
        // right-click-like event facade with isTrusted=true rather than a
        // synthetic event dispatched by WebKit.
        var handled = invokeCapturedContextMenu(realTouchTarget, realTouchX, realTouchY, window.__cribloLastTrustedTouchStart || null);

        // Then call the map engine API itself when discoverable. This bypasses
        // browser context-menu generation completely.
        if (!handled) handled = invokeMapEngine(realTouchTarget, realTouchX, realTouchY, window.__cribloLastTrustedTouchStart || null);

        // DOM event injection remains only as a compatibility fallback.
        if (!handled) handled = dispatchToTarget(realTouchTarget, realTouchX, realTouchY);'''
if old_fire not in text:
    raise SystemExit('real touch fire block not found')
text = text.replace(old_fire, new_fire, 1)

old_touch = r'''          realTouchTarget = target;
          realTouchX = touch.clientX;'''
new_touch = r'''          realTouchTarget = target;
          // Keep a reference to the genuine WebKit touchstart event. We never
          // mutate it; it is used only as the source for the direct handler
          // facade so GeoReseaux can read real touch metadata if needed.
          window.__cribloLastTrustedTouchStart = event;
          realTouchX = touch.clientX;'''
if old_touch not in text:
    raise SystemExit('touchstart assignment block not found')
text = text.replace(old_touch, new_touch, 1)

end_marker = r'''      window.__cribloNativeFallbackLongPress = function (rx, ry) {
        if (Date.now() - lastRealTouchLongPressAt < 1200) return true;
        return window.__cribloDispatchLongPress(rx, ry);
      };'''
end_replacement = end_marker + r'''

      window.__cribloGeoDiagnosticsText = function () {
        var engineHints = [];
        try { if (window.L) engineHints.push('L'); } catch (_) {}
        try { if (window.ol) engineHints.push('ol'); } catch (_) {}
        try { if (window.mapboxgl) engineHints.push('mapboxgl'); } catch (_) {}
        try { if (window.maplibregl) engineHints.push('maplibregl'); } catch (_) {}
        return [
          'URL: ' + String(location.href || '').slice(0, 180),
          'Target: ' + (__cribloGeoDiag.lastTarget || 'none'),
          'Captured context handlers on path: ' + __cribloGeoDiag.capturedListeners,
          'Direct handler calls: ' + __cribloGeoDiag.capturedCalls,
          'Detected engine: ' + __cribloGeoDiag.engine,
          'Engine calls: ' + __cribloGeoDiag.engineCalls,
          'Global hints: ' + (engineHints.join(', ') || 'none'),
          'UA Android compatibility: ' + String(!!window.__cribloGeoReseauxAndroidCompat)
        ].join('\n');
      };'''
if end_marker not in text:
    raise SystemExit('export end marker not found')
text = text.replace(end_marker, end_replacement, 1)

more_marker = '''        controller.addAction(UIAlertAction(title: "Ouvrir dans Safari", style: .default) { [weak self] _ in'''
more_insert = '''        controller.addAction(UIAlertAction(title: "Diagnostic GeoReseaux", style: .default) { [weak self] _ in
            self?.showGeoDiagnostics()
        })
'''
if more_marker not in text:
    raise SystemExit('more menu marker not found')
text = text.replace(more_marker, more_insert + more_marker, 1)

method_marker = '''    private func showHistory() {'''
method = '''    private func showGeoDiagnostics() {
        let script = "window.__cribloGeoDiagnosticsText ? window.__cribloGeoDiagnosticsText() : 'Diagnostic GeoReseaux indisponible sur cette page.'"
        webView.evaluateJavaScript(script) { [weak self] result, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                let message = (result as? String) ?? "Aucune information de diagnostic disponible."
                let controller = UIAlertController(title: "Diagnostic GeoReseaux", message: message, preferredStyle: .alert)
                controller.addAction(UIAlertAction(title: "OK", style: .default))
                self.present(controller, animated: true)
            }
        }
    }

'''
if method_marker not in text:
    raise SystemExit('history method marker not found')
text = text.replace(method_marker, method + method_marker, 1)

path.write_text(text)
