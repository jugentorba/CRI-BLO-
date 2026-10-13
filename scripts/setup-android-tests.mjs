import fs from 'node:fs';
const dir='android/app/src/test/java/com/criblo/app';
fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync('scripts/android/NativeFileFlowsTest.java', `${dir}/NativeFileFlowsTest.java`);
const gradle='android/app/build.gradle';
let text=fs.readFileSync(gradle,'utf8');
if(!text.includes('// CRI BLO native regression tests')) text += `
// CRI BLO native regression tests
android { testOptions { unitTests { includeAndroidResources = true } } }
dependencies { testImplementation 'org.robolectric:robolectric:4.14.1' }
`;
fs.writeFileSync(gradle,text);
