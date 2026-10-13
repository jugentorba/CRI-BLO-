import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';

function load(file, imports, extra = {}) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(output, { exports, require: name => {
    assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name];
  }, Blob, Uint8Array, ArrayBuffer, btoa, URL, setTimeout, ...extra });
  return exports;
}

test('Android attachment opening copies all bytes in bounded chunks before launching viewer', async () => {
  assert.ok(fs.existsSync('src/lib/attachments/open.ts'), 'Native attachment opener is missing');
  const bytes = Uint8Array.from({length: 1_200_017}, (_, i) => i % 251);
  const writes = [];
  let opened = false;
  const api = load('src/lib/attachments/open.ts', {
    '@capacitor/core': { Capacitor: {isNativePlatform: () => true, getPlatform: () => 'android'}, registerPlugin: () => ({
      beginOpen: async ({fileName, mimeType}) => { assert.equal(fileName, 'plan.PDF'); assert.equal(mimeType, 'application/pdf'); return {token: 'copy'}; },
      writeChunk: async ({token, base64}) => { assert.equal(token, 'copy'); const b = Buffer.from(base64, 'base64'); assert.ok(b.length <= 384 * 1024); writes.push(b); },
      finishOpen: async () => { assert.deepEqual(Buffer.concat(writes), Buffer.from(bytes)); opened = true; },
      abortOpen: async () => { throw Error('unexpected abort'); },
    }) },
    '@/lib/export/folder': { downloadBlob: () => { throw Error('No blob-download fallback on Android'); } },
  });
  await api.openAttachment({name:'plan.PDF', type:'application/octet-stream', blob:new Blob([bytes])});
  assert.equal(opened, true);
});

test('Native viewer failure is surfaced, cleans temporary session, and never pretends to download', async () => {
  assert.ok(fs.existsSync('src/lib/attachments/open.ts'), 'Native attachment opener is missing');
  let aborted = false;
  const api = load('src/lib/attachments/open.ts', {
    '@capacitor/core': { Capacitor: {isNativePlatform: () => true, getPlatform: () => 'android'}, registerPlugin: () => ({
      beginOpen: async () => ({token:'copy'}), writeChunk: async () => {},
      finishOpen: async () => {throw Error('Aucune application compatible');}, abortOpen: async () => {aborted=true;},
    }) },
    '@/lib/export/folder': {downloadBlob: () => {throw Error('Unexpected fallback');}},
  });
  await assert.rejects(api.openAttachment({name:'trace.sor',blob:new Blob(['data'])}), /Aucune application compatible/);
  assert.equal(aborted,true);
});

test('Updater does not equate an unrecognized or legacy launch status with successful installation', async () => {
  const api = load('src/lib/updates/native.ts', {
    '@capacitor/core': {Capacitor: {isNativePlatform: () => true,getPlatform: () => 'android'},registerPlugin: () => ({downloadAndInstall: async () => ({status:'installer_opened'})})},
  });
  await assert.rejects(api.downloadAndInstallUpdate('https://example.test/update.apk'), /confirm|vérifi/i);
});

test('Installer requests an actual Android result and has no generic VIEW fallback', () => {
  const script=fs.readFileSync('scripts/patch-android-updater.mjs','utf8');
  const updater=script.slice(script.indexOf('const plugin ='),script.indexOf('const storagePlugin ='));
  assert.match(updater,/startActivityForResult\(call, install, "installationFinished"\)/);
  assert.match(updater,/Intent\.EXTRA_RETURN_RESULT, true/);
  assert.doesNotMatch(updater,/new Intent\(Intent\.ACTION_VIEW\)/);
});

test('Android browser retains its compatible-app share handoff', async () => {
  let shared;
  const api = load('src/lib/attachments/open.ts', {
    '@capacitor/core': {Capacitor:{isNativePlatform:()=>false,getPlatform:()=> 'web'},registerPlugin:()=>({})},
    '@/lib/export/folder': {downloadBlob:()=>{throw Error('Must preserve browser share path');}},
  }, {File, DOMException, navigator: {userAgent:'Android',canShare:()=>true,share:async data=>{shared=data;}}});
  await api.openAttachment({name:'plan.xlsx',blob:new Blob(['test'])});
  assert.equal(shared.files[0].name,'plan.xlsx');
});
