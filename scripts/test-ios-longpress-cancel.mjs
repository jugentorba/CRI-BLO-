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
globalThis.CustomEvent = class extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.detail = init.detail;
  }
};
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};
globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });

const canvas = new EventTarget();
canvas.querySelectorAll = () => [];
canvas.scripts = [];
canvas.parentNode = null;
canvas.parentElement = null;
canvas.nodeType = 1;
canvas.tagName = "CANVAS";
canvas.id = "";
canvas.className = "";
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200 });
canvas.closest = () => null;
canvas.contains = (value) => value === canvas;

const documentTarget = canvas;
documentTarget.elementsFromPoint = () => [canvas];
documentTarget.elementFromPoint = () => canvas;

const windowTarget = new EventTarget();
windowTarget.window = windowTarget;
windowTarget.document = documentTarget;
windowTarget.innerWidth = 300;
windowTarget.innerHeight = 200;
windowTarget.scrollX = 0;
windowTarget.scrollY = 0;
windowTarget.frames = [];
windowTarget.location = { href: "https://sigreseaux.orange.fr/ger/" };
windowTarget.getSelection = () => ({ removeAllRanges() {} });

globalThis.window = windowTarget;
globalThis.document = documentTarget;
globalThis.location = windowTarget.location;
windowTarget.__cribloGeoReseauxAndroidCompat = true;
new Function(match[1])();

const counts = new Map();
for (const type of ["mousedown", "mouseup", "click", "contextmenu"]) {
  canvas.addEventListener(type, (event) => {
    counts.set(type, (counts.get(type) || 0) + 1);
    if (type === "contextmenu") event.preventDefault();
  });
}

function count(type) {
  return counts.get(type) || 0;
}
function resetCounts() {
  counts.clear();
}
function trusted(event) {
  Object.defineProperty(event, "isTrusted", { configurable: true, value: true });
  return event;
}
function pointer(type, x, y, buttons) {
  canvas.dispatchEvent(
    trusted(
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
    ),
  );
}
function touch(type, x, y) {
  const event = trusted(new Event(type, { bubbles: true, cancelable: true }));
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
  const active = type === "touchstart" || type === "touchmove" ? [point] : [];
  Object.defineProperties(event, {
    touches: { value: active },
    targetTouches: { value: active },
    changedTouches: { value: [point] },
  });
  canvas.dispatchEvent(event);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A pan/drag that moves beyond the production 28 pt tolerance must cancel the
// hold timer. Waiting beyond 600 ms must never turn that pan into a popup.
resetCounts();
pointer("pointerdown", 80, 70, 1);
touch("touchstart", 80, 70);
await wait(30);
touch("touchmove", 120, 70); // 40 pt movement > 28 pt tolerance.
await wait(650);
pointer("pointerup", 120, 70, 0);
touch("touchend", 120, 70);
await wait(150);
if (count("contextmenu") !== 0) throw new Error("map pan incorrectly became a long press");
if (count("click") !== 0) throw new Error("map pan incorrectly generated a compatibility click");
if (count("mousedown") !== count("mouseup")) {
  throw new Error(`map pan left compatibility mouse state unbalanced: down=${count("mousedown")} up=${count("mouseup")}`);
}

// iOS can cancel a touch because of OS/browser gesture arbitration. A cancelled
// touch must clear the pending hold and balance any compatibility mouse press.
resetCounts();
pointer("pointerdown", 140, 90, 1);
touch("touchstart", 140, 90);
await wait(30);
touch("touchcancel", 140, 90);
await wait(650);
if (count("contextmenu") !== 0) throw new Error("touchcancel incorrectly became a long press");
if (count("click") !== 0) throw new Error("touchcancel incorrectly generated a compatibility click");
if (count("mousedown") !== count("mouseup")) {
  throw new Error(`touchcancel left compatibility mouse state unbalanced: down=${count("mousedown")} up=${count("mouseup")}`);
}

console.log("iOS GeoReseaux movement/touchcancel regression passed");
