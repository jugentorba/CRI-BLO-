from pathlib import Path

path = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
text = path.read_text()

old_diag = '''      var __cribloGeoDiag = {
        capturedCalls: 0,
        capturedListeners: 0,
        engine: 'none',
        engineCalls: 0,
        lastTarget: '',
        lastResult: 'not-run'
      };
'''
new_diag = '''      var __cribloGeoDiag = {
        capturedCalls: 0,
        semanticCalls: 0,
        capturedListeners: 0,
        engine: 'none',
        engineCalls: 0,
        registry: [],
        lastTarget: '',
        lastResult: 'not-run'
      };

      // Register actual map instances at construction time. Frameworks often
      // hide the map inside closures, so a later scan of window cannot find it.
      // The CRI-BLO bridge runs at document start, which lets us wrap the common
      // map constructors before GeoReseaux creates its map.
      var __cribloMapRegistry = [];
      function registerMapInstance(map, engine) {
        try {
          if (!map || __cribloMapRegistry.some(function (entry) { return entry.map === map; })) return map;
          __cribloMapRegistry.push({ map: map, engine: engine });
          __cribloGeoDiag.registry = __cribloMapRegistry.map(function (entry) { return entry.engine; });
        } catch (_) {}
        return map;
      }

      function wrapConstructor(owner, key, engine) {
        try {
          if (!owner || !owner[key] || owner[key].__cribloWrapped) return;
          var Original = owner[key];
          if (typeof Original !== 'function') return;
          var Wrapped;
          if (typeof Proxy === 'function' && typeof Reflect === 'object' && Reflect.construct) {
            Wrapped = new Proxy(Original, {
              construct: function (target, args, newTarget) {
                return registerMapInstance(Reflect.construct(target, args, newTarget), engine);
              },
              apply: function (target, thisArg, args) {
                return registerMapInstance(Reflect.apply(target, thisArg, args), engine);
              }
            });
          } else {
            Wrapped = function () {
              var args = Array.prototype.slice.call(arguments);
              var Bound = Function.prototype.bind.apply(Original, [null].concat(args));
              return registerMapInstance(new Bound(), engine);
            };
            try { Wrapped.prototype = Original.prototype; } catch (_) {}
          }
          try { Object.defineProperty(Wrapped, '__cribloWrapped', { value: true }); } catch (_) { Wrapped.__cribloWrapped = true; }
          owner[key] = Wrapped;
        } catch (_) {}
      }

      function wrapLeafletFactory() {
        try {
          if (!window.L || typeof window.L.map !== 'function' || window.L.map.__cribloWrapped) return;
          var original = window.L.map;
          var wrapped = function () { return registerMapInstance(original.apply(this, arguments), 'Leaflet'); };
          try { Object.defineProperty(wrapped, '__cribloWrapped', { value: true }); } catch (_) { wrapped.__cribloWrapped = true; }
          window.L.map = wrapped;
        } catch (_) {}
      }

      function installMapHooks() {
        try { wrapLeafletFactory(); } catch (_) {}
        try { if (window.ol) wrapConstructor(window.ol, 'Map', 'OpenLayers'); } catch (_) {}
        try { if (window.mapboxgl) wrapConstructor(window.mapboxgl, 'Map', 'Mapbox'); } catch (_) {}
        try { if (window.maplibregl) wrapConstructor(window.maplibregl, 'Map', 'MapLibre'); } catch (_) {}
      }
      installMapHooks();
      var __cribloHookTicks = 0;
      var __cribloHookTimer = setInterval(function () {
        installMapHooks();
        __cribloHookTicks++;
        if (__cribloHookTicks > 400) clearInterval(__cribloHookTimer);
      }, 50);
'''
if old_diag not in text:
    raise SystemExit('diagnostic block not found')
text = text.replace(old_diag, new_diag, 1)

needle = '''      function clamp01(value) {
'''
semantic = '''      function invokeCapturedSemanticLongPress(target, x, y, sourceEvent) {
        if (!target) return false;
        var path = [];
        var node = target;
        while (node) { path.push(node); node = node.parentNode; }
        if (path.indexOf(document) < 0) path.push(document);
        path.push(window);
        var semanticTypes = ['longpress', 'long-press', 'hold', 'press'];
        var invoked = false;

        for (var p = path.length - 1; p >= 0; p--) {
          var current = path[p];
          var entries = __cribloCapturedListeners.get(current) || [];
          for (var i = 0; i < entries.length; i++) {
            if (semanticTypes.indexOf(entries[i].type) < 0) continue;
            var event = compatibleContextEvent(target, current, x, y, sourceEvent);
            try {
              event = new Proxy(event, {
                get: function (obj, prop) {
                  if (prop === 'type') return entries[i] && entries[i].type || 'longpress';
                  if (prop === 'detail') return { clientX: x, clientY: y, source: 'criblo-ios-real-touch' };
                  return obj[prop];
                }
              });
            } catch (_) {}
            if (callCapturedListener(entries[i], current, event)) {
              invoked = true;
              __cribloGeoDiag.semanticCalls++;
            }
          }
        }
        for (var b = 0; b < path.length; b++) {
          var bubbleCurrent = path[b];
          var bubbleEntries = __cribloCapturedListeners.get(bubbleCurrent) || [];
          for (var j = 0; j < bubbleEntries.length; j++) {
            if (semanticTypes.indexOf(bubbleEntries[j].type) < 0) continue;
            var bubbleEvent = compatibleContextEvent(target, bubbleCurrent, x, y, sourceEvent);
            try {
              var semanticType = bubbleEntries[j].type;
              bubbleEvent = new Proxy(bubbleEvent, {
                get: function (obj, prop) {
                  if (prop === 'type') return semanticType;
                  if (prop === 'detail') return { clientX: x, clientY: y, source: 'criblo-ios-real-touch' };
                  return obj[prop];
                }
              });
            } catch (_) {}
            if (callCapturedListener(bubbleEntries[j], bubbleCurrent, bubbleEvent)) {
              invoked = true;
              __cribloGeoDiag.semanticCalls++;
            }
          }
        }
        return invoked;
      }

'''
if needle not in text:
    raise SystemExit('clamp insertion point not found')
text = text.replace(needle, semantic + needle, 1)

old_values = '''      function invokeMapEngine(target, x, y, sourceEvent) {
        var values = safeObjectValues(window, 2);
        for (var i = 0; i < values.length; i++) {
          var map = values[i];
'''
new_values = '''      function invokeMapEngine(target, x, y, sourceEvent) {
        installMapHooks();
        var values = [];
        for (var r = 0; r < __cribloMapRegistry.length; r++) values.push(__cribloMapRegistry[r].map);
        var scanned = safeObjectValues(window, 3);
        for (var s = 0; s < scanned.length; s++) {
          if (values.indexOf(scanned[s]) < 0) values.push(scanned[s]);
        }
        for (var i = 0; i < values.length; i++) {
          var map = values[i];
'''
if old_values not in text:
    raise SystemExit('invokeMapEngine opening not found')
text = text.replace(old_values, new_values, 1)

old_fire = '''        var handled = invokeCapturedContextMenu(realTouchTarget, realTouchX, realTouchY, window.__cribloLastTrustedTouchStart || null);

        // Then call the map engine API itself when discoverable. This bypasses
        // browser context-menu generation completely.
        if (!handled) handled = invokeMapEngine(realTouchTarget, realTouchX, realTouchY, window.__cribloLastTrustedTouchStart || null);

        // DOM event injection remains only as a compatibility fallback.
        if (!handled) handled = dispatchToTarget(realTouchTarget, realTouchX, realTouchY);
'''
new_fire = '''        var handledContext = invokeCapturedContextMenu(realTouchTarget, realTouchX, realTouchY, window.__cribloLastTrustedTouchStart || null);
        var handledSemantic = invokeCapturedSemanticLongPress(realTouchTarget, realTouchX, realTouchY, window.__cribloLastTrustedTouchStart || null);

        // Always call the registered map engine too. v5 incorrectly skipped this
        // whenever *any* context listener returned, even when that listener was a
        // generic shell handler that never opened the GeoReseaux feature popup.
        var handledEngine = invokeMapEngine(realTouchTarget, realTouchX, realTouchY, window.__cribloLastTrustedTouchStart || null);
        var handled = handledContext || handledSemantic || handledEngine;

        // DOM event injection remains only as a compatibility fallback.
        if (!handled) handled = dispatchToTarget(realTouchTarget, realTouchX, realTouchY);
'''
if old_fire not in text:
    raise SystemExit('fire long press block not found')
text = text.replace(old_fire, new_fire, 1)

old_diag_lines = '''          'Captured context handlers on path: ' + __cribloGeoDiag.capturedListeners,
          'Direct handler calls: ' + __cribloGeoDiag.capturedCalls,
          'Detected engine: ' + __cribloGeoDiag.engine,
          'Engine calls: ' + __cribloGeoDiag.engineCalls,
          'Global hints: ' + (engineHints.join(', ') || 'none'),
'''
new_diag_lines = '''          'Captured handlers on path: ' + __cribloGeoDiag.capturedListeners,
          'Context handler calls: ' + __cribloGeoDiag.capturedCalls,
          'Hold/longpress handler calls: ' + __cribloGeoDiag.semanticCalls,
          'Registered maps: ' + (__cribloGeoDiag.registry.join(', ') || 'none'),
          'Detected engine: ' + __cribloGeoDiag.engine,
          'Engine calls: ' + __cribloGeoDiag.engineCalls,
          'Global hints: ' + (engineHints.join(', ') || 'none'),
'''
if old_diag_lines not in text:
    raise SystemExit('diagnostic lines block not found')
text = text.replace(old_diag_lines, new_diag_lines, 1)

path.write_text(text)
