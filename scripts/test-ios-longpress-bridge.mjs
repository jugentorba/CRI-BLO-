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
    "pointerdown",
    "touchstart",
    "pointerup",
    "touchend",
    "mousedown",
    "mouseup",
    "click",
  ]) {
    canvas.addEventListener(type, () => pageOrder.push(type));
  }
}

// This is the order measured on the user's real iPhone WKWebView diagnostic:
// trusted pointerdown can arrive before touchstart, while the trusted mouse
// compatibility tail is delayed until after touchend.
function iosPressStart(x, y) {
  realPointerEvent("pointerdown", x, y, 1);
  realTouchEvent("touchstart", x, y);
}

function iosReleaseBeforeMouseTail(x, y) {
  realPointerEvent("pointerup", x, y, 0);
  realTouchEvent("touchend", x, y);
}

function iosTrustedMouseTail(x, y, clickX = x, clickY = y) {
  realMouseEvent("mousedown", x, y, 1);
  realMouseEvent("mouseup", x, y, 0);
  realMouseEvent("click", clickX, clickY, 0);
}

canvas.addEventListener("contextmenu", pageContextHandler);
installOrderListeners();

// Normal real-iPhone path. The native hold only arms the bridge. After
// touchend, contextmenu MUST remain pending until WebKit sends its genuine
// trusted mouse/click tail. The delayed click is only a readiness signal; the
// contextmenu must retain the original physical touch coordinates.
iosPressStart(82, 31);
await wait(1);

if (!windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5)) {
  throw new Error("native long-press bridge did not accept the hold request");
}
await wait();

if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(`contextmenu fired before release: ${pageOrder.join(",")}`);
}

iosReleaseBeforeMouseTail(82, 31);
await wait(25);

if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(`contextmenu raced touchend before trusted click: ${pageOrder.join(",")}`);
}

// Deliberately give the delayed trusted click DIFFERENT coordinates. The
// bridge must still dispatch contextmenu at the original long-press point.
iosTrustedMouseTail(82, 31, 7, 9);
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
  throw new Error(`delayed click replaced real touch coordinates: ${JSON.stringify(received)}`);
}
if (received.button !== 0 || received.buttons !== 0 || received.pointerType !== "touch") {
  throw new Error(`contextmenu shape does not match Android: ${JSON.stringify(received)}`);
}

const expectedOrder =
  "pointerdown,touchstart,pointerup,touchend,mousedown,mouseup,click,contextmenu";
if (pageOrder.join(",") !== expectedOrder) {
  throw new Error(`real-iPhone trusted-tail order is wrong: ${pageOrder.join(",")}`);
}

// Delayed WKWebView path: native recognition can arrive before DOM touchstart.
// It must wait for touchstart, then still wait through touchend for the genuine
// trusted click tail instead of creating pointer/mouse events itself.
received = null;
pageOrder = [];
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait(5);
iosPressStart(73, 27);
await wait();

if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(`delayed path fired contextmenu before release: ${pageOrder.join(",")}`);
}

iosReleaseBeforeMouseTail(73, 27);
await wait(25);
if (received !== null || pageOrder.includes("contextmenu")) {
  throw new Error(`delayed path raced touchend before trusted click: ${pageOrder.join(",")}`);
}
iosTrustedMouseTail(73, 27, 1, 1);
await wait();

if (!received || received.clientX !== 73 || received.clientY !== 27) {
  throw new Error(`delayed touch coordinates were not preserved: ${JSON.stringify(received)}`);
}
if (pageOrder.join(",") !== expectedOrder) {
  throw new Error(`delayed real-iPhone event order is wrong: ${pageOrder.join(",")}`);
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
if (!diagnostics.includes("Synthetic press/release: pd=0 md=0 pu=0 mu=0 click=0")) {
  throw new Error(`real iPhone path still fabricated pointer/mouse events: ${diagnostics}`);
}
if (!diagnostics.includes("contextmenu*")) {
  throw new Error(`trusted-source contextmenu was not recorded: ${diagnostics}`);
}

// Listener removal must preserve the page's original listener identity.
canvas.removeEventListener("contextmenu", pageContextHandler);
received = null;
pageOrder = [];
iosPressStart(60, 20);
await wait(1);
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait();
iosReleaseBeforeMouseTail(60, 20);
await wait(25);
iosTrustedMouseTail(60, 20, 2, 2);
await wait();

if (received !== null) {
  throw new Error("wrapped context listener was not removed by its original identity");
}

console.log("iOS GeoReseaux real-WebKit trusted-tail long-press bridge test passed");
