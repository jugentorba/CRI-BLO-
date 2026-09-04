from pathlib import Path

path = Path('scripts/test-ios-longpress-bridge.mjs')
text = path.read_text()
old = '''// Physical iPhone input arrives pointerdown before touchstart. The bridge must
// present the exact measured WORKING Android order to GeoReseaux listeners:
// touchstart -> pointerdown -> mousedown ... touchend -> pointerup -> mouseup -> click -> contextmenu.
'''
new = '''// Physical iPhone input arrives pointerdown before touchstart. The bridge must
// present the WORKING Android hold timing measured on the real Android WebView:
// the long-touch contextmenu occurs at the hold threshold while the finger is
// still down. pointerup/touchend and any compatibility release tail happen later.
'''
if old not in text:
    raise SystemExit('timing comment anchor not found')
text = text.replace(old, new, 1)
old = '''await wait(625);
if (context !== null) throw new Error("contextmenu fired while finger was still down: " + order.join(","));

pointer("pointerup", 82, 31, 0);
if (order.join(",") !== "touchstart,pointerdown,mousedown") throw new Error("iOS pointerup leaked to page before touchend: " + order.join(","));
'''
new = '''await wait(625);
const holdExpected = "touchstart,pointerdown,mousedown,contextmenu";
if (order.join(",") !== holdExpected) throw new Error("Android hold contextmenu did not fire before release: " + order.join(","));
if (!context || !context.trusted || !context.prevented || !context.target || !context.pointerEvent || !context.touchSource || !context.originalTrusted) throw new Error("hold-time context facade mismatch: " + JSON.stringify(context));
if (context.clientX !== 82 || context.clientY !== 31 || context.button !== 0 || context.buttons !== 0 || context.pointerType !== "touch") throw new Error("hold-time context shape mismatch: " + JSON.stringify(context));

pointer("pointerup", 82, 31, 0);
if (order.join(",") !== holdExpected) throw new Error("iOS pointerup leaked to page before touchend: " + order.join(","));
'''
if old not in text:
    raise SystemExit('pre-release assertion anchor not found')
text = text.replace(old, new, 1)
old = '''const expected = "touchstart,pointerdown,mousedown,touchend,pointerup,mouseup,click,contextmenu";
if (order.join(",") !== expected) throw new Error("real-iPhone -> Android lifecycle mismatch: " + order.join(","));
'''
new = '''const expected = "touchstart,pointerdown,mousedown,contextmenu,touchend,pointerup,mouseup,click";
if (order.join(",") !== expected) throw new Error("real-iPhone -> Android lifecycle mismatch: " + order.join(","));
if (order.filter((name) => name === "contextmenu").length !== 1) throw new Error("hold emitted duplicate contextmenu: " + order.join(","));
'''
if old not in text:
    raise SystemExit('release-order assertion anchor not found')
text = text.replace(old, new, 1)
# The context was already asserted at the hold threshold; keep only the shape
# check below as an invariant and avoid duplicating the full facade assertion.
old = '''if (!context || !context.trusted || !context.prevented || !context.target || !context.pointerEvent || !context.touchSource || !context.originalTrusted) throw new Error("context facade mismatch: " + JSON.stringify(context));
if (context.clientX !== 82 || context.clientY !== 31 || context.button !== 0 || context.buttons !== 0 || context.pointerType !== "touch") throw new Error("context shape mismatch: " + JSON.stringify(context));
'''
new = '''if (!context || context.clientX !== 82 || context.clientY !== 31 || context.button !== 0 || context.buttons !== 0 || context.pointerType !== "touch") throw new Error("context shape changed after release: " + JSON.stringify(context));
'''
if old not in text:
    raise SystemExit('post-release context assertion anchor not found')
text = text.replace(old, new, 1)
path.write_text(text)
print('updated regression to require hold-time contextmenu before release')
