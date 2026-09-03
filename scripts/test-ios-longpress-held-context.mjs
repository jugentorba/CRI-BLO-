import { readFileSync } from "node:fs";

const swiftPath = new URL(
  "../plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift",
  import.meta.url,
);
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
globalThis.CustomEvent = class extends Event {
  constructor(type, init = {}) { super(type, init); this.detail = init.detail; }
};
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
documentTarget.contains = (node) => node === documentTarget;

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
const contexts = [];
function record(name) {
  return function (event) {
    order.push(name);
    if (name === "contextmenu") {
      event.preventDefault();
      contexts.push({
        trusted: event.isTrusted,
        touchSource: Boolean(event.sourceCapabilities?.firesTouchEvents),
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        buttons: event.buttons,
        pointerType: event.pointerType,
        pointerId: event.pointerId,
        ruxit: event.isRuxitSynthetic,
      });
    }
  };
}
for (const type of ["pointerdown", "touchstart", "mousedown", "pointerup", "touchend", "mouseup", "click", "contextmenu"]) {
  canvas.addEventListener(type, record(type));
}

function trusted(event) {
  Object.defineProperty(event, "isTrusted", { configurable: true, value: true });
  return event;
}
function pointer(type, x, y, buttons, pointerId = 9) {
  canvas.dispatchEvent(trusted(new TestPointerEvent(type, {
    bubbles: true, cancelable: true,
    clientX: x, clientY: y, screenX: x, screenY: y,
    pointerId, pointerType: "touch", isPrimary: true,
    button: 0, buttons, pressure: buttons ? 1 : 0,
  })));
}
function touch(type, x, y, pointerId = 9) {
  const event = trusted(new Event(type, { bubbles: true, cancelable: true }));
  const point = {
    identifier: pointerId, target: canvas,
    clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y,
  };
  const active = type === "touchstart" ? [point] : [];
  Object.defineProperties(event, {
    touches: { value: active },
    targetTouches: { value: active },
    changedTouches: { value: [point] },
  });
  canvas.dispatchEvent(event);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Recover a hidden OpenLayers map exactly like GeoReseaux: Map is closure-local,
// but handleBrowserEvent.bind(map) exposes the instance at construction time.
let directMapCalls = 0;
const hiddenMap = {
  getViewport() { return canvas; },
  getView() { return {}; },
  getCoordinateFromPixel(pixel) { return [pixel[0] * 10, pixel[1] * 10]; },
  forEachFeatureAtPixel() { return null; },
  handleBrowserEvent() { directMapCalls += 1; },
};
const hiddenBound = hiddenMap.handleBrowserEvent.bind(hiddenMap);
canvas.addEventListener("contextmenu", hiddenBound);

// REAL Android behavior to reproduce: contextmenu occurs at the hold threshold
// WHILE the physical touch is still active, before touchend/pointerup.
pointer("pointerdown", 82, 31, 1, 9);
touch("touchstart", 82, 31, 9);
await wait(30);
if (order.join(",") !== "touchstart,pointerdown,mousedown") {
  throw new Error("Android press-start ordering mismatch: " + order.join(","));
}

await wait(620);
const firstContextIndex = order.indexOf("contextmenu");
if (firstContextIndex < 0) {
  throw new Error("contextmenu did not fire while finger was still held: " + order.join(","));
}
if (order.includes("touchend") || order.includes("pointerup") || order.includes("mouseup") || order.includes("click")) {
  throw new Error("release/click happened before hold-time contextmenu: " + order.join(","));
}
if (contexts.length !== 1) throw new Error("hold emitted contextmenu more than once: " + contexts.length);
const ctx = contexts[0];
if (!ctx.trusted || !ctx.touchSource || ctx.x !== 82 || ctx.y !== 31
    || ctx.button !== 0 || ctx.buttons !== 0 || ctx.pointerType !== "touch"
    || ctx.pointerId !== 9 || ctx.ruxit !== undefined) {
  throw new Error("hold context facade mismatch: " + JSON.stringify(ctx));
}

let diagnostics = windowTarget.__cribloGeoDiagnosticsText();
const timing = Number((diagnostics.match(/Context after touch: (-?\d+) ms/) || [])[1] || -1);
if (timing < 500 || timing > 850) {
  throw new Error("contextmenu was not emitted near the hold threshold: " + timing + "ms\n" + diagnostics);
}
if (!diagnostics.includes("Hold-time context dispatches: 1")) {
  throw new Error("hold-time dispatch counter missing: " + diagnostics);
}

// The DOM OpenLayers listener runs immediately. Because the fixture intentionally
// creates no popup, CRI-BLO must escalate to the recovered map while the touch is
// STILL held.
await wait(230);
if (directMapCalls < 2) {
  throw new Error("OpenLayers direct escalation did not run while held: " + directMapCalls);
}
diagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!/OpenLayers direct: [1-9]/.test(diagnostics)) {
  throw new Error("OpenLayers direct diagnostic missing: " + diagnostics);
}

// Release after the contextmenu. It must only balance the press; no duplicate
// contextmenu and no normal click should be delivered for the long press.
pointer("pointerup", 82, 31, 0, 9);
touch("touchend", 82, 31, 9);
await wait(160);
if (contexts.length !== 1) {
  throw new Error("release emitted a duplicate contextmenu: " + contexts.length + " / " + order.join(","));
}
if (order.includes("click")) {
  throw new Error("long-press leaked a normal click: " + order.join(","));
}
if (!order.includes("pointerup") || !order.includes("mouseup")) {
  throw new Error("release did not balance pointer/mouse press: " + order.join(","));
}

// Short tap: never emit contextmenu.
order.length = 0;
contexts.length = 0;
pointer("pointerdown", 55, 20, 1, 10);
touch("touchstart", 55, 20, 10);
await wait(80);
pointer("pointerup", 55, 20, 0, 10);
touch("touchend", 55, 20, 10);
await wait(150);
if (contexts.length !== 0 || order.includes("contextmenu")) {
  throw new Error("short tap became a long press: " + order.join(","));
}

// touchcancel AFTER threshold: contextmenu already fired while held, so cancel
// cleanup must not create a second one.
order.length = 0;
contexts.length = 0;
pointer("pointerdown", 44, 18, 1, 11);
touch("touchstart", 44, 18, 11);
await wait(650);
if (contexts.length !== 1) throw new Error("cancel-case hold missing threshold contextmenu");
touch("touchcancel", 44, 18, 11);
await wait(150);
if (contexts.length !== 1) {
  throw new Error("touchcancel duplicated hold contextmenu: " + contexts.length);
}

console.log("iOS GeoReseaux Android hold timing + active-touch OpenLayers escalation test passed");
