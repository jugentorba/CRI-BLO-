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
documentTarget.querySelectorAll = (selector) => selector === ".ol-viewport" ? [documentTarget] : [];
documentTarget.scripts = [];
documentTarget.parentNode = null;
documentTarget.parentElement = null;
documentTarget.nodeType = 1;
documentTarget.tagName = "CANVAS";
documentTarget.id = "";
documentTarget.className = "ol-viewport";
documentTarget.style = {};
documentTarget.getBoundingClientRect = () => ({
  left: 0,
  top: 0,
  right: 200,
  bottom: 100,
  width: 200,
  height: 100,
});
documentTarget.closest = (selector) => selector === ".ol-viewport" ? documentTarget : null;

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
  return event;
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
  return realTouchEvent("touchstart", x, y);
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

// Research-backed OpenLayers/iOS path. Orange documents SIGReseaux as an
// Angular/OpenLayers viewer. OpenLayers context-menu controls listen directly
// on .ol-viewport; Chrome Android synthesizes contextmenu for a long hold while
// iOS does not. CRI-BLO must prevent the iOS native callout at touchstart and
// emit exactly one contextmenu on the OpenLayers viewport at native hold time.
const firstTouchStart = iosPressStart(82, 31);
if (!firstTouchStart.defaultPrevented) {
  throw new Error("OpenLayers touchstart was not actively prevented on iOS");
}
await wait(1);

if (!windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5)) {
  throw new Error("native long-press bridge did not accept the OpenLayers hold");
}
await wait(20);

if (!received) {
  throw new Error(`OpenLayers viewport contextmenu did not fire at hold time: ${pageOrder.join(",")}`);
}
const holdFlags = received && [
  received.trusted,
  received.prevented,
  received.target,
  received.pointerEvent,
  received.touchSource,
];
if (holdFlags.some((value) => value !== true)) {
  throw new Error(`OpenLayers trusted facade failed: ${JSON.stringify(received)}`);
}
if (received.clientX !== 82 || received.clientY !== 31) {
  throw new Error(`OpenLayers hold coordinates changed: ${JSON.stringify(received)}`);
}
if (received.button !== 0 || received.buttons !== 0 || received.pointerType !== "touch") {
  throw new Error(`OpenLayers contextmenu shape is wrong: ${JSON.stringify(received)}`);
}
if (pageOrder.join(",") !== "pointerdown,touchstart,contextmenu") {
  throw new Error(`contextmenu was not emitted directly at hold time: ${pageOrder.join(",")}`);
}

// Even if WKWebView later emits the release/mouse compatibility tail, the
// OpenLayers path is already complete and must never emit a second menu event.
iosReleaseBeforeMouseTail(82, 31);
iosTrustedMouseTail(82, 31, 7, 9);
await wait(30);
if (pageOrder.filter((name) => name === "contextmenu").length !== 1) {
  throw new Error(`duplicate contextmenu after WebKit release tail: ${pageOrder.join(",")}`);
}
const fullExpected =
  "pointerdown,touchstart,contextmenu,pointerup,touchend,mousedown,mouseup,click";
if (pageOrder.join(",") !== fullExpected) {
  throw new Error(`unexpected OpenLayers iPhone order: ${pageOrder.join(",")}`);
}

// Delayed WKWebView path: native recognizer can begin just before DOM
// touchstart. Once the trusted touch arrives, it must still prevent iOS's
// native callout and dispatch to .ol-viewport without waiting for touchend.
received = null;
pageOrder = [];
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait(5);
const delayedTouchStart = iosPressStart(73, 27);
if (!delayedTouchStart.defaultPrevented) {
  throw new Error("delayed OpenLayers touchstart was not prevented");
}
await wait(20);

if (!received || received.clientX !== 73 || received.clientY !== 27) {
  throw new Error(`delayed OpenLayers hold failed: ${JSON.stringify(received)}`);
}
if (pageOrder.join(",") !== "pointerdown,touchstart,contextmenu") {
  throw new Error(`delayed OpenLayers order is wrong: ${pageOrder.join(",")}`);
}

iosReleaseBeforeMouseTail(73, 27);
iosTrustedMouseTail(73, 27, 1, 1);
await wait(20);
if (pageOrder.filter((name) => name === "contextmenu").length !== 1) {
  throw new Error(`delayed path duplicated contextmenu: ${pageOrder.join(",")}`);
}

const diagnostics = windowTarget.__cribloGeoDiagnosticsText();
if (!diagnostics.includes("Native waits for touchstart: 1")) {
  throw new Error(`delayed native wait was not recorded: ${diagnostics}`);
}
if (!diagnostics.includes("Native/touch coordinate delta: 27,23")) {
  throw new Error(`touch coordinate correction was not recorded: ${diagnostics}`);
}
if (!diagnostics.includes("OpenLayers viewport dispatches: 2")) {
  throw new Error(`OpenLayers viewport dispatch count is wrong: ${diagnostics}`);
}
if (!diagnostics.includes("OpenLayers viewport target: CANVAS#.ol-viewport")) {
  throw new Error(`OpenLayers viewport target was not recorded: ${diagnostics}`);
}
if (!diagnostics.includes("Map touchstart prevented: 2")) {
  throw new Error(`active map touch prevention was not recorded: ${diagnostics}`);
}
if (!diagnostics.includes("Synthetic press/release: pd=0 md=0 pu=0 mu=0 click=0")) {
  throw new Error(`OpenLayers path fabricated low-level events: ${diagnostics}`);
}
if (!diagnostics.includes("Release completions: 0")) {
  throw new Error(`OpenLayers path incorrectly waited for release: ${diagnostics}`);
}
if (!diagnostics.includes("contextmenu*")) {
  throw new Error(`trusted-source contextmenu was not traced: ${diagnostics}`);
}

// Listener removal must still preserve the page's original listener identity.
canvas.removeEventListener("contextmenu", pageContextHandler);
received = null;
pageOrder = [];
iosPressStart(60, 20);
await wait(1);
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);
await wait(20);
if (received !== null) {
  throw new Error("wrapped context listener was not removed by its original identity");
}

console.log("iOS GeoReseaux OpenLayers viewport long-press bridge test passed");
