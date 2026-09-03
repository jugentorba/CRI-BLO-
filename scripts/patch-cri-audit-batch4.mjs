import fs from "node:fs";

function replaceOnce(path, from, to) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(from)) throw new Error(`${path}: expected source block not found`);
  const next = source.replace(from, to);
  if (next === source) throw new Error(`${path}: replacement made no change`);
  fs.writeFileSync(path, next);
}

replaceOnce(
  "src/routes/cri.$id.tsx",
  `  function applyAddressToValues(addr: Address) {\n    setValues((prev) => ({\n      ...prev,\n      commune: addr.commune ?? prev.commune ?? "",\n      codePostal: addr.postalCode ?? prev.codePostal ?? "",\n      nomVoie: addr.street ?? prev.nomVoie ?? "",\n      numeroVoie: addr.streetNumber ?? prev.numeroVoie ?? "",\n    }));\n  }`,
  `  function applyAddressToValues(addr: Address) {\n    // A new defect GPS capture is authoritative. Missing pieces from the new\n    // reverse-geocoded address must clear old values instead of leaking a street,\n    // postcode or house number from the previous intervention location.\n    setValues((prev) => ({\n      ...prev,\n      commune: addr.commune ?? "",\n      codePostal: addr.postalCode ?? "",\n      nomVoie: addr.street ?? "",\n      numeroVoie: addr.streetNumber ?? "",\n    }));\n  }`,
);

replaceOnce(
  "src/lib/export/html.ts",
  `      <div class="lab">En ligne Déf/Rép. localisé au :</div><div class="box">\${v("defautLocalise")}</div>\n      <div class="lab">Chez le client Déf/Rép. localisé au :</div><div class="box">\${v("defautLocaliseClient")}</div>\n      <div class="lab">Référence NRO/PM/PB/CABLE :</div><div class="box span3">\${raw("referenceContenant")}</div>`,
  `      <div class="lab">Défaut/réparation localisé au :</div><div class="box">\${v("defautLocalise")}</div>\n      <div class="lab"></div><div class="box" style="border:0"></div>\n      <div class="lab">Référence NRO/PM/PB/CABLE :</div><div class="box span3">\${raw("referenceContenant")}</div>`,
);

replaceOnce(
  "src/lib/export/xlsx.ts",
  `  const fiche = getWorksheet(workbook, "FICHE SAV BLO");\n  const company =`,
  `  const fiche = getWorksheet(workbook, "FICHE SAV BLO");\n  const mesures = getWorksheet(workbook, "MESURES");\n\n  // Clean two accidental literals present in the bundled source workbook. They\n  // are template defects, not technician data, and must never leak into exports.\n  if (fiche && String(fiche.getCell("F12").value ?? "").trim() === "Codre postal") {\n    fiche.getCell("F12").value = "Code postal";\n  }\n  if (mesures && String(mesures.getCell("E14").value ?? "").trim() === "Hello") {\n    mesures.getCell("E14").value = null;\n  }\n\n  const company =`,
);

const testPath = "scripts/test-cri-field-regressions.mjs";
let test = fs.readFileSync(testPath, "utf8");
if (!test.includes('const schema = fs.readFileSync("src/lib/cri/schema.ts", "utf8");')) {
  test = test.replace(
    'const route = fs.readFileSync("src/routes/cri.$id.tsx", "utf8");',
    'const route = fs.readFileSync("src/routes/cri.$id.tsx", "utf8");\nconst schema = fs.readFileSync("src/lib/cri/schema.ts", "utf8");',
  );
}
const marker = 'assert.match(route, /void captureGps\\("defaut"\\);/, "initial GPS must populate the default defect scope");';
if (!test.includes(marker)) throw new Error("regression marker missing");
const additions = `assert.match(schema, /id: "transportDistribution", label: "Type de tronçon"/, "UI must use the official Type de tronçon label");\nassert.doesNotMatch(route, /addr\\.commune \\?\\? prev\\.commune/, "new GPS address must not retain a stale commune");\nassert.doesNotMatch(route, /addr\\.postalCode \\?\\? prev\\.codePostal/, "new GPS address must not retain a stale postcode");\nassert.doesNotMatch(route, /addr\\.street \\?\\? prev\\.nomVoie/, "new GPS address must not retain a stale street");\nassert.doesNotMatch(route, /addr\\.streetNumber \\?\\? prev\\.numeroVoie/, "new GPS address must not retain a stale street number");\nassert.doesNotMatch(html, /defautLocaliseClient/, "PDF must not reintroduce an obsolete client-location field absent from the current template");\nassert.match(xlsx, /getCell\\("F12"\\)\\.value = "Code postal"/, "XLSX export must correct the bundled Code postal typo");\nassert.match(xlsx, /getCell\\("E14"\\)\\.value = null/, "XLSX export must remove the accidental MESURES Hello value");\n`;
if (!test.includes('UI must use the official Type de tronçon label')) {
  test = test.replace(marker, additions + marker);
}
fs.writeFileSync(testPath, test);

console.log("CRI audit batch 4 patch applied");
