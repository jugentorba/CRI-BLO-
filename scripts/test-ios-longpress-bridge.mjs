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
globalThis.getComputedStyle = () => ({
  display: "block",
  visibility: "visible",
  opacity: "1",
});

const documentTarget = new EventTarget();
documentTarget.querySelectorAll = () => [];
documentTarget.scripts = [];
documentTarget.parentNode = null;
documentTarget.parentElement = null;
documentTarget.nodeType = 1;
documentTarget.tagName = "CANVAS";
documentTarget.id = "";
documentTarget.className = "";
documentTarget.getBoundingClientRect = () => ({
  left: 0,
  top: 0,
  width: 200,
  height: 100,
});
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
documentTarget.elementsFromPoint = () => [documentTarget];
documentTarget.elementFromPoint = () => documentTarget;
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
    currentTarget: event.currentTarget === canvas,
    pointerEvent: event instanceof TestPointerEvent,
    touchSource: Boolean(event.sourceCapabilities?.firesTouchEvents),
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

function realPointerDown(x, y) {
  const event = new TestPointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 9,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 1,
  });
  Object.defineProperty(event, "isTrusted", { value: true });
  canvas.dispatchEvent(event);
}

function realTouchEvent(type, x, y) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "isTrusted", { value: true });
  const touch = {
    identifier: 9,
    target: canvas,
    clientX: x,
    clientY: y,
    pageX: x,
    pageY: y,
    screenX: x,
    screenY: y,
  };
  const active = type === "touchstart" ? [touch] : [];
  Object.defineProperties(event, {
    touches: { value: active },
    targetTouches: { value: active },
    changedTouches: { value: [touch] },
  });
  canvas.dispatchEvent(event);
}

function wait(ms = 15) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

canvas.addEventListener("contextmenu", pageContextHandler);
canvas.addEventListener("touchstart", () => pageOrder.push("touchstart"));

// Normal WebKit ordering: the physical touch reaches the page before the
// native recognizer fires. The context event must use exact touch coordinates.
realPointerDown(82, 31);
realTouchEvent("touchstart", 82, 31);

if (!windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5)) {
  throw new Error("native long-press bridge did not accept the hold request");
}
await wait();

const normalFlags = received && [
  received.trusted,
  received.prevented,
  received.target,
  received.pointerEvent,
  received.touchSource,
];
if (!received || normalFlags.some((value) => value !== true)) {
  throw new Error(`trusted browser-path facade failed: ${JSON.stringify(received)}`);
}
if (received.clientX !== 82 || received.clientY !== 31) {
  throw new Error(`native estimate replaced real touch coordinates: ${JSON.stringify(received)}`);
}
if (pageOrder.join(",") !== "touchstart,contextmenu") {
  throw new Error(`normal event order is wrong: ${pageOrder.join(",")}`);
}

// Delayed WKWebView ordering observed on-device: native recognition arrives
// first. The bridge must wait for touchstart to finish propagating, then emit
// contextmenu with that touch's coordinates rather than the WebView estimate.
realTouchEvent("touchend", 82, 31);
received = null;
pageOrder = [];
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait(5);
realPointerDown(73, 27);
realTouchEvent("touchstart", 73, 27);
await wait();

if (!received || received.clientX !== 73 || received.clientY !== 27) {
  throw new Error(`delayed touch coordinates were not preserved: ${JSON.stringify(received)}`);
}
if (pageOrder.join(",") !== "touchstart,contextmenu") {
  throw new Error(`delayed event order is wrong: ${pageOrder.join(",")}`);
}
const diagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!diagnostics.includes("Native waits for touchstart: 1")) {
  throw new Error(`delayed native wait was not recorded: ${diagnostics}`);
}
if (!diagnostics.includes("Native/touch coordinate delta: 27,23")) {
  throw new Error(`touch coordinate correction was not recorded: ${diagnostics}`);
}

canvas.removeEventListener("contextmenu", pageContextHandler);
realTouchEvent("touchend", 73, 27);
received = null;
realPointerDown(60, 20);
realTouchEvent("touchstart", 60, 20);
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait();

if (received !== null) {
  throw new Error("wrapped context listener was not removed by its original identity");
}

console.log("iOS long-press browser-path facade test passed");
