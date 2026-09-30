import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const route = fs.readFileSync("src/routes/cri.$id.tsx", "utf8");
const schema = fs.readFileSync("src/lib/cri/schema.ts", "utf8");
const xlsx = fs.readFileSync("src/lib/export/xlsx.ts", "utf8");
const xlsxConfig = fs.readFileSync("src/lib/export/xlsx-config.ts", "utf8");
const html = fs.readFileSync("src/lib/export/html.ts", "utf8");
const zip = fs.readFileSync("src/lib/export/zip.ts", "utf8");
const addressSource = fs.readFileSync("src/lib/geo/address-format.ts", "utf8");
const importer = fs.readFileSync("src/routes/importer.tsx", "utf8");
const documents = fs.readFileSync("src/routes/documents.tsx", "utf8");
const docsRepository = fs.readFileSync("src/lib/docs/repository.ts", "utf8");
const documentEditor = fs.readFileSync("src/components/UniversalDocumentEditor.tsx", "utf8");
const parse = fs.readFileSync("src/lib/import/parse.ts", "utf8");
const updates = fs.readFileSync("src/lib/updates/github.ts", "utf8");
const iosInfo = fs.readFileSync("scripts/patch-ios-info.mjs", "utf8");
const review = fs.readFileSync("src/components/cri/ReviewDialog.tsx", "utf8");
const attachmentsRepository = fs.readFileSync("src/lib/attachments/repository.ts", "utf8");
const attachmentViewer = fs.readFileSync("src/components/cri/AttachmentViewer.tsx", "utf8");
const exportFolder = fs.readFileSync("src/lib/export/folder.ts", "utf8");
const androidExport = fs.readFileSync("plugins/criblo-native-browser/android/src/main/java/com/criblo/nativebrowser/CRIExportPlugin.java", "utf8");
const androidManifestPatch = fs.readFileSync("scripts/patch-android-manifest.mjs", "utf8");

assert.match(schema, /id: "transportDistribution", label: "Type de tronçon"/, "UI must use the official Type de tronçon label");
assert.doesNotMatch(route, /addr\.commune \?\? prev\.commune/, "new GPS address must not retain a stale commune");
assert.doesNotMatch(route, /addr\.postalCode \?\? prev\.codePostal/, "new GPS address must not retain a stale postcode");
assert.doesNotMatch(route, /addr\.street \?\? prev\.nomVoie/, "new GPS address must not retain a stale street");
assert.doesNotMatch(route, /addr\.streetNumber \?\? prev\.numeroVoie/, "new GPS address must not retain a stale street number");
assert.doesNotMatch(html, /defautLocaliseClient/, "PDF must not reintroduce an obsolete client-location field absent from the current template");
assert.match(xlsx, /getCell\("F12"\)\.value = "Code postal"/, "XLSX export must correct the bundled Code postal typo");
assert.match(xlsx, /getCell\("E14"\)\.value = null/, "XLSX export must remove the accidental MESURES Hello value");
assert.match(route, /void captureGps\("defaut"\);/, "initial GPS must populate the default defect scope");
assert.match(route, /if \(!scope \|\| scope === "defaut"\) setGps\(coords\);/, "A/B capture must not replace global defect GPS");
assert.ok(route.includes("// Point A/B : ne jamais écraser la localisation officielle du défaut."), "A/B address isolation marker missing");
assert.match(route, /lat < -90 \|\| lat > 90 \|\| lon < -180 \|\| lon > 180/, "manual GPS range validation missing");
assert.doesNotMatch(route, /villefr/i, "route must not special-case a specific commune");
assert.doesNotMatch(xlsx, /!cri\.values\?\.gpsCoordsA && cri\.gps/, "Point A must not fall back to unrelated global GPS");
assert.match(xlsxConfig, /commentaires:\s*\{[^}]*cell:\s*"A52"/, "comments must remain mapped to the Excel template");
assert.doesNotMatch(xlsxConfig, /villefr/i, "XLSX must not strip Villefranche-de-Rouergue");
assert.doesNotMatch(html, /villefr/i, "HTML/PDF must not strip Villefranche-de-Rouergue");
assert.match(xlsxConfig, /cleanAddressText/, "XLSX must use generic address cleanup");
assert.match(html, /cleanAddressText/, "HTML/PDF must use generic address cleanup");

const transpiled = ts.transpileModule(addressSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
assert.equal(
  mod.cleanAddressText("12 Rue de la République, 12200 Villefranche-de-Rouergue, France"),
  "12 Rue de la République, 12200 Villefranche-de-Rouergue, France",
  "legitimate commune must be preserved",
);
assert.equal(
  mod.cleanAddressText("12 Rue de la République, 12200 Villefranche-de-Rouergue, Villefranche-de-Rouergue, France, France"),
  "12 Rue de la République, 12200 Villefranche-de-Rouergue, France",
  "duplicate city/country parts must be removed generically",
);

const numberBlock = route.slice(route.indexOf('if (f.type === "numberNA")'), route.indexOf('if (f.type === "datetime")'));
assert.ok(numberBlock.indexOf('<input') < numberBlock.indexOf('<button'), "number N/A button must be on the right of the input");
const textBlock = route.slice(route.lastIndexOf('return (\n    <div id={`f-${f.id}`}>'), route.indexOf('function AddrInput'));
assert.match(textBlock, /<input[\s\S]*?<NAQuickButton/, "text N/A button must follow the input");

assert.match(importer, /new Blob\(\[await file\.arrayBuffer\(\)\]/, "generic importer must copy source bytes into IndexedDB");
assert.match(importer, /blob,\s*\n\s*mimeType: file\.type,\s*\n\s*size: file\.size/, "generic importer must persist blob metadata");
assert.doesNotMatch(documents, /openOtherDocFile/, "stored documents must not use the download-only open helper");
assert.match(documents, /aria-label="Ouvrir"[\s\S]*?onClick=\{\(\) => setEditingDoc\(d\)\}/, "stored documents must open inside CRI-BLO");
assert.match(documents, /updateOtherDocFile\(editingDoc\.id, blob, fileName\)/, "edited documents must replace the stored CRI-BLO copy");
assert.match(docsRepository, /export async function updateOtherDocFile/, "document repository must support persisted edits");
assert.match(documentEditor, /if \(onSaved\) \{\s*await onSaved\(blob, name\);\s*return;/, "in-app document save must not force a duplicate download");
assert.match(documentEditor, /value !== \(initialCells\[r\]\?\.\[c\] \?\? ""\)/, "Excel editor must only overwrite user-changed cells");
assert.doesNotMatch(documentEditor, /JSON\.stringify\(v\)/, "Excel editor must not stringify merged/internal cell objects");
assert.match(documents, /!\/\\\.\(xlsx\|xlsm\|pdf\)\$\/i\.test\(file\.name\)/, "CRI conversion must be limited to XLSX/XLSM/PDF");
assert.doesNotMatch(parse, /id: "gpsCoordsDefaut", cell: "A20"/, "Point A GPS cell must not populate defect GPS on import");
assert.match(updates, /CRI_BLO_RELEASE_REPOSITORIES = \["jugentorba\/CRI-BLO-"\] as const/, "update checker must use the active CRI-BLO repository only");
assert.doesNotMatch(updates, /jugentorba\/CRIBLO/, "legacy release repository must not override current releases");
assert.match(iosInfo, /NSSpeechRecognitionUsageDescription/, "iOS speech dictation privacy description is required");
assert.match(zip, /Photo_supplementaire_\$\{number\}/, "supplementary OI photos must be exported as individual ZIP files");
assert.match(zip, /verifyFlatZip\(zip, 1 \+ exportedExtraPhotos \+ attachments\.length\)/, "ZIP verification must count supplementary photos and files");
assert.doesNotMatch(zip, /zip\.folder\(/, "ZIP export must not create supplementary subfolders");
assert.match(zip, /JSZip\.loadAsync\(await output\.arrayBuffer\(\), \{ checkCRC32: true \}\)/, "final ZIP bytes must be CRC-checked before Android save");

assert.match(route, /const saveInFlight = useRef\(false\)/, "save button must have a synchronous in-flight guard");
assert.match(route, /disabled=\{savingDraft\}/, "save button must disable while the first save is running");
assert.match(route, /await handleExport\(kind\);\s*setReviewing\(false\);/, "review must wait for export completion before closing");
assert.match(review, /disabled=\{!ready \|\| exporting !== null\}/, "all export buttons must lock during export");
assert.match(review, /await onExport\(kind\)/, "review export must await the real export operation");

assert.match(attachmentsRepository, /new Blob\(\[await file\.arrayBuffer\(\)\], \{ type \}\)/, "supplementary USB files must be copied into CRI local storage immediately");
assert.match(attachmentViewer, /openBlobWithNativeApp/, "supplementary files must expose native Android opening");
assert.match(exportFolder, /finished\.bytesWritten !== expectedSize/, "Android export must verify the exact bridge byte count");
assert.match(exportFolder, /finished\.fileSize !== expectedSize/, "Android export must verify the final provider file size");
assert.match(androidExport, /FileProvider\.getUriForFile/, "Android attachment opening must use a safe FileProvider URI");
assert.match(androidExport, /getPackageName\(\) \+ "\\.fileprovider"/, "Android attachment opening must reuse the app FileProvider authority");
assert.match(androidExport, /Intent\.ACTION_VIEW/, "Android attachment opening must launch a compatible installed app");
assert.match(androidManifestPatch, /cache-path android:name="criblo_open" android:path="criblo-open\/"\s*\/>/, "generated Android file_paths must expose only the CRI attachment cache");

assert.match(xlsx, /verifySerializedValues\(output, expectedWrites\)/, "Excel export must verify CRI values after XLSX serialization");
assert.match(xlsx, /writeChecked\(sheet, map\.cell, value, expectedWrites\)/, "mapped Excel values must participate in serialization verification");

const schemaModuleSource = ts.transpileModule(schema, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const schemaModule = await import(`data:text/javascript;base64,${Buffer.from(schemaModuleSource).toString("base64")}`);
const mappedFieldIds = new Set(
  [...xlsxConfig.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*\{\s*sheet:/gm)].map((match) => match[1]),
);
const handledOutsideFieldMap = new Set([
  "company",
  "technicianName",
  "commune",
  "codePostal",
  "nomVoie",
  "numeroVoie",
  "defautLocaliseAutre",
  "causePrincipaleAutre",
  // The official workbook has Point A/B GPS cells but no separate defect-GPS cell.
  "gpsCoordsDefaut",
]);
const missingExcelMappings = schemaModule
  .allFields()
  .filter((field) => field.type !== "photo" && field.type !== "gpsCapture")
  .filter((field) => !mappedFieldIds.has(field.id) && !handledOutsideFieldMap.has(field.id))
  .map((field) => field.id);
assert.deepEqual(missingExcelMappings, [], "every CRI form field with an Excel destination must be handled");

console.log("CRI field/GPS/export/document/update regression checks passed");
