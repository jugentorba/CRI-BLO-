import fs from "node:fs";

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

// 1) Generic importer: persist the actual source bytes, not metadata only.
const importerPath = "src/routes/importer.tsx";
let importer = fs.readFileSync(importerPath, "utf8");
importer = replaceOnce(
  importer,
  `  async function keepInOtherHistory() {\n    if (!detection || !pending) return;\n    await saveOtherDoc({\n      docType: detection.type,\n      fileName: pending.name,\n      kind: pending.kind,\n      confidence: detection.confidence,\n      reasons: detection.reasons,\n      textPreview: detection.textPreview,\n    });\n    setSaved(true);\n  }`,
  `  async function keepInOtherHistory() {\n    if (!detection || !pending) return;\n    const file = fileRef.current;\n    if (!file) {\n      setError(\"Sélectionnez à nouveau le fichier avant de l'enregistrer.\");\n      return;\n    }\n    const blob = new Blob([await file.arrayBuffer()], { type: file.type });\n    await saveOtherDoc({\n      docType: detection.type,\n      fileName: pending.name,\n      kind: pending.kind,\n      confidence: detection.confidence,\n      reasons: detection.reasons,\n      textPreview: detection.textPreview,\n      blob,\n      mimeType: file.type,\n      size: file.size,\n    });\n    setSaved(true);\n  }`,
  "persist importer source bytes",
);
fs.writeFileSync(importerPath, importer);

// 2) Documents: open the stored blob inside CRI-BLO and stop advertising unsupported DOCX->CRI conversion.
const docsPath = "src/routes/documents.tsx";
let docs = fs.readFileSync(docsPath, "utf8");
docs = replaceOnce(docs, `  openOtherDocFile,\n`, "", "remove download-only open helper import");
docs = replaceOnce(
  docs,
  `    if (!/\\.(xlsx|xlsm|pdf|docx)$/i.test(file.name)) {\n      setError(\n        \"Ce format ne peut pas être converti en CRI BLO (Excel .xlsx/.xlsm, PDF ou DOCX).\",\n      );`,
  `    if (!/\\.(xlsx|xlsm|pdf)$/i.test(file.name)) {\n      setError(\n        \"Ce format ne peut pas être converti en CRI BLO (Excel .xlsx/.xlsm ou PDF).\",\n      );`,
  "remove unsupported DOCX CRI conversion",
);
docs = replaceOnce(
  docs,
  `                      onClick={() => {\n                        if (!openOtherDocFile(d)) {\n                          setError(\"Fichier d'origine indisponible pour ce document.\");\n                        }\n                      }}`,
  `                      onClick={() => setEditingDoc(d)}`,
  "open stored other-doc inside app",
);
fs.writeFileSync(docsPath, docs);

// 3) Excel import: A20 belongs to Point A; never duplicate it into default-defect GPS.
const parsePath = "src/lib/import/parse.ts";
let parse = fs.readFileSync(parsePath, "utf8");
parse = replaceOnce(
  parse,
  `      { id: \"numeroVoie\", cell: \"B14\" },\n      { id: \"gpsCoordsDefaut\", cell: \"A20\" },`,
  `      { id: \"numeroVoie\", cell: \"B14\" },`,
  "remove Point-A cell as defect GPS import",
);
fs.writeFileSync(parsePath, parse);

// 4) Updates: this chat/project is bound to jugentorba/CRI-BLO- only.
const updatePath = "src/lib/updates/github.ts";
let updates = fs.readFileSync(updatePath, "utf8");
updates = replaceOnce(
  updates,
  `export const CRI_BLO_RELEASE_REPOSITORIES = [\"jugentorba/CRIBLO\", \"jugentorba/CRI-BLO-\"] as const;`,
  `export const CRI_BLO_RELEASE_REPOSITORIES = [\"jugentorba/CRI-BLO-\"] as const;`,
  "use current CRI-BLO release repository only",
);
fs.writeFileSync(updatePath, updates);

// 5) iOS speech dictation needs its own privacy description in addition to microphone access.
const iosInfoPath = "scripts/patch-ios-info.mjs";
let iosInfo = fs.readFileSync(iosInfoPath, "utf8");
iosInfo = replaceOnce(
  iosInfo,
  `  [\n    \"NSMicrophoneUsageDescription\",\n    \"CRI BLO utilise le microphone uniquement pour la dictée vocale lorsque vous l'activez.\",\n  ],\n];`,
  `  [\n    \"NSMicrophoneUsageDescription\",\n    \"CRI BLO utilise le microphone uniquement pour la dictée vocale lorsque vous l'activez.\",\n  ],\n  [\n    \"NSSpeechRecognitionUsageDescription\",\n    \"CRI BLO utilise la reconnaissance vocale uniquement pour transcrire la dictée que vous lancez.\",\n  ],\n];`,
  "add iOS speech-recognition privacy description",
);
fs.writeFileSync(iosInfoPath, iosInfo);

// Extend the permanent CRI regression test; normal CI already runs it.
const testPath = "scripts/test-cri-field-regressions.mjs";
let test = fs.readFileSync(testPath, "utf8");
test = replaceOnce(
  test,
  `const addressSource = fs.readFileSync(\"src/lib/geo/address-format.ts\", \"utf8\");`,
  `const addressSource = fs.readFileSync(\"src/lib/geo/address-format.ts\", \"utf8\");\nconst importer = fs.readFileSync(\"src/routes/importer.tsx\", \"utf8\");\nconst documents = fs.readFileSync(\"src/routes/documents.tsx\", \"utf8\");\nconst parse = fs.readFileSync(\"src/lib/import/parse.ts\", \"utf8\");\nconst updates = fs.readFileSync(\"src/lib/updates/github.ts\", \"utf8\");\nconst iosInfo = fs.readFileSync(\"scripts/patch-ios-info.mjs\", \"utf8\");`,
  "load batch2 sources in regression test",
);
test = replaceOnce(
  test,
  `console.log(\"CRI field/GPS/export regression checks passed\");`,
  `assert.match(importer, /new Blob\\(\\[await file\\.arrayBuffer\\(\\)\\]/, \"generic importer must copy source bytes into IndexedDB\");\nassert.match(importer, /blob,\\s*\\n\\s*mimeType: file\\.type,\\s*\\n\\s*size: file\\.size/, \"generic importer must persist blob metadata\");\nassert.doesNotMatch(documents, /openOtherDocFile/, \"stored documents must not use the download-only open helper\");\nassert.match(documents, /aria-label=\"Ouvrir\"[\\s\\S]*?onClick=\\{\\(\\) => setEditingDoc\\(d\\)\\}/, \"stored documents must open inside CRI-BLO\");\nassert.match(documents, /!\\/\\\\\\.\\(xlsx\\|xlsm\\|pdf\\)\\$\\/i\\.test\\(file\\.name\\)/, \"CRI conversion must be limited to XLSX/XLSM/PDF\");\nassert.doesNotMatch(parse, /id: \"gpsCoordsDefaut\", cell: \"A20\"/, \"Point A GPS cell must not populate defect GPS on import\");\nassert.match(updates, /CRI_BLO_RELEASE_REPOSITORIES = \\[\"jugentorba\\/CRI-BLO-\"\\] as const/, \"update checker must use the active CRI-BLO repository only\");\nassert.doesNotMatch(updates, /jugentorba\\/CRIBLO/, \"legacy release repository must not override current releases\");\nassert.match(iosInfo, /NSSpeechRecognitionUsageDescription/, \"iOS speech dictation privacy description is required\");\n\nconsole.log(\"CRI field/GPS/export/document/update regression checks passed\");`,
  "extend permanent CRI regression assertions",
);
fs.writeFileSync(testPath, test);

console.log("Applied CRI audit batch 2 fixes");
