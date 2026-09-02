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

const oldPrimary = `        finishAndroidCompatibilityMouse(request, true);\n        var dispatched = invokeMapEngine(target, x, y, source);\n        if (!dispatched) dispatched = contextMenu(target, x, y, source);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;`;
const newPrimary = `        finishAndroidCompatibilityMouse(request, true);\n        // Android delivers contextmenu through the viewport DOM first. That is\n        // important because GeoReseaux may attach Angular/DOM listeners alongside\n        // OpenLayers' own viewport listener. Calling Map.handleBrowserEvent() first\n        // bypasses those application listeners and is not equivalent to Android.\n        // Dispatch the DOM event first with the trusted touch facade. The recovered\n        // Map is now only a fallback when no wrapped DOM handler consumed the event.\n        var dispatched = contextMenu(target, x, y, source);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;\n        if (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented) {\n          dispatched = invokeMapEngine(target, x, y, source) || dispatched;\n        }`;
swift = replaceOnce(swift, 'DOM-first trusted completion', oldPrimary, newPrimary);

const oldFallback = `        var dispatched = invokeMapEngine(target, x, y, null);\n        if (!dispatched) dispatched = contextMenu(target, x, y, null);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;`;
const newFallback = `        var dispatched = contextMenu(target, x, y, null);\n        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;\n        if (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented) {\n          dispatched = invokeMapEngine(target, x, y, null) || dispatched;\n        }`;
swift = replaceOnce(swift, 'DOM-first native fallback', oldFallback, newFallback);

fs.writeFileSync(swiftPath, swift);

let test = fs.readFileSync(testPath, 'utf8');
test = replaceOnce(
  test,
  'hidden map event type fallback',
  `    directMapEvent = { type, x: event.clientX, y: event.clientY, trusted: event.isTrusted };`,
  `    directMapEvent = { type: type || event.type, x: event.clientX, y: event.clientY, trusted: event.isTrusted };`,
);

test = replaceOnce(
  test,
  'attach DOM and OpenLayers viewport listeners',
  `const hiddenBound = hiddenMap.handleBrowserEvent.bind(hiddenMap);\nif (typeof hiddenBound !== 'function') throw new Error('hidden OpenLayers bind fixture failed');`,
  `const hiddenBound = hiddenMap.handleBrowserEvent.bind(hiddenMap);\nif (typeof hiddenBound !== 'function') throw new Error('hidden OpenLayers bind fixture failed');\nlet geoDomCalls = 0;\nlet geoDomTrusted = false;\ncanvas.addEventListener('contextmenu', (event) => {\n  geoDomCalls += 1;\n  geoDomTrusted = event.isTrusted === true && Boolean(event.originalEvent && event.originalEvent.isTrusted);\n});\n// This is the exact shape OpenLayers uses: a DOM contextmenu listener on the\n// viewport which forwards into map.handleBrowserEvent.\ncanvas.addEventListener('contextmenu', hiddenBound);`,
);

test = replaceOnce(
  test,
  'DOM-first assertions',
  `if (directMapCalls !== 1) throw new Error('hidden OpenLayers map was not called exactly once: ' + directMapCalls);\nif (!directMapEvent || directMapEvent.type !== 'contextmenu' || directMapEvent.x !== 91 || directMapEvent.y !== 42 || !directMapEvent.trusted) {\n  throw new Error('direct OpenLayers event mismatch: ' + JSON.stringify(directMapEvent));\n}\nconst directDiagnostics = windowTarget.__cribloGeoDiagnosticsText();\nif (!directDiagnostics.includes('Engine: OpenLayers / instances: 1 / calls: 1')) throw new Error('hidden OpenLayers map was not recovered: ' + directDiagnostics);\nif (!directDiagnostics.includes('OpenLayers direct: 1 / feature hits: 1 / recovery: OpenLayers-bound')) throw new Error('direct OpenLayers diagnostics mismatch: ' + directDiagnostics);\nconst contextAfter = Number((directDiagnostics.match(/Context events: (\\d+)/) || [])[1] || 0);\nif (contextAfter !== contextBefore) throw new Error('direct OpenLayers path fell back to DOM contextmenu: ' + directDiagnostics);\n\nconsole.log(\"iOS GeoReseaux exact lifecycle + hidden OpenLayers direct bridge test passed\");`,
  `if (geoDomCalls !== 1 || !geoDomTrusted) throw new Error('GeoReseaux DOM context handler was bypassed or untrusted: calls=' + geoDomCalls + ' trusted=' + geoDomTrusted);\nif (directMapCalls !== 1) throw new Error('OpenLayers viewport listener was not called exactly once through DOM: ' + directMapCalls);\nif (!directMapEvent || directMapEvent.type !== 'contextmenu' || directMapEvent.x !== 91 || directMapEvent.y !== 42 || !directMapEvent.trusted) {\n  throw new Error('OpenLayers DOM-forwarded event mismatch: ' + JSON.stringify(directMapEvent));\n}\nconst directDiagnostics = windowTarget.__cribloGeoDiagnosticsText();\nif (!directDiagnostics.includes('OpenLayers direct: 0 / feature hits: 0 / recovery: OpenLayers-bound')) throw new Error('bridge incorrectly bypassed DOM with direct OpenLayers call: ' + directDiagnostics);\nconst contextAfter = Number((directDiagnostics.match(/Context events: (\\d+)/) || [])[1] || 0);\nif (contextAfter !== contextBefore + 1) throw new Error('GeoReseaux DOM contextmenu was not dispatched exactly once: ' + directDiagnostics);\n\nconsole.log(\"iOS GeoReseaux exact lifecycle + DOM-first hidden OpenLayers bridge test passed\");`,
);

fs.writeFileSync(testPath, test);
