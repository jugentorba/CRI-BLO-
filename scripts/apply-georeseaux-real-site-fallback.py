from pathlib import Path

TEST = Path('scripts/test-ios-longpress-bridge.mjs')
MARKER = '// REAL_SITE_CONSUMED_CONTEXT_REGRESSION'
text = TEST.read_text()
if MARKER not in text:
    needle = 'console.log("iOS GeoReseaux exact lifecycle + semantic hidden OpenLayers bridge test passed");'
    if needle not in text:
        raise SystemExit('long-press test completion marker not found')
    block = r'''
// REAL_SITE_CONSUMED_CONTEXT_REGRESSION
// Reproduce the physical-iPhone diagnostic from 2026-09-04: GeoReseaux has
// ordinary DOM contextmenu handlers that run and preventDefault(), while the
// hidden OpenLayers Map has still been recovered. Those DOM handlers do not
// open the popup, so they must not suppress the semantic Map fallback.
canvas.removeEventListener('contextmenu', hiddenBound);
let realSiteConsumedA = 0;
let realSiteConsumedB = 0;
function realSiteHandlerA(event) { realSiteConsumedA += 1; event.preventDefault(); }
function realSiteHandlerB(event) { realSiteConsumedB += 1; event.preventDefault(); }
canvas.addEventListener('contextmenu', realSiteHandlerA);
canvas.addEventListener('contextmenu', realSiteHandlerB);
const directBeforeConsumedContext = directMapCalls;
order.length = 0;
lifecycle.length = 0;
context = null;
pointer("pointerdown", 103, 47, 1);
touch("touchstart", 103, 47);
await wait(650);
pointer("pointerup", 103, 47, 0);
touch("touchend", 103, 47);
await wait(160);
if (realSiteConsumedA !== 1 || realSiteConsumedB !== 1) {
  throw new Error('real-site consuming context handlers did not run exactly once: ' + realSiteConsumedA + '/' + realSiteConsumedB);
}
if (directMapCalls !== directBeforeConsumedContext + 1) {
  throw new Error('recovered OpenLayers Map was skipped after consumed DOM contextmenu with no popup; direct=' + directMapCalls + ' before=' + directBeforeConsumedContext + '\n' + windowTarget.__cribloGeoDiagnosticsText());
}
'''
    TEST.write_text(text.replace(needle, block + '\n' + needle))
    print('appended real-site consumed-context regression')
else:
    print('real-site consumed-context regression already present')
