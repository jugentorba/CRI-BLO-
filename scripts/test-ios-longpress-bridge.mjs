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
  constructor(type, init = {}) {
    super(type, init);
    this.detail = init.detail;
  }
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

let received = null;
let pageOrder = [];

function pageContextHandler(event) {
  event.preventDefault();
  pageOrder.push("contextmenu");
  received = {
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
  };
}

function trustedEvent(event) {
  Object.defineProperty(event, "isTrusted", { configurable: true, value: true });
  return event;
}

function pointer(type, x, y, buttons) {
  canvas.dispatchEvent(trustedEvent(new TestPointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    pointerId: 9,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons,
    pressure: buttons ? 1 : 0,
  })));
}

function mouse(type, x, y, buttons) {
  canvas.dispatchEvent(trustedEvent(new TestPointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons,
  })));
}

function touch(type, x, y) {
  const event = trustedEvent(new Event(type, { bubbles: true, cancelable: true }));
  const point = {
    identifier: 9,
    target: canvas,
    clientX: x,
    clientY: y,
    pageX: x,
    pageY: y,
    screenX: x,
    screenY: y,
  };
  const active = type === "touchstart" ? [point] : [];
  Object.defineProperties(event, {
    touches: { value: active },
    targetTouches: { value: active },
    changedTouches: { value: [point] },
  });
  canvas.dispatchEvent(event);
}

const wait = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
for (const type of ["pointerdown", "touchstart", "pointerup", "touchend", "mousedown", "mouseup", "click"]) {
  canvas.addEventListener(type, () => pageOrder.push(type));
}
canvas.addEventListener("contextmenu", pageContextHandler);

// Working Android behavior: contextmenu happens around the hold threshold while
// the finger is still down, before pointerup/touchend.
pointer("pointerdown", 82, 31, 1);
touch("touchstart", 82, 31);
await wait(1);
if (!windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5)) {
  throw new Error("native hold request was rejected");
}
await wait(20);
if (!received) {
  throw new Error("contextmenu did not fire at native hold: " + pageOrder.join(","));
}
if (pageOrder.join(",") !== "pointerdown,touchstart,contextmenu") {
  throw new Error("hold-time order is wrong: " + pageOrder.join(","));
}
if (![received.trusted, received.prevented, received.target, received.pointerEvent, received.touchSource].every(Boolean)) {
  throw new Error("hold facade is wrong: " + JSON.stringify(received));
}
if (received.clientX !== 82 || received.clientY !== 31) {
  throw new Error("hold coordinates changed: " + JSON.stringify(received));
}
if (received.button !== 0 || received.buttons !== 0 || received.pointerType !== "touch") {
  throw new Error("contextmenu shape is wrong: " + JSON.stringify(received));
}

// The later physical release and compatibility mouse tail must never duplicate
// the menu that already fired at hold time.
pointer("pointerup", 82, 31, 0);
touch("touchend", 82, 31);
mouse("mousedown", 82, 31, 1);
mouse("mouseup", 82, 31, 0);
mouse("click", 82, 31, 0);
await wait(30);
if (pageOrder.filter((name) => name === "contextmenu").length !== 1) {
  throw new Error("release duplicated contextmenu: " + pageOrder.join(","));
}
const expected = "pointerdown,touchstart,contextmenu,pointerup,touchend,mousedown,mouseup,click";
if (pageOrder.join(",") !== expected) {
  throw new Error("full event order is wrong: " + pageOrder.join(","));
}

// WKWebView can occasionally deliver the native recognition just before DOM
// touchstart. The first real touchstart must bind the true target/point and then
// fire immediately, not wait for finger release.
received = null;
pageOrder = [];
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait(5);
pointer("pointerdown", 73, 27, 1);
touch("touchstart", 73, 27);
await wait(20);
if (!received || received.clientX !== 73 || received.clientY !== 27) {
  throw new Error("delayed touch binding failed: " + JSON.stringify(received));
}
if (pageOrder.join(",") !== "pointerdown,touchstart,contextmenu") {
  throw new Error("delayed hold order is wrong: " + pageOrder.join(","));
}
pointer("pointerup", 73, 27, 0);
touch("touchend", 73, 27);
await wait(20);
if (pageOrder.filter((name) => name === "contextmenu").length !== 1) {
  throw new Error("delayed release duplicated contextmenu: " + pageOrder.join(","));
}

const diagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!diagnostics.includes("Native waits for touchstart: 1")) {
  throw new Error("native wait was not recorded: " + diagnostics);
}
if (!diagnostics.includes("Native/touch coordinate delta: 27,23")) {
  throw new Error("coordinate correction was not recorded: " + diagnostics);
}
if (!diagnostics.includes("Release completions: 0")) {
  throw new Error("bridge still waits for release: " + diagnostics);
}
if (!diagnostics.includes("Synthetic press/release: pd=0 md=0 pu=0 mu=0 click=0")) {
  throw new Error("bridge fabricated low-level events: " + diagnostics);
}
if (!diagnostics.includes("contextmenu*")) {
  throw new Error("trusted-source contextmenu trace missing: " + diagnostics);
}

canvas.removeEventListener("contextmenu", pageContextHandler);
received = null;
pageOrder = [];
pointer("pointerdown", 60, 20, 1);
touch("touchstart", 60, 20);
await wait(1);
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait(20);
if (received !== null) {
  throw new Error("wrapped listener removal identity is broken");
}

console.log("iOS GeoReseaux Android-timed hold bridge test passed");
