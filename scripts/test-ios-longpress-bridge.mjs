import { readFileSync } from "node:fs";

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
windowTarget.__cribloGeoReseauxAndroidCompat = true;
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

// Physical iPhone input arrives pointerdown before touchstart. The bridge must
// present the exact measured WORKING Android order to GeoReseaux listeners:
// touchstart -> pointerdown -> mousedown ... touchend -> pointerup -> mouseup -> click -> contextmenu.
pointer("pointerdown", 82, 31, 1);
if (order.length !== 0) throw new Error("iOS pointerdown leaked to page before touchstart: " + order.join(","));
touch("touchstart", 82, 31);
await Promise.resolve();
await wait(25);
if (order.join(",") !== "touchstart,pointerdown,mousedown") throw new Error("measured Android press order was not presented: " + order.join(","));
const md = lifecycle.find((entry) => entry.name === "mousedown");
if (!md || !md.trusted || !md.touchSource || md.which !== 1) throw new Error("mousedown trusted facade mismatch: " + JSON.stringify(md));
await wait(625);
if (context !== null) throw new Error("contextmenu fired while finger was still down: " + order.join(","));

pointer("pointerup", 82, 31, 0);
if (order.join(",") !== "touchstart,pointerdown,mousedown") throw new Error("iOS pointerup leaked to page before touchend: " + order.join(","));
touch("touchend", 82, 31);
// Simulate the delayed native callback observed on the real iPhone. It must not
// replace the already armed trusted-JS request.
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await Promise.resolve();
await wait(35);
const expected = "touchstart,pointerdown,mousedown,touchend,pointerup,mouseup,click,contextmenu";
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
const lifecycleFacadeCalls = Number((diagnostics.match(/Lifecycle facade calls: (\d+)/) || [])[1] || 0);
if (lifecycleFacadeCalls < 5) throw new Error("lifecycle facade handlers were not exercised: " + diagnostics);
if (!diagnostics.includes("contextmenu*")) throw new Error("trusted-source contextmenu missing: " + diagnostics);

// A trusted touch pointer event with no matching TouchEvent must not be lost.
// The 55ms escape hatch preserves normal Pointer Events behavior off the map path.
order.length = 0;
lifecycle.length = 0;
context = null;
pointer("pointerdown", 66, 22, 1);
if (order.length !== 0) throw new Error("unpaired pointerdown was not initially deferred");
await wait(75);
if (order.join(",") !== "pointerdown") throw new Error("unpaired pointerdown fallback was lost/duplicated: " + order.join(","));

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

// GeoReseaux's Angular bundle can hide OpenLayers from window. Reproduce that
// shape: the Map is only local, and its handleBrowserEvent.bind(map) is the
// constructor signature our document-start hook must recover.
let directMapCalls = 0;
let directMapEvent = null;
const hiddenMap = {
  getViewport() { return canvas; },
  getView() { return {}; },
  getCoordinateFromPixel(pixel) { return [pixel[0] * 10, pixel[1] * 10]; },
  forEachFeatureAtPixel(pixel, callback) { return callback({ id: 'fixture-feature' }); },
  handleBrowserEvent(event, type) {
    directMapCalls += 1;
    directMapEvent = { type: type || event.type, x: event.clientX, y: event.clientY, trusted: event.isTrusted };
  },
};
const hiddenBound = hiddenMap.handleBrowserEvent.bind(hiddenMap);
if (typeof hiddenBound !== 'function') throw new Error('hidden OpenLayers bind fixture failed');
let geoDomCalls = 0;
let geoDomTrusted = false;
canvas.addEventListener('contextmenu', (event) => {
  geoDomCalls += 1;
  geoDomTrusted = event.isTrusted === true && Boolean(event.originalEvent && event.originalEvent.isTrusted);
});
// This is the exact shape OpenLayers uses: a DOM contextmenu listener on the
// viewport which forwards into map.handleBrowserEvent.
canvas.addEventListener('contextmenu', hiddenBound);

const contextBefore = Number((windowTarget.__cribloGeoDiagnosticsText().match(/Context events: (\d+)/) || [])[1] || 0);
order.length = 0;
lifecycle.length = 0;
context = null;
pointer("pointerdown", 91, 42, 1);
touch("touchstart", 91, 42);
await wait(650);
pointer("pointerup", 91, 42, 0);
touch("touchend", 91, 42);
await wait(40);
if (geoDomCalls !== 1 || !geoDomTrusted) throw new Error('GeoReseaux DOM context handler was bypassed or untrusted: calls=' + geoDomCalls + ' trusted=' + geoDomTrusted);
if (directMapCalls !== 1) throw new Error('OpenLayers viewport listener was not called exactly once through DOM: ' + directMapCalls);
if (!directMapEvent || directMapEvent.type !== 'contextmenu' || directMapEvent.x !== 91 || directMapEvent.y !== 42 || !directMapEvent.trusted) {
  throw new Error('OpenLayers DOM-forwarded event mismatch: ' + JSON.stringify(directMapEvent));
}
const directDiagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!directDiagnostics.includes('OpenLayers direct: 0 / feature hits: 0 / recovery: OpenLayers-bound')) throw new Error('bridge incorrectly bypassed DOM with direct OpenLayers call: ' + directDiagnostics);
const contextAfter = Number((directDiagnostics.match(/Context events: (\d+)/) || [])[1] || 0);
if (contextAfter !== contextBefore + 1) throw new Error('GeoReseaux DOM contextmenu was not dispatched exactly once: ' + directDiagnostics);

console.log("iOS GeoReseaux exact lifecycle + DOM-first hidden OpenLayers bridge test passed");
