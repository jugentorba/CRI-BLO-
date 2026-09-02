import fs from "node:fs";

const swiftPath =
  "plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift";
const testPath = "scripts/test-ios-longpress-bridge.mjs";
const workflowPath = ".github/workflows/apply-georeseaux-ios-webkit-tail.yml";

function replaceOnce(text, label, from, to) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: source block not found`);
  if (text.indexOf(from, first + from.length) >= 0) {
    throw new Error(`${label}: source block appeared more than once`);
  }
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function replaceBetween(text, label, start, end, replacement) {
  const s = text.indexOf(start);
  if (s < 0) throw new Error(`${label}: start marker not found`);
  const e = text.indexOf(end, s + start.length);
  if (e < 0) throw new Error(`${label}: end marker not found`);
  return text.slice(0, s) + replacement + text.slice(e);
}

let swift = fs.readFileSync(swiftPath, "utf8");

swift = replaceBetween(
  swift,
  "replace synthetic press/release completion",
  "      function ensureAndroidPressStart(",
  "      function dispatchNativeLongPressRequest(",
  `      function completeIOSLongPressAfterWebKitTail(request, reason) {
        if (!request || pendingNativeLongPress !== request || !request.armed || !request.releasedAt) return false;

        pendingNativeLongPress = null;
        if (request.releaseFallbackTimer) {
          clearTimeout(request.releaseFallbackTimer);
          request.releaseFallbackTimer = null;
        }

        var target = request.target;
        var x = request.x;
        var y = request.y;
        if (!target || !target.dispatchEvent) {
          __cribloGeoDiag.lastResult = 'ios-release-no-target';
          return false;
        }

        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var dispatched = contextMenu(target, x, y, request.sourceEvent || request.releaseEvent || null);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        __cribloGeoDiag.directTrustedHandlerFires += delta;
        __cribloGeoDiag.releaseCompletions++;
        __cribloGeoDiag.lastResult = dispatched
          ? (reason === 'webkit-click' ? 'ios-webkit-click-contextmenu' : 'ios-tail-timeout-contextmenu')
          : 'ios-context-dispatch-error';

        setTimeout(function () {
          if (popupChanged(before)) __cribloGeoDiag.lastResult = 'ios-context-popup';
          else if (dispatched) __cribloGeoDiag.lastResult = 'ios-context-no-popup';
        }, 220);
        return dispatched;
      }

`,
);

swift = replaceOnce(
  swift,
  "stop synthesizing press events while arming",
  `        ensureAndroidPressStart(request.target, request.x, request.y, request.touchStartedAt);
        __cribloGeoDiag.lastResult = 'android-trace-armed-waiting-release';`,
  `        __cribloGeoDiag.lastResult = 'ios-armed-waiting-release';`,
);

swift = replaceOnce(
  swift,
  "stop touchstart synthetic press injection",
  `          setTimeout(function () {
            if (realTouchTarget === target && lastRealTouchStartAt === touchStartNow) {
              ensureAndroidPressStart(target, realTouchX, realTouchY, touchStartNow);
            }
          }, 0);

`,
  "",
);

swift = replaceOnce(
  swift,
  "complete on trusted WebKit click",
  `      document.addEventListener('click', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealClickAt = Date.now();
          lastRealClickTarget = event.target || null;
          traceAndroidEvent('click', true);
        } catch (_) {}
      }, true);`,
  `      document.addEventListener('click', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealClickAt = Date.now();
          lastRealClickTarget = event.target || null;
          traceAndroidEvent('click', true);

          // Real iPhone diagnostic: WebKit sends its trusted mouse compatibility
          // tail AFTER touchend. Let that real click propagate first, then emit
          // only the missing contextmenu. Do not synthesize pointer/mouse events.
          var request = pendingNativeLongPress;
          if (!request || !request.armed || !request.releasedAt) return;
          var eventTarget = event.target || null;
          var requestTarget = request.target || null;
          var sameTarget = eventTarget === requestTarget;
          if (!sameTarget && requestTarget && requestTarget.contains && eventTarget) {
            try { sameTarget = requestTarget.contains(eventTarget); } catch (_) {}
          }
          if (!sameTarget && eventTarget && eventTarget.contains && requestTarget) {
            try { sameTarget = eventTarget.contains(requestTarget); } catch (_) {}
          }
          if (!sameTarget) return;

          setTimeout(function () {
            completeIOSLongPressAfterWebKitTail(request, 'webkit-click');
          }, 0);
        } catch (_) {}
      }, true);`,
);

swift = replaceOnce(
  swift,
  "wait for trusted WebKit mouse tail after touchend",
  `            __cribloGeoDiag.lastResult = 'android-trace-touchend-waiting-tail';
            // Let WebKit deliver its genuine pointerup/mouseup/click first. The
            // zero-delay task then fills only missing tail events and emits the
            // contextmenu LAST, matching the Android trace exactly.
            setTimeout(function () { completeAndroidLongPress(request); }, 0);`,
  `            __cribloGeoDiag.lastResult = 'ios-touchend-waiting-webkit-click';
            // The real iPhone trace shows that WKWebView emits trusted
            // mousedown -> mouseup -> click after touchend. Wait for that real
            // click so GeoReseaux can finish its internal gesture state first.
            // If WebKit suppresses the click, emit only contextmenu after a
            // short grace period; never fabricate pointer/mouse/click events.
            request.releaseFallbackTimer = setTimeout(function () {
              completeIOSLongPressAfterWebKitTail(request, 'tail-timeout');
            }, 220);`,
);

swift = replaceOnce(
  swift,
  "clear release fallback on touchcancel",
  `      document.addEventListener('touchcancel', function () {
        clearRealTouchTimer();
        pendingNativeLongPress = null;`,
  `      document.addEventListener('touchcancel', function () {
        clearRealTouchTimer();
        if (pendingNativeLongPress && pendingNativeLongPress.releaseFallbackTimer) {
          clearTimeout(pendingNativeLongPress.releaseFallbackTimer);
        }
        pendingNativeLongPress = null;`,
);

fs.writeFileSync(swiftPath, swift);

let test = fs.readFileSync(testPath, "utf8");

test = replaceBetween(
  test,
  "replace Android helper sequence with real iPhone sequence",
  "function androidPressStart(",
  `canvas.addEventListener("contextmenu", pageContextHandler);`,
  `function iosPressStart(x, y) {
  // Actual iPhone/WKWebView order measured on the user's device:
  // trusted pointerdown arrives before trusted touchstart.
  realPointerEvent("pointerdown", x, y, 1);
  realTouchEvent("touchstart", x, y);
}

function iosTouchRelease(x, y) {
  // Actual iPhone trace: trusted pointerup arrives before trusted touchend.
  realPointerEvent("pointerup", x, y, 0);
  realTouchEvent("touchend", x, y);
}

function iosMouseTail(x, y) {
  // WKWebView emits this trusted compatibility tail after touchend.
  realMouseEvent("mousedown", x, y, 1);
  realMouseEvent("mouseup", x, y, 0);
  realMouseEvent("click", x, y, 0);
}

`,
);

const mainStart = test.indexOf("// Normal WKWebView path:");
if (mainStart < 0) throw new Error("test main marker not found");

test = test.slice(0, mainStart) + `// Normal iPhone/WKWebView path reproduced from the real device diagnostic.
// The bridge must not create duplicate pointer/mouse events and must wait for
// WebKit's trusted click tail before dispatching the one missing contextmenu.
iosPressStart(82, 31);
await wait(1);

if (!windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5)) {
  throw new Error("native long-press bridge did not accept the hold request");
}
await wait();

if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(\`contextmenu fired before release: \${pageOrder.join(",")}\`);
}

iosTouchRelease(82, 31);
await wait(20);

if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(\`contextmenu fired before WebKit mouse tail: \${pageOrder.join(",")}\`);
}

iosMouseTail(82, 31);
await wait(20);

const normalFlags = received && [
  received.trusted,
  received.prevented,
  received.target,
  received.pointerEvent,
  received.touchSource,
];
if (!received || normalFlags.some((value) => value !== true)) {
  throw new Error(\`trusted browser-path facade failed: \${JSON.stringify(received)}\`);
}
if (received.clientX !== 82 || received.clientY !== 31) {
  throw new Error(\`native estimate replaced real touch coordinates: \${JSON.stringify(received)}\`);
}
if (received.button !== 0 || received.buttons !== 0 || received.pointerType !== "touch") {
  throw new Error(\`contextmenu shape does not match Android semantic event: \${JSON.stringify(received)}\`);
}

const expectedOrder =
  "pointerdown,touchstart,pointerup,touchend,mousedown,mouseup,click,contextmenu";
if (pageOrder.join(",") !== expectedOrder) {
  throw new Error(\`real iPhone event order is wrong: \${pageOrder.join(",")}\`);
}

let diagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!diagnostics.includes("Synthetic press/release: pd=0 md=0")) {
  throw new Error(\`bridge still synthesized press events: \${diagnostics}\`);
}
if (!diagnostics.includes("pu=0 mu=0 click=0")) {
  throw new Error(\`bridge still synthesized release events: \${diagnostics}\`);
}
if (!diagnostics.includes("Release completions: 1")) {
  throw new Error(\`release completion count is wrong: \${diagnostics}\`);
}
if (!diagnostics.includes("contextmenu*")) {
  throw new Error(\`trusted-source contextmenu was not recorded: \${diagnostics}\`);
}

// Delayed path: native recognizer request can arrive before DOM touchstart.
received = null;
pageOrder = [];
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait(5);
iosPressStart(73, 27);
await wait();

if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(\`delayed path fired contextmenu before release: \${pageOrder.join(",")}\`);
}

iosTouchRelease(73, 27);
await wait(20);
if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(\`delayed path fired contextmenu before WebKit click: \${pageOrder.join(",")}\`);
}
iosMouseTail(73, 27);
await wait(20);

if (!received || received.clientX !== 73 || received.clientY !== 27) {
  throw new Error(\`delayed touch coordinates were not preserved: \${JSON.stringify(received)}\`);
}
if (pageOrder.join(",") !== expectedOrder) {
  throw new Error(\`delayed iPhone event order is wrong: \${pageOrder.join(",")}\`);
}

diagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!diagnostics.includes("Native waits for touchstart: 1")) {
  throw new Error(\`delayed native wait was not recorded: \${diagnostics}\`);
}
if (!diagnostics.includes("Native/touch coordinate delta: 27,23")) {
  throw new Error(\`touch coordinate correction was not recorded: \${diagnostics}\`);
}
if (!diagnostics.includes("Release completions: 2")) {
  throw new Error(\`second release completion count is wrong: \${diagnostics}\`);
}
if (!diagnostics.includes("Synthetic press/release: pd=0 md=0")) {
  throw new Error(\`delayed path synthesized press events: \${diagnostics}\`);
}

// If WebKit suppresses its mouse/click compatibility tail, the bridge may
// still send contextmenu after a grace period, but must not fabricate low-level
// pointer or mouse events.
received = null;
pageOrder = [];
iosPressStart(68, 24);
await wait(1);
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait();
iosTouchRelease(68, 24);
await wait(260);

if (!received) {
  throw new Error("tail-timeout fallback did not dispatch contextmenu");
}
if (pageOrder.join(",") !== "pointerdown,touchstart,pointerup,touchend,contextmenu") {
  throw new Error(\`tail-timeout fabricated low-level events: \${pageOrder.join(",")}\`);
}

diagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!diagnostics.includes("Synthetic press/release: pd=0 md=0")) {
  throw new Error(\`tail-timeout synthesized press events: \${diagnostics}\`);
}
if (!diagnostics.includes("pu=0 mu=0 click=0")) {
  throw new Error(\`tail-timeout synthesized release events: \${diagnostics}\`);
}

// Listener removal must still preserve the page's original listener identity.
canvas.removeEventListener("contextmenu", pageContextHandler);
received = null;
pageOrder = [];
iosPressStart(60, 20);
await wait(1);
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait();
iosTouchRelease(60, 20);
await wait(20);
iosMouseTail(60, 20);
await wait(20);

if (received !== null) {
  throw new Error("wrapped context listener was not removed by its original identity");
}

console.log("iOS GeoReseaux real-WebKit-tail long-press bridge test passed");
`;

fs.writeFileSync(testPath, test);

// This helper and its one-shot workflow are intentionally temporary. Delete
// both in the generated patch commit so the branch stays clean.
try { fs.unlinkSync(new URL(import.meta.url)); } catch (_) {}
try { fs.rmSync(workflowPath, { force: true }); } catch (_) {}

console.log("Applied GeoReseaux iOS WebKit-tail patch and updated regression test.");
