import fs from 'node:fs';
import path from 'node:path';

const packageRoot = process.argv[2] || path.resolve('ios-spm');
const target = path.join(
  packageRoot,
  'checkouts',
  'ion-ios-camera',
  'Sources',
  'IONCameraLib',
  'IONCAMRFlowBehaviour.swift',
);

if (!fs.existsSync(target)) {
  throw new Error(`ion-ios-camera source not found: ${target}`);
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes('let savedForResult = saved')) {
  console.log('ion-ios-camera concurrency patch already applied.');
  process.exit(0);
}

const anchor = '            thumbnailGenerator.getImage(from: url) { image in';
const anchorMatches = source.split(anchor).length - 1;
if (anchorMatches !== 1) {
  throw new Error(`Expected one video thumbnail anchor, found ${anchorMatches}.`);
}

const savedUse = 'saved: saved)';
const savedMatches = source.split(savedUse).length - 1;
if (savedMatches !== 2) {
  throw new Error(`Expected two captured saved uses, found ${savedMatches}.`);
}

source = source.replace(
  anchor,
  `            // Swift rejects capturing a mutable local variable from the\n` +
    `            // concurrently executing thumbnail/metadata closures. Freeze the\n` +
    `            // completed gallery result before either closure captures it.\n` +
    `            let savedForResult = saved\n` +
    anchor,
);
source = source.split(savedUse).join('saved: savedForResult)');

// SwiftPM checks dependency working copies out read-only. Make only the file we
// need to patch writable, then restore it to read-only after the edit.
const originalMode = fs.statSync(target).mode & 0o777;
fs.chmodSync(target, originalMode | 0o200);
try {
  fs.writeFileSync(target, source);
} finally {
  fs.chmodSync(target, originalMode);
}
console.log(`Patched Swift concurrency capture in ${target}`);
