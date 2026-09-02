import fs from 'node:fs';

const path = 'scripts/patch-georeseaux-page-visible-android-order.mjs';
let text = fs.readFileSync(path, 'utf8');

function removeOnce(label, block) {
  const first = text.indexOf(block);
  if (first < 0) throw new Error(`${label}: block not found`);
  if (text.indexOf(block, first + block.length) >= 0) throw new Error(`${label}: block not unique`);
  text = text.slice(0, first) + text.slice(first + block.length);
}

removeOnce('ambiguous mouseup diagnostic rewrite', `swift = replaceOnce(\n  swift,\n  'trusted synthetic mouse trace',\n  \`          traceAndroidEvent('mouseup', false);\`,\n  \`          traceAndroidEvent('mouseup', !!(source && source.isTrusted));\`,\n);\n`);

removeOnce('ambiguous click diagnostic rewrite', `swift = replaceOnce(\n  swift,\n  'trusted synthetic click trace',\n  \`          traceAndroidEvent('click', false);\`,\n  \`          traceAndroidEvent('click', !!(source && source.isTrusted));\`,\n);\n`);

const from = `Android-order trace (*=trusted source): touchstart* > pointerdown* > mousedown* > touchend* > pointerup* > mouseup* > click* > contextmenu*`;
const to = `Android-order trace (*=trusted source): touchstart* > pointerdown* > mousedown* > touchend* > pointerup* > mouseup > click > contextmenu*`;
if (!text.includes(from)) throw new Error('diagnostic test expectation not found');
text = text.replace(from, to);

fs.writeFileSync(path, text);
console.log('Page-visible Android-order patch targeting corrected');
