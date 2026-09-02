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

const canvas = new EventTarget();
canvas.nodeType = 1;
canvas.tagName = "CANVAS";
canvas.id = "";
canvas.className = "";
canvas.parentNode = documentTarget;
canvas.parentElement = null;
canvas.getBoundingClientRect = () => ({
  left: 0,
  top: 0,
  width: 200,
  height: 100,
});
canvas.closest = () => null;

documentTarget.elementsFromPoint = () => [canvas];
documentTarget.elementFromPoint = () => canvas;
globalThis.window = windowTarget;
globalThis.document = documentTarget;
globalThis.location = windowTarget.location;

windowTarget.__cribloLastTrustedTouchStart = {
  isTrusted: true,
  touches: [{ identifier: 9 }],
};

new Function(match[1])();

let received = null;
function pageContextHandler(event) {
  event.preventDefault();
  received = {
    trusted: event.isTrusted,
    prevented: event.defaultPrevented,
    target: event.target === canvas,
    currentTarget: event.currentTarget === canvas,
    pointerEvent: event instanceof TestPointerEvent,
    touchSource: Boolean(event.sourceCapabilities?.firesTouchEvents),
  };
}

canvas.addEventListener("contextmenu", pageContextHandler);

if (!windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5)) {
  throw new Error("native long-press bridge did not dispatch a context event");
}

if (!received || Object.values(received).some((value) => value !== true)) {
  throw new Error(`trusted browser-path facade failed: ${JSON.stringify(received)}`);
}

canvas.removeEventListener("contextmenu", pageContextHandler);
received = null;
windowTarget.__cribloNativeWrappedContextLongPress(0.5, 0.5);

if (received !== null) {
  throw new Error("wrapped context listener was not removed by its original identity");
}

console.log("iOS long-press browser-path facade test passed");
