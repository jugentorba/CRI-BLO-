#!/usr/bin/env node
/**
 * Contrat gelé du CRI BLO.
 *
 * Le classeur officiel Orange ne doit JAMAIS changer : ni le fichier modèle,
 * ni les cellules écrites, ni les ancrages photos, ni le contenu du ZIP.
 *
 * Ce test échoue si l'un de ces éléments bouge, et explique quoi faire.
 *
 *   node scripts/test-frozen-export.mjs          # vérifie
 *   node scripts/test-frozen-export.mjs --write  # régénère l'empreinte (à éviter)
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const SNAPSHOT = path.join(root, "scripts/frozen/export-contract.json");
const TEMPLATE = path.join(root, "public/cri_blo_template.xlsx");
const XLSX_SRC = path.join(root, "src/lib/export/xlsx.ts");
const ZIP_SRC = path.join(root, "src/lib/export/zip.ts");
const NAMING_SRC = path.join(root, "src/lib/export/naming.ts");

const write = process.argv.includes("--write");
const failures = [];
const report = (ok, label, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Extrait un bloc `const NAME = { ... };` du source TypeScript. */
function block(src, name) {
  const start = src.indexOf(`const ${name}`);
  if (start === -1) throw new Error(`Bloc ${name} introuvable dans ${XLSX_SRC}`);
  const end = src.indexOf("\n};", start);
  if (end === -1) throw new Error(`Fin du bloc ${name} introuvable`);
  return src.slice(start, end);
}

function fieldCells(src) {
  const out = {};
  const re = /(\w+):\s*\{\s*sheet:\s*"([^"]+)",\s*cell:\s*"([^"]+)"/g;
  for (const m of block(src, "FIELD_CELLS").matchAll(re)) {
    out[m[1]] = { sheet: m[2], cell: m[3] };
  }
  return out;
}

function photoAnchors(src) {
  const out = {};
  const re =
    /(\w+):\s*\{\s*sheet:\s*"([^"]+)",\s*col:\s*(\d+),\s*row:\s*(\d+),\s*cols:\s*(\d+),\s*rows:\s*(\d+)\s*\}/g;
  for (const m of block(src, "PHOTO_ANCHORS").matchAll(re)) {
    out[m[1]] = {
      sheet: m[2],
      col: Number(m[3]),
      row: Number(m[4]),
      cols: Number(m[5]),
      rows: Number(m[6]),
    };
  }
  return out;
}

function currentContract() {
  const src = fs.readFileSync(XLSX_SRC, "utf8");
  return {
    templateSha256: sha256File(TEMPLATE),
    fieldCells: fieldCells(src),
    photoAnchors: photoAnchors(src),
  };
}

function diffMaps(label, expected, actual) {
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  for (const key of actualKeys) {
    if (!(key in expected)) failures.push(`${label}: nouveau champ « ${key} »`);
  }
  for (const key of expectedKeys) {
    if (!(key in actual)) {
      failures.push(`${label}: champ supprimé « ${key} »`);
      continue;
    }
    const a = JSON.stringify(expected[key]);
    const b = JSON.stringify(actual[key]);
    if (a !== b) failures.push(`${label}: « ${key} » ${a} → ${b}`);
  }
}

// --- 1. Fichier modèle officiel -------------------------------------------
const contract = currentContract();

if (write) {
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify(contract, null, 2) + "\n");
  console.log(`Contrat écrit : ${path.relative(root, SNAPSHOT)}`);
  process.exit(0);
}

if (!fs.existsSync(SNAPSHOT)) {
  console.error(`Empreinte absente : ${path.relative(root, SNAPSHOT)}`);
  console.error("Lancez « node scripts/test-frozen-export.mjs --write » une seule fois.");
  process.exit(1);
}

const expected = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));

report(
  expected.templateSha256 === contract.templateSha256,
  "modèle Excel officiel inchangé",
  expected.templateSha256 === contract.templateSha256
    ? undefined
    : `attendu ${expected.templateSha256.slice(0, 12)}…, obtenu ${contract.templateSha256.slice(0, 12)}…`,
);

// --- 2. Cellules officielles ----------------------------------------------
diffMaps("cellules", expected.fieldCells, contract.fieldCells);
report(
  Object.keys(expected.fieldCells).length === Object.keys(contract.fieldCells).length,
  "nombre de cellules officielles",
  `${Object.keys(expected.fieldCells).length} attendues, ${Object.keys(contract.fieldCells).length} trouvées`,
);

// --- 3. Ancrages photos ----------------------------------------------------
diffMaps("ancrages photos", expected.photoAnchors, contract.photoAnchors);
report(
  Object.keys(expected.photoAnchors).length === Object.keys(contract.photoAnchors).length,
  "nombre d'ancrages photos",
  `${Object.keys(expected.photoAnchors).length} attendus, ${Object.keys(contract.photoAnchors).length} trouvés`,
);

// --- 4. Contenu du ZIP ------------------------------------------------------
const zipSrc = fs.readFileSync(ZIP_SRC, "utf8");
// Seuls les ajouts passent par uniqueName(); la vérification CRC utilise zip.file(name).
const zipAdds = [...zipSrc.matchAll(/zip\.file\(uniqueName\(/g)];
report(
  zipAdds.length === 2,
  "le ZIP ne contient que le document officiel + pièces jointes",
  `${zipAdds.length} ajout(s) détecté(s)`,
);
report(
  /zip\.file\(uniqueName\(used, exportFileName\(reference, commune, variant\)\), mainBlob\)/.test(
    zipSrc,
  ),
  "document officiel ajouté à la racine du ZIP",
);
report(
  /zip\.file\(uniqueName\(used, a\.name\), a\.blob\)/.test(zipSrc),
  "seules les pièces jointes de l'utilisateur sont ajoutées",
);

// --- 5. Nom des fichiers ----------------------------------------------------
const namingSrc = fs.readFileSync(NAMING_SRC, "utf8");
report(
  /CRI_BLO_\$\{safe\(commune\)\}_\$\{safe\(reference\)\}\.\$\{ext\}/.test(namingSrc),
  "nom du fichier officiel inchangé (CRI_BLO_Commune_Dossier.ext)",
);

// --- Résultat ---------------------------------------------------------------
if (failures.length) {
  console.error("\nCONTRAT GELÉ ROMPU :");
  for (const f of failures) console.error(` - ${f}`);
  console.error(
    "\nLe classeur CRI BLO officiel ne doit pas changer. " +
      "Si la modification est réellement voulue, régénérez le contrat en connaissance de cause :\n" +
      "  node scripts/test-frozen-export.mjs --write\n",
  );
  process.exit(1);
}

console.log("\nContrat gelé respecté : Excel, cellules, photos et ZIP identiques.");
