import fs from 'node:fs';

const swiftPath = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';
const testPath = 'scripts/test-ios-longpress-bridge.mjs';

function replaceOnce(text, label, from, to) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: source block not found`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: source block not unique`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

let swift = fs.readFileSync(swiftPath, 'utf8');

swift = replaceOnce(swift, 'compat facade receiver',
`          cached = new Proxy(event, {\n            get: function (raw, prop) {`,
`          cached = new Proxy(event, {\n            get: function (raw, prop, receiver) {`);

swift = replaceOnce(swift, 'compat facade properties',
`              if (prop === 'isTrusted') return sourceIsTrusted;\n              if (prop === 'sourceCapabilities') return { firesTouchEvents: true };`,
`              if (prop === 'isTrusted') return sourceIsTrusted;\n              if (prop === 'sourceCapabilities') return { firesTouchEvents: true };\n              if (prop === 'which' && /^(mousedown|mouseup|click|contextmenu)$/.test(String(raw.type || ''))) return 1;\n              if ((prop === 'originalEvent' || prop === 'nativeEvent' || prop === 'srcEvent') && sourceIsTrusted) return receiver;`);

swift = replaceOnce(swift, 'wrapper counters',
`          if (presented !== event) __cribloGeoDiag.wrappedContextCalls++;`,
`          if (presented !== event) {\n            if (String(event.type || '').toLowerCase() === 'contextmenu') __cribloGeoDiag.wrappedContextCalls++;\n            else __cribloGeoDiag.wrappedLifecycleCalls++;\n          }`);

swift = replaceOnce(swift, 'wrap lifecycle listeners',
`            if (listener && name === 'contextmenu') {\n              return __cribloOriginalAddEventListener.call(this, type, wrappedContextListener(this, listener, options), options);\n            }`,
`            if (listener && /^(contextmenu|mousedown|mouseup|click|pointerdown|pointerup)$/.test(name)) {\n              return __cribloOriginalAddEventListener.call(this, type, wrappedContextListener(this, listener, options), options);\n            }`);

swift = replaceOnce(swift, 'remove lifecycle listener wrappers',
`            if (listener && String(type || '').toLowerCase() === 'contextmenu') {\n              var wrapper = existingContextWrapper(this, listener, options);\n              if (wrapper) return __cribloOriginalRemoveEventListener.call(this, type, wrapper, options);\n            }`,
`            if (listener && /^(contextmenu|mousedown|mouseup|click|pointerdown|pointerup)$/.test(String(type || '').toLowerCase())) {\n              var wrapper = existingContextWrapper(this, listener, options);\n              if (wrapper) return __cribloOriginalRemoveEventListener.call(this, type, wrapper, options);\n            }`);

swift = replaceOnce(swift, 'lifecycle diagnostic field',
`        wrappedContextCalls: 0,\n        nativeRecognizerFires: 0,`,
`        wrappedContextCalls: 0,\n        wrappedLifecycleCalls: 0,\n        nativeRecognizerFires: 0,`);

swift = replaceOnce(swift, 'trusted synthetic mouse helper',
`      function mouse(target, type, x, y, button, buttons) {\n        try {\n          var event = new MouseEvent(type, {\n            bubbles: true,\n            cancelable: true,\n            composed: true,\n            clientX: x,\n            clientY: y,\n            screenX: x,\n            screenY: y,\n            button: button,\n            buttons: buttons,\n            view: window\n          });\n          return !target.dispatchEvent(event) || event.defaultPrevented;\n        } catch (_) {\n          try {\n            var legacy = document.createEvent('MouseEvents');\n            legacy.initMouseEvent(type, true, true, window, 1, x, y, x, y,\n              false, false, false, false, button, null);\n            return !target.dispatchEvent(legacy) || legacy.defaultPrevented;\n          } catch (_) {\n            return false;\n          }\n        }\n      }`,
`      function mouse(target, type, x, y, button, buttons, sourceEvent) {\n        try {\n          var event = new MouseEvent(type, {\n            bubbles: true,\n            cancelable: true,\n            composed: true,\n            clientX: x,\n            clientY: y,\n            screenX: x,\n            screenY: y,\n            button: button,\n            buttons: buttons,\n            detail: 1,\n            view: window\n          });\n          if (sourceEvent) {\n            __cribloSyntheticContextEvents.add(event);\n            __cribloSyntheticContextSources.set(event, sourceEvent);\n          }\n          return !target.dispatchEvent(event) || event.defaultPrevented;\n        } catch (_) {\n          try {\n            var legacy = document.createEvent('MouseEvents');\n            legacy.initMouseEvent(type, true, true, window, 1, x, y, x, y,\n              false, false, false, false, button, null);\n            if (sourceEvent) {\n              __cribloSyntheticContextEvents.add(legacy);\n              __cribloSyntheticContextSources.set(legacy, sourceEvent);\n            }\n            return !target.dispatchEvent(legacy) || legacy.defaultPrevented;\n          } catch (_) {\n            return false;\n          }\n        }\n      }`);

swift = replaceOnce(swift, 'compat press state',
`      var pendingNativeLongPress = null;\n      var nativeLongPressSequence = 0;`,
`      var pendingNativeLongPress = null;\n      var nativeLongPressSequence = 0;\n      var compatSyntheticMouseDownTarget = null;\n      var compatSyntheticMouseDownX = 0;\n      var compatSyntheticMouseDownY = 0;\n      var compatSyntheticMouseDownAt = 0;\n      var compatPressMoved = false;`);

const oldEnsure = `      function ensureAndroidPressStart(target, x, y, touchStartedAt) {\n        if (!target || !target.dispatchEvent) return;\n        // The Android trace has pointerdown/mousedown AFTER touchstart. Only\n        // synthesize a missing event when WebKit did not provide a trusted one\n        // after this touchstart.\n        var pointerNearTouchStart = lastRealPointerDownTarget === target\n          && lastRealPointerDownAt > 0\n          && Math.abs(lastRealPointerDownAt - touchStartedAt) < 160;\n        if (!pointerNearTouchStart) {\n          try {\n            if (typeof PointerEvent === 'function') {\n              target.dispatchEvent(new PointerEvent('pointerdown', {\n                bubbles:true,cancelable:true,composed:true,\n                clientX:x,clientY:y,screenX:x,screenY:y,\n                button:0,buttons:1,pointerId:realTouchIdentifier == null ? 1 : realTouchIdentifier,\n                pointerType:'touch',isPrimary:true,width:9,height:9,pressure:1,view:window\n              }));\n              __cribloGeoDiag.syntheticPointerDowns++;\n              traceAndroidEvent('pointerdown', false);\n            }\n          } catch (_) {}\n        }\n        if (!(lastRealMouseDownTarget === target && lastRealMouseDownAt >= touchStartedAt)) {\n          mouse(target, 'mousedown', x, y, 0, 1);\n          __cribloGeoDiag.syntheticMouseDowns++;\n          traceAndroidEvent('mousedown', false);\n        }\n      }`;

const newEnsure = `      function ensureAndroidPressStart(target, x, y, touchStartedAt, sourceEvent) {\n        if (!target || !target.dispatchEvent) return;\n        // WKWebView supplies a real touch pointerdown, usually just BEFORE\n        // touchstart. Treat that as the Android pointerdown instead of creating\n        // a duplicate. What iOS does not supply on a long touch is Chrome's\n        // compatibility mousedown, so create that immediately after touchstart.\n        var pointerNearTouchStart = lastRealPointerDownTarget === target\n          && lastRealPointerDownAt > 0\n          && Math.abs(lastRealPointerDownAt - touchStartedAt) < 160;\n        if (!pointerNearTouchStart) {\n          try {\n            if (typeof PointerEvent === 'function') {\n              var pd = new PointerEvent('pointerdown', {\n                bubbles:true,cancelable:true,composed:true,\n                clientX:x,clientY:y,screenX:x,screenY:y,\n                button:0,buttons:1,pointerId:realTouchIdentifier == null ? 1 : realTouchIdentifier,\n                pointerType:'touch',isPrimary:true,width:9,height:9,pressure:1,view:window\n              });\n              if (sourceEvent) {\n                __cribloSyntheticContextEvents.add(pd);\n                __cribloSyntheticContextSources.set(pd, sourceEvent);\n              }\n              target.dispatchEvent(pd);\n              __cribloGeoDiag.syntheticPointerDowns++;\n              traceAndroidEvent('pointerdown', false);\n            }\n          } catch (_) {}\n        }\n        var mouseNearTouchStart = lastRealMouseDownTarget === target\n          && lastRealMouseDownAt > 0\n          && Math.abs(lastRealMouseDownAt - touchStartedAt) < 160;\n        if (!mouseNearTouchStart && compatSyntheticMouseDownTarget !== target) {\n          mouse(target, 'mousedown', x, y, 0, 1, sourceEvent);\n          __cribloGeoDiag.syntheticMouseDowns++;\n          traceAndroidEvent('mousedown', false);\n          compatSyntheticMouseDownTarget = target;\n          compatSyntheticMouseDownX = x;\n          compatSyntheticMouseDownY = y;\n          compatSyntheticMouseDownAt = Date.now();\n          compatPressMoved = false;\n        }\n      }\n\n      function finishAndroidCompatibilityMouse(request, includeClick) {\n        if (!request || !request.target) return;\n        var target = request.target;\n        var x = request.x == null ? compatSyntheticMouseDownX : request.x;\n        var y = request.y == null ? compatSyntheticMouseDownY : request.y;\n        var releaseAt = request.releasedAt || Date.now();\n        var source = request.releaseEvent || request.sourceEvent || null;\n        var hadPress = compatSyntheticMouseDownTarget === target\n          || (lastRealMouseDownTarget === target && lastRealMouseDownAt >= (request.touchStartedAt || 0) - 160);\n        if (!hadPress) return;\n\n        var hasRealMouseUp = lastRealMouseUpTarget === target && lastRealMouseUpAt >= releaseAt - 20;\n        if (!hasRealMouseUp) {\n          mouse(target, 'mouseup', x, y, 0, 0, source);\n          __cribloGeoDiag.syntheticMouseUps++;\n          traceAndroidEvent('mouseup', false);\n        }\n\n        var hasRealClick = lastRealClickTarget === target && lastRealClickAt >= releaseAt - 20;\n        if (includeClick && !compatPressMoved && !hasRealClick) {\n          mouse(target, 'click', x, y, 0, 0, source);\n          __cribloGeoDiag.syntheticClicks++;\n          traceAndroidEvent('click', false);\n        }\n\n        compatSyntheticMouseDownTarget = null;\n        compatSyntheticMouseDownAt = 0;\n        compatPressMoved = false;\n      }`;
swift = replaceOnce(swift, 'Android press/tail helpers', oldEnsure, newEnsure);

swift = replaceOnce(swift, 'complete compatibility tail',
`        var source = request.sourceEvent || request.releaseEvent || request.tailEvent || null;\n        var dispatched = contextMenu(target, x, y, source);`,
`        var source = request.sourceEvent || request.releaseEvent || request.tailEvent || null;\n        // iOS long-presses do not emit Chrome's mouseup/click compatibility\n        // tail. Rebuild only the missing tail, then contextmenu is last.\n        finishAndroidCompatibilityMouse(request, true);\n        var dispatched = contextMenu(target, x, y, source);`);

swift = replaceOnce(swift, 'remove delayed native mousedown',
`        ensureAndroidPressStart(request.target, request.x, request.y, request.touchStartedAt);\n        clearRealTouchTimer();`,
`        clearRealTouchTimer();`);

swift = replaceOnce(swift, 'remove delayed JS mousedown',
`        lastRealTouchLongPressAt = Date.now();\n        ensureAndroidPressStart(request.target, request.x, request.y, request.touchStartedAt);\n        __cribloGeoDiag.jsHoldArms++;`,
`        lastRealTouchLongPressAt = Date.now();\n        __cribloGeoDiag.jsHoldArms++;`);

for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
  swift = replaceOnce(swift, `raw ${type} observer`,
    `      document.addEventListener('${type}', function (event) {`,
    `      __cribloOriginalAddEventListener.call(document, '${type}', function (event) {`);
}

swift = replaceOnce(swift, 'touchstart immediate Android press',
`          realTouchFired = false;\n          realTouchTimer = null;\n          if (event.isTrusted) {\n            realTouchTimer = setTimeout(function () {\n              fireRealTouchLongPress();\n            }, 600);\n          }`,
`          realTouchFired = false;\n          realTouchTimer = null;\n          if (event.isTrusted) {\n            // Android Chrome creates its compatibility mouse press near the\n            // beginning of the touch, not 600 ms later. Run after this genuine\n            // touchstart finishes propagation so page touch handlers stay first.\n            var pressTarget = target;\n            var pressX = realTouchX;\n            var pressY = realTouchY;\n            var pressStartedAt = touchStartNow;\n            var pressSource = event;\n            setTimeout(function () {\n              if (realTouchTarget === pressTarget && lastRealTouchStartAt === pressStartedAt) {\n                ensureAndroidPressStart(pressTarget, pressX, pressY, pressStartedAt, pressSource);\n              }\n            }, 0);\n            realTouchTimer = setTimeout(function () {\n              fireRealTouchLongPress();\n            }, 600);\n          }`);

swift = replaceOnce(swift, 'touchmove compatibility movement',
`          if ((dx * dx + dy * dy) > 784) clearRealTouchTimer();`,
`          if ((dx * dx + dy * dy) > 784) {\n            compatPressMoved = true;\n            clearRealTouchTimer();\n          }`);

swift = replaceOnce(swift, 'touchcancel cleanup signature',
`      document.addEventListener('touchcancel', function () {\n        clearRealTouchTimer();`,
`      document.addEventListener('touchcancel', function (event) {\n        clearRealTouchTimer();\n        if (compatSyntheticMouseDownTarget) {\n          finishAndroidCompatibilityMouse({\n            target: compatSyntheticMouseDownTarget,\n            x: compatSyntheticMouseDownX,\n            y: compatSyntheticMouseDownY,\n            releaseEvent: event || null,\n            releasedAt: Date.now(),\n            touchStartedAt: lastRealTouchStartAt\n          }, false);\n        }`);

swift = replaceOnce(swift, 'release fallback timing and short-tap cleanup',
`            // The live iPhone diagnostic proves mousedown/mouseup/click arrive\n            // after touchend. Do not race them with setTimeout(0). Give WebKit\n            // time to deliver its real click; the click capture listener above\n            // will schedule contextmenu after the click has fully propagated.\n            setTimeout(function () {\n              if (pendingNativeLongPress === request && request.armed && !request.tailCompletionScheduled) {\n                request.tailCompletionScheduled = true;\n                completeAndroidLongPress(request, 'no-trusted-click-fallback');\n              }\n            }, 320);\n          }`,
`            // The real iPhone trace shows no WebKit mouseup/click for a hold.\n            // Finish the Android compatibility mouse tail in the next task, after\n            // GeoReseaux's genuine touchend handlers have completed. If WebKit\n            // did produce a real click, the capture listener wins and this is a no-op.\n            setTimeout(function () {\n              if (pendingNativeLongPress === request && request.armed && !request.tailCompletionScheduled) {\n                request.tailCompletionScheduled = true;\n                completeAndroidLongPress(request, 'android-compat-tail');\n              }\n            }, 0);\n          } else if (compatSyntheticMouseDownTarget) {\n            var tapCleanup = {\n              target: compatSyntheticMouseDownTarget,\n              x: compatSyntheticMouseDownX,\n              y: compatSyntheticMouseDownY,\n              releaseEvent: event || null,\n              releasedAt: releaseAt,\n              touchStartedAt: lastRealTouchStartAt\n            };\n            setTimeout(function () { finishAndroidCompatibilityMouse(tapCleanup, false); }, 80);\n          }`);

swift = replaceOnce(swift, 'diagnostic lifecycle line',
`          'Trusted-facade handler calls: ' + __cribloGeoDiag.directTrustedHandlerFires,`,
`          'Trusted-facade handler calls: ' + __cribloGeoDiag.directTrustedHandlerFires,\n          'Lifecycle facade calls: ' + __cribloGeoDiag.wrappedLifecycleCalls,`);

fs.writeFileSync(swiftPath, swift);

const test = String.raw`import { readFileSync } from "node:fs";

const swiftPath = new URL("../plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift", import.meta.url);
const swift = readFileSync(swiftPath, "utf8");
const match = swift.match(/private static let longPressBridgeScript = #\"\"\"([\s\S]*?)\"\"\"#/);
if (!match) throw new Error("iOS long-press bridge script was not found");

class TestPointerEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    for (const [key, value] of Object.entries(init)) {
      if (["bubbles", "cancelable", "composed"].includes(key)) continue;
      Object.defineProperty(this, key, { configurable: true, value });
    }
  }
}
globalThis.PointerEvent = TestPointerEvent;
globalThis.MouseEvent = TestPointerEvent;
globalThis.CustomEvent = class extends Event { constructor(type, init = {}) { super(type, init); this.detail = init.detail; } };
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};
globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });

const documentTarget = new EventTarget();
documentTarget.querySelectorAll = () => [];
documentTarget.scripts = [];
documentTarget.parentNode = null;
documentTarget.parentElement = null;
documentTarget.nodeType = 1;
documentTarget.tagName = "CANVAS";
documentTarget.id = "";
documentTarget.className = "";
documentTarget.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
documentTarget.closest = () => null;
const windowTarget = new EventTarget();
windowTarget.window = windowTarget;
windowTarget.document = documentTarget;
windowTarget.innerWidth = 200;
windowTarget.innerHeight = 100;
windowTarget.scrollX = 0;
windowTarget.scrollY = 0;
windowTarget.frames = [];
windowTarget.location = { href: "https://sigreseaux.orange.fr/ger/" };
windowTarget.getSelection = () => ({ removeAllRanges() {} });
const canvas = documentTarget;
documentTarget.elementsFromPoint = () => [canvas];
documentTarget.elementFromPoint = () => canvas;
globalThis.window = windowTarget;
globalThis.document = documentTarget;
globalThis.location = windowTarget.location;
new Function(match[1])();

const order = [];
const lifecycle = [];
let context = null;
function record(name) {
  return function (event) {
    order.push(name);
    lifecycle.push({ name, trusted: event.isTrusted, touchSource: Boolean(event.sourceCapabilities?.firesTouchEvents), which: event.which });
  };
}
for (const type of ["pointerdown", "touchstart", "mousedown", "pointerup", "touchend", "mouseup", "click"]) canvas.addEventListener(type, record(type));
canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  order.push("contextmenu");
  context = {
    trusted: event.isTrusted,
    prevented: event.defaultPrevented,
    target: event.target === canvas,
    pointerEvent: event instanceof TestPointerEvent,
    touchSource: Boolean(event.sourceCapabilities?.firesTouchEvents),
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    pointerType: event.pointerType,
    originalTrusted: Boolean(event.originalEvent?.isTrusted),
  };
});

function trusted(event) { Object.defineProperty(event, "isTrusted", { configurable: true, value: true }); return event; }
function pointer(type, x, y, buttons) {
  canvas.dispatchEvent(trusted(new TestPointerEvent(type, { bubbles:true, cancelable:true, clientX:x, clientY:y, screenX:x, screenY:y, pointerId:9, pointerType:"touch", isPrimary:true, button:0, buttons, pressure:buttons ? 1 : 0 })));
}
function touch(type, x, y) {
  const event = trusted(new Event(type, { bubbles:true, cancelable:true }));
  const point = { identifier:9, target:canvas, clientX:x, clientY:y, pageX:x, pageY:y, screenX:x, screenY:y };
  const active = type === "touchstart" ? [point] : [];
  Object.defineProperties(event, { touches:{value:active}, targetTouches:{value:active}, changedTouches:{value:[point]} });
  canvas.dispatchEvent(event);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Real iPhone long-hold sequence from the user's diagnostic: trusted pointerdown
// arrives before trusted touchstart, and WKWebView supplies no mouseup/click tail.
pointer("pointerdown", 82, 31, 1);
touch("touchstart", 82, 31);
await wait(25);
if (order.join(",") !== "pointerdown,touchstart,mousedown") throw new Error("Android mousedown was not prepared near touchstart: " + order.join(","));
const md = lifecycle.find((entry) => entry.name === "mousedown");
if (!md || !md.trusted || !md.touchSource || md.which !== 1) throw new Error("mousedown trusted facade mismatch: " + JSON.stringify(md));
await wait(625);
if (context !== null) throw new Error("contextmenu fired while finger was still down: " + order.join(","));

pointer("pointerup", 82, 31, 0);
touch("touchend", 82, 31);
// Simulate the delayed native callback observed on the real iPhone. It must not
// replace the already armed trusted-JS request.
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait(35);
const expected = "pointerdown,touchstart,mousedown,pointerup,touchend,mouseup,click,contextmenu";
if (order.join(",") !== expected) throw new Error("real-iPhone -> Android lifecycle mismatch: " + order.join(","));
for (const name of ["mousedown", "mouseup", "click"]) {
  const event = lifecycle.find((entry) => entry.name === name);
  if (!event || !event.trusted || !event.touchSource || event.which !== 1) throw new Error(name + " facade mismatch: " + JSON.stringify(event));
}
if (!context || !context.trusted || !context.prevented || !context.target || !context.pointerEvent || !context.touchSource || !context.originalTrusted) throw new Error("context facade mismatch: " + JSON.stringify(context));
if (context.clientX !== 82 || context.clientY !== 31 || context.button !== 0 || context.buttons !== 0 || context.pointerType !== "touch") throw new Error("context shape mismatch: " + JSON.stringify(context));

const diagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!diagnostics.includes("JS trusted hold arms: 1")) throw new Error("trusted JS hold did not arm: " + diagnostics);
if (!diagnostics.includes("Late native bridge suppressed: 1")) throw new Error("late native callback not suppressed: " + diagnostics);
if (!diagnostics.includes("Synthetic press/release: pd=0 md=1 pu=0 mu=1 click=1")) throw new Error("compatibility tail counters wrong: " + diagnostics);
if (!diagnostics.includes("Release completions: 1")) throw new Error("release completion missing: " + diagnostics);
if (!diagnostics.includes("Lifecycle facade calls: 3")) throw new Error("lifecycle facade handlers were not exercised: " + diagnostics);
if (!diagnostics.includes("contextmenu*")) throw new Error("trusted-source contextmenu missing: " + diagnostics);

// A short tap must never become a hold. Its synthetic Android mousedown is
// balanced with mouseup so GeoReseaux cannot be left in a pressed state.
order.length = 0;
lifecycle.length = 0;
context = null;
pointer("pointerdown", 70, 26, 1);
touch("touchstart", 70, 26);
await wait(25);
pointer("pointerup", 70, 26, 0);
touch("touchend", 70, 26);
await wait(120);
if (order.includes("contextmenu")) throw new Error("short tap became a long hold: " + order.join(","));
if (!order.includes("mousedown") || !order.includes("mouseup")) throw new Error("short-tap compatibility press was not balanced: " + order.join(","));

console.log("iOS GeoReseaux real-iPhone to exact-Android lifecycle test passed");
`;
fs.writeFileSync(testPath, test);

console.log('Patched GeoReseaux exact Android compatibility lifecycle.');
