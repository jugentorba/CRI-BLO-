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
    button: event.button,
    buttons: event.buttons,
    pointerType: event.pointerType,
  };
}

function trustedEvent(event) {
  Object.defineProperty(event, "isTrusted", { configurable: true, value: true });
  return event;
}

function realPointerEvent(type, x, y, buttons) {
  const event = trustedEvent(
    new TestPointerEvent(type, {
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
    }),
  );
  canvas.dispatchEvent(event);
}

function realMouseEvent(type, x, y, buttons) {
  const event = trustedEvent(
    new TestPointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons,
    }),
  );
  canvas.dispatchEvent(event);
}

function realTouchEvent(type, x, y) {
  const event = trustedEvent(new Event(type, { bubbles: true, cancelable: true }));
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

function installOrderListeners() {
  for (const type of [
    "touchstart",
    "pointerdown",
    "mousedown",
    "touchend",
    "pointerup",
    "mouseup",
    "click",
  ]) {
    canvas.addEventListener(type, () => pageOrder.push(type));
  }
}

function androidPressStart(x, y) {
  // Exact order measured on the working Android CRI-BLO WebView.
  realTouchEvent("touchstart", x, y);
  realPointerEvent("pointerdown", x, y, 1);
  realMouseEvent("mousedown", x, y, 1);
}

function androidReleaseTail(x, y) {
  // Exact release tail measured on Android. contextmenu is emitted by the
  // iOS bridge after this tail, so it must not be manually dispatched here.
  realTouchEvent("touchend", x, y);
  realPointerEvent("pointerup", x, y, 0);
  realMouseEvent("mouseup", x, y, 0);
  realMouseEvent("click", x, y, 0);
}

canvas.addEventListener("contextmenu", pageContextHandler);
installOrderListeners();

// Normal WKWebView path: the page sees the physical touch first. The native
// 600 ms recognizer only ARMS the compatibility gesture. It must not dispatch
// contextmenu until the user releases and the Android-style release tail ends.
androidPressStart(82, 31);
await wait(1);

if (!windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5)) {
  throw new Error("native long-press bridge did not accept the hold request");
}
await wait();

if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(`contextmenu fired before release: ${pageOrder.join(",")}`);
}

androidReleaseTail(82, 31);
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
if (received.button !== 0 || received.buttons !== 0 || received.pointerType !== "touch") {
  throw new Error(`contextmenu shape does not match Android: ${JSON.stringify(received)}`);
}

const expectedOrder =
  "touchstart,pointerdown,mousedown,touchend,pointerup,mouseup,click,contextmenu";
if (pageOrder.join(",") !== expectedOrder) {
  throw new Error(`normal Android event order is wrong: ${pageOrder.join(",")}`);
}

// Delayed WKWebView path observed on-device: the native recognizer can arrive
// before DOM touchstart. It must wait, arm once touchstart arrives, and still
// hold contextmenu until the release tail has completed.
received = null;
pageOrder = [];
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait(5);
androidPressStart(73, 27);
await wait();

if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(`delayed path fired contextmenu before release: ${pageOrder.join(",")}`);
}

androidReleaseTail(73, 27);
await wait();

if (!received || received.clientX !== 73 || received.clientY !== 27) {
  throw new Error(`delayed touch coordinates were not preserved: ${JSON.stringify(received)}`);
}
if (pageOrder.join(",") !== expectedOrder) {
  throw new Error(`delayed Android event order is wrong: ${pageOrder.join(",")}`);
}

const diagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!diagnostics.includes("Native waits for touchstart: 1")) {
  throw new Error(`delayed native wait was not recorded: ${diagnostics}`);
}
if (!diagnostics.includes("Native/touch coordinate delta: 27,23")) {
  throw new Error(`touch coordinate correction was not recorded: ${diagnostics}`);
}
if (!diagnostics.includes("Release completions: 2")) {
  throw new Error(`release completion count is wrong: ${diagnostics}`);
}
if (!diagnostics.includes("contextmenu*")) {
  throw new Error(`trusted-source contextmenu was not recorded: ${diagnostics}`);
}

// Listener removal must still preserve the page's original listener identity.
canvas.removeEventListener("contextmenu", pageContextHandler);
received = null;
pageOrder = [];
androidPressStart(60, 20);
await wait(1);
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait();
androidReleaseTail(60, 20);
await wait();

if (received !== null) {
  throw new Error("wrapped context listener was not removed by its original identity");
}

console.log("iOS GeoReseaux Android-order long-press bridge test passed");
