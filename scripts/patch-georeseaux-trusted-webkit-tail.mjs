import { readFileSync, writeFileSync } from 'node:fs';

const swiftPath = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';
let s = readFileSync(swiftPath, 'utf8');

function replaceBetween(start, end, replacement) {
  const a = s.indexOf(start);
  if (a < 0) throw new Error(`start marker not found: ${start}`);
  const b = s.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`end marker not found: ${end}`);
  s = s.slice(0, a) + replacement + s.slice(b);
}

// Real-device diagnostic (2026-09-02) proved that WKWebView supplies its
// genuine mousedown/mouseup/click AFTER touchend. Do not fabricate that tail.
replaceBetween(
  '      function completeAndroidLongPress(request) {',
  '      function dispatchNativeLongPressRequest(request) {',
`      function completeAndroidLongPress(request, reason) {
        if (!request || pendingNativeLongPress !== request || !request.armed) return false;
        pendingNativeLongPress = null;
        var target = request.tailTarget || request.target;
        var x = request.tailX == null ? request.x : request.tailX;
        var y = request.tailY == null ? request.y : request.tailY;
        if (!target || !target.dispatchEvent) {
          __cribloGeoDiag.lastResult = 'trusted-tail-no-target';
          return false;
        }

        // The live iPhone trace showed that the page's genuine trusted click is
        // delivered after touchend. Waiting for that click is essential because
        // GeoReseaux can update its canvas hit/selection state during the real
        // click before its contextmenu handler runs.
        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var source = request.sourceEvent || request.releaseEvent || request.tailEvent || null;
        var dispatched = contextMenu(target, x, y, source);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        __cribloGeoDiag.directTrustedHandlerFires += delta;
        __cribloGeoDiag.releaseCompletions++;
        __cribloGeoDiag.lastResult = dispatched
          ? 'trusted-webkit-tail-contextmenu-' + String(reason || 'fallback')
          : 'trusted-webkit-tail-contextmenu-error';
        setTimeout(function () {
          if (popupChanged(before)) __cribloGeoDiag.lastResult = 'trusted-webkit-tail-popup';
          else if (dispatched) __cribloGeoDiag.lastResult = 'trusted-webkit-tail-no-popup';
        }, 220);
        return dispatched;
      }

`);

// Never synthesize pointerdown/mousedown on the genuine iPhone path. The
// previous bridge did it twice because iOS pointerdown arrives before touchstart.
s = s.replace(
  "        ensureAndroidPressStart(request.target, request.x, request.y, request.touchStartedAt);\n        __cribloGeoDiag.lastResult = 'android-trace-armed-waiting-release';",
  "        __cribloGeoDiag.lastResult = 'trusted-webkit-tail-armed-waiting-release';"
);

s = s.replace(
`          setTimeout(function () {
            if (realTouchTarget === target && lastRealTouchStartAt === touchStartNow) {
              ensureAndroidPressStart(target, realTouchX, realTouchY, touchStartNow);
            }
          }, 0);

`,
''
);

// Complete only after WebKit's own trusted click has finished propagating.
replaceBetween(
  "      document.addEventListener('click', function (event) {",
  "      // Bypass the page-listener wrapper for CRI-BLO's own observer.",
`      document.addEventListener('click', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealClickAt = Date.now();
          lastRealClickTarget = event.target || null;
          traceAndroidEvent('click', true);

          var request = pendingNativeLongPress;
          if (request && request.armed && request.releasedAt && !request.tailCompletionScheduled) {
            request.tailCompletionScheduled = true;
            request.tailEvent = event;
            request.tailTarget = event.target || request.target;
            if (Number.isFinite(event.clientX)) request.tailX = event.clientX;
            if (Number.isFinite(event.clientY)) request.tailY = event.clientY;
            // We are in capture phase. Run in the next task so GeoReseaux's own
            // trusted click handlers finish first, then contextmenu is truly last.
            setTimeout(function () {
              completeAndroidLongPress(request, 'trusted-click');
            }, 0);
          }
        } catch (_) {}
      }, true);

`);

// touchend only marks the release. A delayed fallback exists for WebKit builds
// that do not emit a trusted click, but the normal path waits for that click.
s = s.replace(
`            __cribloGeoDiag.lastResult = 'android-trace-touchend-waiting-tail';
            // Let WebKit deliver its genuine pointerup/mouseup/click first. The
            // zero-delay task then fills only missing tail events and emits the
            // contextmenu LAST, matching the Android trace exactly.
            setTimeout(function () { completeAndroidLongPress(request); }, 0);`,
`            __cribloGeoDiag.lastResult = 'trusted-webkit-tail-touchend-waiting-click';
            // The live iPhone diagnostic proves mousedown/mouseup/click arrive
            // after touchend. Do not race them with setTimeout(0). Give WebKit
            // time to deliver its real click; the click capture listener above
            // will schedule contextmenu after the click has fully propagated.
            setTimeout(function () {
              if (pendingNativeLongPress === request && request.armed && !request.tailCompletionScheduled) {
                request.tailCompletionScheduled = true;
                completeAndroidLongPress(request, 'no-trusted-click-fallback');
              }
            }, 320);`
);

if (s.includes("setTimeout(function () { completeAndroidLongPress(request); }, 0);")) {
  throw new Error('old zero-delay release completion still present');
}
if (s.includes("ensureAndroidPressStart(request.target, request.x, request.y, request.touchStartedAt);")) {
  throw new Error('old native-path synthetic press start still present');
}

writeFileSync(swiftPath, s);
console.log('Patched GeoReseaux bridge to wait for the genuine trusted WebKit click tail.');
