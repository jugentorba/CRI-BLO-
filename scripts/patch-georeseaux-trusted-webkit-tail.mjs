import { readFileSync, writeFileSync } from 'node:fs';

const swiftPath = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';
let s = readFileSync(swiftPath, 'utf8');

const oldCompletionCoords = `        var target = request.tailTarget || request.target;
        var x = request.tailX == null ? request.x : request.tailX;
        var y = request.tailY == null ? request.y : request.tailY;`;
const newCompletionCoords = `        // Keep the exact physical long-press target/coordinates. The delayed
        // trusted click is only a readiness signal; its target/coordinates may
        // differ in WKWebView and must never move the GeoReseaux hit-test point.
        var target = request.target;
        var x = request.x;
        var y = request.y;`;
if (s.includes(oldCompletionCoords)) s = s.replace(oldCompletionCoords, newCompletionCoords);

const oldClickCoords = `            request.tailEvent = event;
            request.tailTarget = event.target || request.target;
            if (Number.isFinite(event.clientX)) request.tailX = event.clientX;
            if (Number.isFinite(event.clientY)) request.tailY = event.clientY;`;
const newClickCoords = `            request.tailEvent = event;`;
if (s.includes(oldClickCoords)) s = s.replace(oldClickCoords, newClickCoords);

if (!s.includes("completeAndroidLongPress(request, 'trusted-click')")) {
  throw new Error('trusted-click completion path missing');
}
if (s.includes('request.tailTarget') || s.includes('request.tailX') || s.includes('request.tailY')) {
  throw new Error('delayed click is still allowed to replace hold hit-test data');
}
if (s.includes("setTimeout(function () { completeAndroidLongPress(request); }, 0);")) {
  throw new Error('old zero-delay touchend completion still present');
}
if (s.includes("ensureAndroidPressStart(request.target, request.x, request.y, request.touchStartedAt);")) {
  throw new Error('old native-path synthetic press start still present');
}

writeFileSync(swiftPath, s);
console.log('Preserved original GeoReseaux hold target/coordinates while waiting for trusted WebKit click.');
