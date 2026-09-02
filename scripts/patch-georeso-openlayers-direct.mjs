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
  `      var __cribloOriginalAddEventListener = EventTarget.prototype.addEventListener;\n      var __cribloOriginalRemoveEventListener = EventTarget.prototype.removeEventListener;\n\n      // GeoReseaux is bundled, so the OpenLayers Map constructor is not exposed\n      // as window.ol.Map. OpenLayers binds Map.handleBrowserEvent to the real Map\n      // instance while constructing the viewport. Capture that one bind at\n      // document-start, register the hidden Map, then restore bind immediately.\n      var __cribloOriginalBind = Function.prototype.bind;\n      var __cribloPatchedBind = null;\n      var __cribloBindHookTimer = null;\n\n      function looksLikeOpenLayersMap(value) {\n        try {\n          return !!value\n            && typeof value.getViewport === 'function'\n            && typeof value.getView === 'function'\n            && typeof value.getCoordinateFromPixel === 'function'\n            && typeof value.handleBrowserEvent === 'function';\n        } catch (_) { return false; }\n      }\n\n      function restoreOpenLayersBindHook() {\n        try {\n          if (__cribloPatchedBind && Function.prototype.bind === __cribloPatchedBind) {\n            Function.prototype.bind = __cribloOriginalBind;\n          }\n          if (__cribloBindHookTimer) clearTimeout(__cribloBindHookTimer);\n        } catch (_) {}\n        __cribloBindHookTimer = null;\n      }\n\n      function installOpenLayersBindHook() {\n        try {\n          if (__cribloPatchedBind) return;\n          __cribloPatchedBind = function () {\n            var bound = __cribloOriginalBind.apply(this, arguments);\n            try {\n              var thisArg = arguments.length ? arguments[0] : null;\n              if (looksLikeOpenLayersMap(thisArg) && this === thisArg.handleBrowserEvent) {\n                registerMapInstance(thisArg, 'OpenLayers-bound');\n                restoreOpenLayersBindHook();\n              }\n            } catch (_) {}\n            return bound;\n          };\n          Function.prototype.bind = __cribloPatchedBind;\n          __cribloBindHookTimer = setTimeout(restoreOpenLayersBindHook, 30000);\n        } catch (_) {}\n      }\n\n      installOpenLayersBindHook();`,
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

const newOpenLayers = `            // OpenLayers Map. Call the real OpenLayers browser-event entry\n            // point instead of dispatching another synthetic DOM contextmenu.\n            // This lets OpenLayers create its own MapBrowserEvent, pixel and\n            // coordinate exactly as its viewport contextmenu listener does.\n            if (map && typeof map.getViewport === 'function' && typeof map.getCoordinateFromPixel === 'function') {\n              var viewport = map.getViewport();\n              if (!viewport || !(viewport === target || (viewport.contains && viewport.contains(target)))) continue;\n              var pixel = viewportPoint(viewport, x, y);\n              var original = compatibleContextEvent(target, viewport, x, y, sourceEvent);\n              try {\n                var hit = null;\n                if (typeof map.forEachFeatureAtPixel === 'function') {\n                  hit = map.forEachFeatureAtPixel(pixel, function (feature) { return feature || true; });\n                } else if (typeof map.getFeaturesAtPixel === 'function') {\n                  var hits = map.getFeaturesAtPixel(pixel);\n                  hit = hits && hits.length ? hits[0] : null;\n                }\n                if (hit) __cribloGeoDiag.mapFeatureHits++;\n              } catch (_) {}\n\n              if (typeof map.handleBrowserEvent === 'function') {\n                map.handleBrowserEvent(original, 'contextmenu');\n              } else if (typeof map.dispatchEvent === 'function') {\n                var coordinate = map.getCoordinateFromPixel(pixel);\n                map.dispatchEvent({ type: 'contextmenu', map: map, pixel: pixel, coordinate: coordinate, dragging: false, originalEvent: original });\n              } else {\n                continue;\n              }\n              __cribloGeoDiag.engine = 'OpenLayers';\n              __cribloGeoDiag.engineCalls++;\n              __cribloGeoDiag.mapDirectCalls++;\n              return true;\n            }`;

swift = replaceOnce(swift, 'direct OpenLayers browser event', oldOpenLayers, newOpenLayers);

// Current bridge already reconstructs the missing Android mouseup/click tail.
// Change only the final action: enter the recovered Map directly first, with DOM
// contextmenu retained strictly as a fallback when no Map could be recovered.
swift = replaceOnce(
  swift,
  'direct map before DOM context in completion',
  `        var dispatched = contextMenu(target, x, y, source);`,
  `        var dispatched = invokeMapEngine(target, x, y, source);\n        if (!dispatched) dispatched = contextMenu(target, x, y, source);`,
);

swift = replaceOnce(
  swift,
  'direct map before DOM context in native fallback',
  `        var dispatched = contextMenu(target, x, y, null);`,
  `        var dispatched = invokeMapEngine(target, x, y, null);\n        if (!dispatched) dispatched = contextMenu(target, x, y, null);`,
);

swift = replaceOnce(
  swift,
  'diagnostic map direct line',
  `          'Engine: ' + __cribloGeoDiag.engine + ' / instances: ' + __cribloMapRegistry.length + ' / calls: ' + __cribloGeoDiag.engineCalls,`,
  `          'Engine: ' + __cribloGeoDiag.engine + ' / instances: ' + __cribloMapRegistry.length + ' / calls: ' + __cribloGeoDiag.engineCalls,\n          'OpenLayers direct: ' + __cribloGeoDiag.mapDirectCalls + ' / feature hits: ' + __cribloGeoDiag.mapFeatureHits + ' / recovery: ' + __cribloGeoDiag.mapRecovery,`,
);

fs.writeFileSync(swiftPath, swift);

let test = fs.readFileSync(testPath, 'utf8');
const marker = `console.log("iOS GeoReseaux real-iPhone to exact-Android lifecycle test passed");`;
if (!test.includes(marker)) throw new Error('current lifecycle test marker not found');

test = test.replace(marker, `// GeoReseaux's Angular bundle can hide OpenLayers from window. Reproduce that\n// shape: the Map is only local, and its handleBrowserEvent.bind(map) is the\n// constructor signature our document-start hook must recover.\nlet directMapCalls = 0;\nlet directMapEvent = null;\nconst hiddenMap = {\n  getViewport() { return canvas; },\n  getView() { return {}; },\n  getCoordinateFromPixel(pixel) { return [pixel[0] * 10, pixel[1] * 10]; },\n  forEachFeatureAtPixel(pixel, callback) { return callback({ id: 'fixture-feature' }); },\n  handleBrowserEvent(event, type) {\n    directMapCalls += 1;\n    directMapEvent = { type, x: event.clientX, y: event.clientY, trusted: event.isTrusted };\n  },\n};\nconst hiddenBound = hiddenMap.handleBrowserEvent.bind(hiddenMap);\nif (typeof hiddenBound !== 'function') throw new Error('hidden OpenLayers bind fixture failed');\n\nconst contextBefore = Number((windowTarget.__cribloGeoDiagnosticsText().match(/Context events: (\\d+)/) || [])[1] || 0);\norder.length = 0;\nlifecycle.length = 0;\ncontext = null;\npointer("pointerdown", 91, 42, 1);\ntouch("touchstart", 91, 42);\nawait wait(650);\npointer("pointerup", 91, 42, 0);\ntouch("touchend", 91, 42);\nawait wait(40);\nif (directMapCalls !== 1) throw new Error('hidden OpenLayers map was not called exactly once: ' + directMapCalls);\nif (!directMapEvent || directMapEvent.type !== 'contextmenu' || directMapEvent.x !== 91 || directMapEvent.y !== 42 || !directMapEvent.trusted) {\n  throw new Error('direct OpenLayers event mismatch: ' + JSON.stringify(directMapEvent));\n}\nconst directDiagnostics = windowTarget.__cribloGeoDiagnosticsText();\nif (!directDiagnostics.includes('Engine: OpenLayers / instances: 1 / calls: 1')) throw new Error('hidden OpenLayers map was not recovered: ' + directDiagnostics);\nif (!directDiagnostics.includes('OpenLayers direct: 1 / feature hits: 1 / recovery: OpenLayers-bound')) throw new Error('direct OpenLayers diagnostics mismatch: ' + directDiagnostics);\nconst contextAfter = Number((directDiagnostics.match(/Context events: (\\d+)/) || [])[1] || 0);\nif (contextAfter !== contextBefore) throw new Error('direct OpenLayers path fell back to DOM contextmenu: ' + directDiagnostics);\n\nconsole.log("iOS GeoReseaux exact lifecycle + hidden OpenLayers direct bridge test passed");`);

fs.writeFileSync(testPath, test);
