import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.existsSync('src/lib/backup/local.ts') ? fs.readFileSync('src/lib/backup/local.ts', 'utf8') : 'export const saveLocalBackup = async () => { throw new Error("not implemented"); };';
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
function load(native, results) {
  const calls=[]; const exports={};
  vm.runInNewContext(code,{exports,Error,require(name) {
    if (name === '@capacitor/core') return {Capacitor:{isNativePlatform:()=>native,getPlatform:()=>native?'android':'web'}};
    return {
      writeFileToExportFolder:async()=>{calls.push('write');return {wrote:results.shift()??false};},
      pickExportFolder:async()=>{calls.push('pick');return results.shift()?{name:'backup'}:null;},
      downloadBlob:()=>calls.push('download'),
    };
  }});
  return {save:exports.saveLocalBackup,calls};
}
let x=load(true,[true]); await x.save('backup.json',new Blob(['history'])); assert.deepEqual(x.calls,['write']);
x=load(true,[false,true,true]); await x.save('backup.json',new Blob(['history'])); assert.deepEqual(x.calls,['write','pick','write']);
x=load(true,[false,false]); await assert.rejects(()=>x.save('backup.json',new Blob()),/annul/); assert.deepEqual(x.calls,['write','pick']);
x=load(true,[false,true,false]); await assert.rejects(()=>x.save('backup.json',new Blob()),/enregistrer/); assert.deepEqual(x.calls,['write','pick','write']);
x=load(false,[]);await x.save('backup.json',new Blob()); assert.deepEqual(x.calls,['download']);
console.log('Local backup: 5 native/browser save cases passed');
