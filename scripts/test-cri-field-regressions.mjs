import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const route = fs.readFileSync("src/routes/cri.$id.tsx", "utf8");
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

console.log("CRI field/GPS/export/document/update regression checks passed");
