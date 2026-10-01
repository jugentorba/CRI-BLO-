import assert from 'node:assert/strict';
import fs from 'node:fs';
const pages=fs.readFileSync('.github/workflows/pages.yml','utf8');
assert.ok(!pages.includes('ref: criblo-master-spec-v1'),'Publishing must build the triggering revision, not another branch');
assert.ok(!pages.includes('assembleDebug'),'Publishing must never replace the production APK with a debug APK');
for (const file of ['pages.yml','build-downloads.yml','build-release.yml']) {
  const text=fs.readFileSync(`.github/workflows/${file}`,'utf8');
  assert.ok(text.includes('VITE_GOOGLE_CLIENT_ID:'),`${file}: inject app-owned Google config`);
  assert.ok(text.includes('npm ci'),`${file}: install locked dependencies`);
  if(file!=='pages.yml') assert.ok(text.includes('scripts/patch-android-manifest.mjs'),`${file}: apply native manifest/file-provider patch`);
}
console.log('Release workflows: current revision, stable APK and native setup checks passed');
