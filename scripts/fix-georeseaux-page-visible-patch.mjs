import fs from 'node:fs';

const path = 'scripts/patch-georeseaux-page-visible-android-order.mjs';
let text = fs.readFileSync(path, 'utf8');

function removeOnce(label, block) {
  const first = text.indexOf(block);
  if (first < 0) throw new Error(`${label}: block not found`);
  if (text.indexOf(block, first + block.length) >= 0) throw new Error(`${label}: block not unique`);
  text = text.slice(0, first) + text.slice(first + block.length);
}

function replaceOnce(label, from, to) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: block not found`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: block not unique`);
  text = text.slice(0, first) + to + text.slice(first + from.length);
}

removeOnce('ambiguous mouseup diagnostic rewrite', `swift = replaceOnce(\n  swift,\n  'trusted synthetic mouse trace',\n  \`          traceAndroidEvent('mouseup', false);\`,\n  \`          traceAndroidEvent('mouseup', !!(source && source.isTrusted));\`,\n);\n`);

removeOnce('ambiguous click diagnostic rewrite', `swift = replaceOnce(\n  swift,\n  'trusted synthetic click trace',\n  \`          traceAndroidEvent('click', false);\`,\n  \`          traceAndroidEvent('click', !!(source && source.isTrusted));\`,\n);\n`);

// A suppressed native iOS event must not be recorded as a real page-visible
// event. Otherwise finishAndroidCompatibilityMouse thinks the missing Android
// tail already happened and skips the synthetic mouseup/click.
replaceOnce(
  'mouseup suppression before bookkeeping',
  `          lastRealMouseUpAt = Date.now();\\n          lastRealMouseUpTarget = event.target || null;\\n          if (pendingNativeLongPress && pendingNativeLongPress.armed && mapLikeTarget(event.target)) {\\n            event.stopImmediatePropagation();\\n            return;\\n          }\\n          traceAndroidEvent('mouseup', true);`,
  `          if (pendingNativeLongPress && pendingNativeLongPress.armed && mapLikeTarget(event.target)) {\\n            event.stopImmediatePropagation();\\n            return;\\n          }\\n          lastRealMouseUpAt = Date.now();\\n          lastRealMouseUpTarget = event.target || null;\\n          traceAndroidEvent('mouseup', true);`,
);

replaceOnce(
  'click suppression before bookkeeping',
  `          lastRealClickAt = Date.now();\\n          lastRealClickTarget = event.target || null;\\n          var request = pendingNativeLongPress;\\n          if (request && request.armed && mapLikeTarget(event.target)) {\\n            // Long-hold release is fully rebuilt below. Suppress any late WebKit\\n            // click so GeoReseaux sees exactly one Android-shaped click.\\n            event.stopImmediatePropagation();\\n            return;\\n          }\\n          traceAndroidEvent('click', true);`,
  `          var request = pendingNativeLongPress;\\n          if (request && request.armed && mapLikeTarget(event.target)) {\\n            // Long-hold release is fully rebuilt below. Suppress any late WebKit\\n            // click so GeoReseaux sees exactly one Android-shaped click.\\n            event.stopImmediatePropagation();\\n            return;\\n          }\\n          lastRealClickAt = Date.now();\\n          lastRealClickTarget = event.target || null;\\n          traceAndroidEvent('click', true);`,
);

replaceOnce(
  'mousedown suppression before bookkeeping',
  `          lastRealMouseDownAt = Date.now();\\n          lastRealMouseDownTarget = event.target || null;\\n          if (pendingNativeLongPress && pendingNativeLongPress.armed && mapLikeTarget(event.target)) {\\n            // A late iOS compatibility mousedown would duplicate the Android\\n            // mousedown already replayed after touchstart. Keep it from the page.\\n            event.stopImmediatePropagation();\\n            return;\\n          }\\n          traceAndroidEvent('mousedown', true);`,
  `          if (pendingNativeLongPress && pendingNativeLongPress.armed && mapLikeTarget(event.target)) {\\n            // A late iOS compatibility mousedown would duplicate the Android\\n            // mousedown already replayed after touchstart. Keep it from the page.\\n            event.stopImmediatePropagation();\\n            return;\\n          }\\n          lastRealMouseDownAt = Date.now();\\n          lastRealMouseDownTarget = event.target || null;\\n          traceAndroidEvent('mousedown', true);`,
);

const from = `Android-order trace (*=trusted source): touchstart* > pointerdown* > mousedown* > touchend* > pointerup* > mouseup* > click* > contextmenu*`;
const to = `Android-order trace (*=trusted source): touchstart* > pointerdown* > mousedown* > touchend* > pointerup* > mouseup > click > contextmenu*`;
if (!text.includes(from)) throw new Error('diagnostic test expectation not found');
text = text.replace(from, to);

fs.writeFileSync(path, text);
console.log('Page-visible Android-order patch targeting corrected');
