import fs from 'node:fs';

const swiftPath = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';
const testPath = 'scripts/test-ios-longpress-bridge.mjs';

function replaceOnce(text, label, from, to) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`${label}: source block not found`);
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(`${label}: source block not unique`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

let swift = fs.readFileSync(swiftPath, 'utf8');

swift = replaceOnce(
  swift,
  'install OpenLayers bind recovery',
  `      var __cribloOriginalAddEventListener = EventTarget.prototype.addEventListener;\n      var __cribloOriginalRemoveEventListener = EventTarget.prototype.removeEventListener;`,
  `      var __cribloOriginalAddEventListener = EventTarget.prototype.addEventListener;\n      var __cribloOriginalRemoveEventListener = EventTarget.prototype.removeEventListener;\n\n      // GeoReseaux bundles OpenLayers inside Angular modules, so there is no\n      // reliable window.ol global to discover. OpenLayers itself creates its\n      // viewport callback with: this.handleBrowserEvent.bind(this). Intercept\n      // that exact bind once, capture the real Map instance, then immediately\n      // restore Function.prototype.bind so the application runs normally.\n      var __cribloOriginalBind = Function.prototype.bind;\n      var __cribloPatchedBind = null;\n      var __cribloBindHookTimer = null;\n      var __cribloBoundOpenLayersMaps = new WeakMap();\n\n      function looksLikeOpenLayersMap(value) {\n        try {\n          return !!value\n            && typeof value.getViewport === 'function'\n            && typeof value.getView === 'function'\n            && typeof value.getCoordinateFromPixel === 'function'\n            && typeof value.handleBrowserEvent === 'function';\n        } catch (_) { return false; }\n      }\n\n      function restoreOpenLayersBindHook() {\n        try {\n          if (__cribloPatchedBind && Function.prototype.bind === __cribloPatchedBind) {\n            Function.prototype.bind = __cribloOriginalBind;\n          }\n          if (__cribloBindHookTimer) clearTimeout(__cribloBindHookTimer);\n        } catch (_) {}\n        __cribloBindHookTimer = null;\n      }\n\n      function installOpenLayersBindHook() {\n        try {\n          if (__cribloPatchedBind) return;\n          __cribloPatchedBind = function () {\n            var bound = __cribloOriginalBind.apply(this, arguments);\n            try {\n              var thisArg = arguments.length ? arguments[0] : null;\n              if (looksLikeOpenLayersMap(thisArg) && this === thisArg.handleBrowserEvent) {\n                __cribloBoundOpenLayersMaps.set(bound, thisArg);\n                registerMapInstance(thisArg, 'OpenLayers-bound');\n                restoreOpenLayersBindHook();\n              }\n            } catch (_) {}\n            return bound;\n          };\n          Function.prototype.bind = __cribloPatchedBind;\n          // Safety valve only. A normal GeoReseaux map is constructed within\n          // seconds; never leave a global prototype hook installed indefinitely.\n          __cribloBindHookTimer = setTimeout(restoreOpenLayersBindHook, 30000);\n        } catch (_) {}\n      }\n\n      installOpenLayersBindHook();`,
);

swift = replaceOnce(
  swift,
  'expand map diagnostics',
  `        engineCalls: 0,\n        registry: [],`,
  `        engineCalls: 0,\n        mapDirectCalls: 0,\n        mapFeatureHits: 0,\n        mapRecovery: 'none',\n        registry: [],`,
);

swift = replaceOnce(
  swift,
  'record map recovery',
  `          __cribloMapRegistry.push({ map: map, engine: engine });\n          __cribloGeoDiag.registry = __cribloMapRegistry.map(function (entry) { return entry.engine; });`,
  `          __cribloMapRegistry.push({ map: map, engine: engine });\n          __cribloGeoDiag.registry = __cribloMapRegistry.map(function (entry) { return entry.engine; });\n          __cribloGeoDiag.mapRecovery = String(engine || 'unknown');`,
);

const oldOpenLayers = `            // OpenLayers Map\n            if (map && typeof map.getViewport === 'function' && typeof map.getCoordinateFromPixel === 'function' && typeof map.dispatchEvent === 'function') {\n              var viewport = map.getViewport();\n              if (!viewport || !(viewport === target || (viewport.contains && viewport.contains(target)))) continue;\n              var pixel = viewportPoint(viewport, x, y);\n              var coordinate = map.getCoordinateFromPixel(pixel);\n              var original = compatibleContextEvent(target, viewport, x, y, sourceEvent);\n              var payload = { type: 'contextmenu', map: map, pixel: pixel, coordinate: coordinate, dragging: false, originalEvent: original };\n              map.dispatchEvent(payload);\n              try { map.dispatchEvent({ type: 'longpress', map: map, pixel: pixel, coordinate: coordinate, dragging: false, originalEvent: original }); } catch (_) {}\n              try { map.dispatchEvent({ type: 'hold', map: map, pixel: pixel, coordinate: coordinate, dragging: false, originalEvent: original }); } catch (_) {}\n              __cribloGeoDiag.engine = 'OpenLayers'; __cribloGeoDiag.engineCalls++; return true;\n            }`;

const newOpenLayers = `            // OpenLayers Map. GeoReseaux is officially Angular/OpenLayers, but\n            // Angular's module bundle hides the Map constructor from window. Once\n            // the bind hook recovers the real instance, use OpenLayers' OWN DOM\n            // browser-event entry point. This is the same method its viewport\n            // contextmenu listener calls, and is materially different from\n            // dispatching an arbitrary custom object on the map.\n            if (map && typeof map.getViewport === 'function' && typeof map.getCoordinateFromPixel === 'function') {\n              var viewport = map.getViewport();\n              if (!viewport || !(viewport === target || (viewport.contains && viewport.contains(target)))) continue;\n              var pixel = viewportPoint(viewport, x, y);\n              var original = compatibleContextEvent(target, viewport, x, y, sourceEvent);\n\n              // Record whether the held pixel actually resolves to an OL vector\n              // feature. This is diagnostic only; the real GeoReseaux handler\n              // still decides what popup/action should open.\n              try {\n                var hit = null;\n                if (typeof map.forEachFeatureAtPixel === 'function') {\n                  hit = map.forEachFeatureAtPixel(pixel, function (feature) { return feature || true; });\n                } else if (typeof map.getFeaturesAtPixel === 'function') {\n                  var hits = map.getFeaturesAtPixel(pixel);\n                  hit = hits && hits.length ? hits[0] : null;\n                }\n                if (hit) __cribloGeoDiag.mapFeatureHits++;\n              } catch (_) {}\n\n              if (typeof map.handleBrowserEvent === 'function') {\n                map.handleBrowserEvent(original, 'contextmenu');\n              } else if (typeof map.dispatchEvent === 'function') {\n                var coordinate = map.getCoordinateFromPixel(pixel);\n                map.dispatchEvent({ type: 'contextmenu', map: map, pixel: pixel, coordinate: coordinate, dragging: false, originalEvent: original });\n              } else {\n                continue;\n              }\n              __cribloGeoDiag.engine = 'OpenLayers';\n              __cribloGeoDiag.engineCalls++;\n              __cribloGeoDiag.mapDirectCalls++;\n              return true;\n            }`;

swift = replaceOnce(swift, 'direct OpenLayers browser event', oldOpenLayers, newOpenLayers);

swift = replaceOnce(
  swift,
  'direct map before DOM context in completion',
  `        var before = visiblePopupState();\n        var callsBefore = __cribloGeoDiag.wrappedContextCalls;\n        var source = request.sourceEvent || request.releaseEvent || request.tailEvent || null;\n        var dispatched = contextMenu(target, x, y, source);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;`,
  `        var before = visiblePopupState();\n        var callsBefore = __cribloGeoDiag.wrappedContextCalls;\n        var source = request.sourceEvent || request.releaseEvent || request.tailEvent || null;\n        // Primary path: enter the recovered OpenLayers Map exactly where its own\n        // viewport contextmenu listener would. Keep the old DOM bridge only as a\n        // compatibility fallback when no real Map instance could be recovered.\n        var dispatched = invokeMapEngine(target, x, y, source);\n        if (!dispatched) dispatched = contextMenu(target, x, y, source);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;`,
);

swift = replaceOnce(
  swift,
  'direct map before DOM context in native fallback',
  `        var before = visiblePopupState();\n        var callsBefore = __cribloGeoDiag.wrappedContextCalls;\n        var dispatched = contextMenu(target, x, y, null);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;`,
  `        var before = visiblePopupState();\n        var callsBefore = __cribloGeoDiag.wrappedContextCalls;\n        var dispatched = invokeMapEngine(target, x, y, null);\n        if (!dispatched) dispatched = contextMenu(target, x, y, null);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;`,
);

swift = replaceOnce(
  swift,
  'diagnostic map direct line',
  `          'Engine: ' + __cribloGeoDiag.engine + ' / instances: ' + __cribloMapRegistry.length + ' / calls: ' + __cribloGeoDiag.engineCalls,`,
  `          'Engine: ' + __cribloGeoDiag.engine + ' / instances: ' + __cribloMapRegistry.length + ' / calls: ' + __cribloGeoDiag.engineCalls,\n          'OpenLayers direct: ' + __cribloGeoDiag.mapDirectCalls + ' / feature hits: ' + __cribloGeoDiag.mapFeatureHits + ' / recovery: ' + __cribloGeoDiag.mapRecovery,`,
);

fs.writeFileSync(swiftPath, swift);

let test = fs.readFileSync(testPath, 'utf8');
const marker = `console.log("iOS GeoReseaux trusted-touch arm/release bridge test passed");`;
if (!test.includes(marker)) throw new Error('test marker not found');

test = test.replace(marker, `// A production Angular bundle does not expose window.ol. Reproduce that by\n// keeping an OpenLayers-shaped Map only in this local variable. Its\n// handleBrowserEvent.bind(map) must be enough for the document-start bind hook\n// to recover the instance, and completion must enter Map.handleBrowserEvent\n// directly without dispatching another DOM contextmenu.\nlet directMapCalls = 0;\nlet directMapEvent = null;\nconst hiddenMap = {\n  getViewport() { return canvas; },\n  getView() { return {}; },\n  getCoordinateFromPixel(pixel) { return [pixel[0] * 10, pixel[1] * 10]; },\n  getInteractions() { return { getArray() { return []; } }; },\n  forEachFeatureAtPixel(pixel, callback) { return callback({ id: 'fixture-feature' }); },\n  handleBrowserEvent(event, type) {\n    directMapCalls += 1;\n    directMapEvent = { type, x: event.clientX, y: event.clientY, trusted: event.isTrusted };\n  },\n};\n// This is exactly how OpenLayers creates boundHandleBrowserEvent_.\nconst hiddenBound = hiddenMap.handleBrowserEvent.bind(hiddenMap);\nif (typeof hiddenBound !== 'function') throw new Error('fixture bind failed');\n\nconst contextEventsBeforeDirect = Number((windowTarget.__cribloGeoDiagnosticsText().match(/Context events: (\\d+)/) || [])[1] || 0);\npageOrder = [];\npointer("pointerdown", 91, 42, 1);\ntouch("touchstart", 91, 42);\nawait wait(650);\npointer("pointerup", 91, 42, 0);\ntouch("touchend", 91, 42);\nmouse("mousedown", 91, 42, 1);\nmouse("mouseup", 91, 42, 0);\nmouse("click", 91, 42, 0);\nawait wait(40);\nif (directMapCalls !== 1) throw new Error('hidden OpenLayers map was not called exactly once: ' + directMapCalls);\nif (!directMapEvent || directMapEvent.type !== 'contextmenu' || directMapEvent.x !== 91 || directMapEvent.y !== 42 || !directMapEvent.trusted) {\n  throw new Error('direct OpenLayers event is wrong: ' + JSON.stringify(directMapEvent));\n}\nconst directDiagnostics = windowTarget.__cribloGeoDiagnosticsText();\nif (!directDiagnostics.includes('Engine: OpenLayers / instances: 1 / calls: 1')) {\n  throw new Error('OpenLayers engine was not recovered: ' + directDiagnostics);\n}\nif (!directDiagnostics.includes('OpenLayers direct: 1 / feature hits: 1 / recovery: OpenLayers-bound')) {\n  throw new Error('OpenLayers direct diagnostics are wrong: ' + directDiagnostics);\n}\nconst contextEventsAfterDirect = Number((directDiagnostics.match(/Context events: (\\d+)/) || [])[1] || 0);\nif (contextEventsAfterDirect !== contextEventsBeforeDirect) {\n  throw new Error('direct OpenLayers path still dispatched a DOM contextmenu: ' + directDiagnostics);\n}\n\nconsole.log("iOS GeoReseaux trusted-touch + hidden OpenLayers direct bridge test passed");`);

fs.writeFileSync(testPath, test);
