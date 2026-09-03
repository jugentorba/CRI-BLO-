import fs from "node:fs";

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Patch target is not unique: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function replaceRegexOnce(text, regex, to, label) {
  const matches = [...text.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g"))];
  if (matches.length !== 1) throw new Error(`Expected one regex target for ${label}, got ${matches.length}`);
  return text.replace(regex, to);
}

const routePath = "src/routes/cri.$id.tsx";
let route = fs.readFileSync(routePath, "utf8");

route = replaceOnce(
  route,
  "      void captureGps();",
  "      void captureGps(\"defaut\");",
  "initial GPS must target default defect",
);

route = replaceRegexOnce(
  route,
  /\n  function cleanGeoAddress\(text: string\) \{[\s\S]*?\n  \}\n\n  \/\/ GPS/,
  "\n\n  // GPS",
  "remove city-specific unused address cleaner",
);

route = replaceOnce(
  route,
  "      // GPS principal pour le filigrane photo : premier capturé fait foi\n      setGps((prev) => prev ?? coords);",
  "      // Seule la localisation du défaut alimente le GPS principal du dossier.\n      // Les captures A/B restent isolées dans leurs champs respectifs.\n      if (!scope || scope === \"defaut\") setGps(coords);",
  "scope global GPS to defect",
);

const oldApply = `  async function applyReverseGeocode(addr: Address, scope?: \"A\" | \"B\" | \"defaut\") {\n    const full = fullStreetAddress(addr);\n    setAddress(addr);\n    setAddressStatus(\"resolved\");\n    applyAddressToValues(addr);\n    setValues((prev) => {\n      const next = { ...prev };\n      if (scope === \"A\") next.adresseA = full;\n      else if (scope === \"B\") next.adresseB = full;\n      // Défaut : pas de champ Adresse, on ne remplit que Commune / CP / Voie / Numéro.\n      return next;\n    });\n    setDirty(true);\n  }`;
const newApply = `  async function applyReverseGeocode(addr: Address, scope?: \"A\" | \"B\" | \"defaut\") {\n    const full = fullStreetAddress(addr);\n\n    if (scope === \"A\" || scope === \"B\") {\n      // Point A/B : ne jamais écraser la localisation officielle du défaut.\n      setValues((prev) => ({\n        ...prev,\n        [scope === \"A\" ? \"adresseA\" : \"adresseB\"]: full,\n      }));\n    } else {\n      // Défaut : cette adresse est la localisation officielle du dossier.\n      setAddress(addr);\n      setAddressStatus(\"resolved\");\n      applyAddressToValues(addr);\n    }\n    setDirty(true);\n  }`;
route = replaceOnce(route, oldApply, newApply, "isolate A/B reverse geocode from defect address");

route = replaceOnce(
  route,
  `    if (Number.isNaN(lat) || Number.isNaN(lon)) {\n      setGpsError(\"Coordonnées invalides.\");\n      return;\n    }\n    setGpsLoading(true);`,
  `    if (Number.isNaN(lat) || Number.isNaN(lon)) {\n      setGpsError(\"Coordonnées invalides.\");\n      return;\n    }\n    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {\n      setGpsError(\"Coordonnées hors limites : latitude -90 à 90, longitude -180 à 180.\");\n      return;\n    }\n    if (scope === \"defaut\") {\n      setGps({ latitude: lat, longitude: lon, capturedAt: new Date().toISOString() });\n      setDirty(true);\n    }\n    setGpsLoading(true);`,
  "validate manual coordinates and synchronize default GPS",
);

route = replaceOnce(
  route,
  `            ) : props.gps ? (\n              <RefreshCw className=\"h-3 w-3\" />`,
  `            ) : props.coordsValue.trim() ? (\n              <RefreshCw className=\"h-3 w-3\" />`,
  "GPS button state uses scoped coordinates",
);

route = replaceOnce(
  route,
  `        {(scope === \"defaut\" || props.gps) && (\n          <div className=\"mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground\">\n            {props.gps?.accuracy && <span>±{Math.round(props.gps.accuracy)} m</span>}\n            {scope === \"defaut\" && <AddressStatusBadge status={props.addressStatus} />}\n          </div>\n        )}`,
  `        {scope === \"defaut\" && (\n          <div className=\"mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground\">\n            {props.gps?.accuracy && <span>±{Math.round(props.gps.accuracy)} m</span>}\n            <AddressStatusBadge status={props.addressStatus} />\n          </div>\n        )}`,
  "do not display defect GPS accuracy in A/B blocks",
);

const oldLabel = `  const label = (\n    <div className=\"mb-1 flex items-center gap-1\">\n      <label htmlFor={\`f-\${f.id}\`} className=\"block text-xs font-semibold text-foreground\">\n        {f.label}\n        {f.required && <span className=\"ml-1 text-destructive\">*</span>}\n      </label>\n      {(f.type === \"text\" || f.type === \"textLong\") &&\n        ![\"adresseA\", \"adresseB\", \"gpsCoordsA\", \"gpsCoordsB\", \"gpsCoordsDefaut\", \"commune\", \"codePostal\", \"nomVoie\", \"numeroVoie\"].includes(f.id) && (\n          <NAQuickButton onClick={() => props.onChange(\"N/A\")} />\n        )}\n    </div>\n  );`;
const newLabel = `  const quickNAAllowed =\n    (f.type === \"text\" || f.type === \"textLong\") &&\n    ![\"adresseA\", \"adresseB\", \"gpsCoordsA\", \"gpsCoordsB\", \"gpsCoordsDefaut\", \"commune\", \"codePostal\", \"nomVoie\", \"numeroVoie\"].includes(f.id);\n\n  const label = (\n    <div className=\"mb-1 flex items-center gap-1\">\n      <label htmlFor={\`f-\${f.id}\`} className=\"block text-xs font-semibold text-foreground\">\n        {f.label}\n        {f.required && <span className=\"ml-1 text-destructive\">*</span>}\n      </label>\n    </div>\n  );`;
route = replaceOnce(route, oldLabel, newLabel, "move text N/A controls out of label row");

route = replaceOnce(
  route,
  `      className=\"ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-background px-1.5 text-[10px] font-black text-muted-foreground hover:border-primary/50 hover:text-primary active:scale-95\"`,
  `      className=\"inline-flex h-10 min-w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2 text-xs font-black text-muted-foreground hover:border-primary/50 hover:text-primary active:scale-95\"`,
  "make right-side N/A control field-height",
);

const oldTextLong = `  if (f.type === \"textLong\") {\n    return (\n      <div id={\`f-\${f.id}\`}>\n        {label}\n        <DictationTextarea\n          value={(props.value as string) ?? \"\"}\n          onChange={(v) => props.onChange(v)}\n          example={f.example}\n          placeholder=\"Saisir, dicter ou reformuler avec l'IA…\"\n          assist\n          assistContext={props.assistContext}\n        />\n      </div>\n    );\n  }`;
const newTextLong = `  if (f.type === \"textLong\") {\n    return (\n      <div id={\`f-\${f.id}\`}>\n        {label}\n        <div className=\"flex items-start gap-1.5\">\n          <div className=\"min-w-0 flex-1\">\n            <DictationTextarea\n              value={(props.value as string) ?? \"\"}\n              onChange={(v) => props.onChange(v)}\n              example={f.example}\n              placeholder=\"Saisir, dicter ou reformuler avec l'IA…\"\n              assist\n              assistContext={props.assistContext}\n            />\n          </div>\n          {quickNAAllowed && <NAQuickButton onClick={() => props.onChange(\"N/A\")} />}\n        </div>\n      </div>\n    );\n  }`;
route = replaceOnce(route, oldTextLong, newTextLong, "put textLong N/A to right of textarea");

const oldNumberNA = `        <div className=\"flex gap-1.5\">\n          <button\n            type=\"button\"\n            aria-pressed={isNA}\n            onClick={() => props.onChange(isNA ? undefined : \"na\")}\n            className={\n              \"h-10 shrink-0 rounded-lg border px-3 text-xs font-bold transition active:scale-95 \" +\n              (isNA\n                ? \"border-primary bg-primary text-primary-foreground\"\n                : \"border-border bg-card text-foreground hover:border-primary/40\")\n            }\n          >\n            N/A\n          </button>\n          <input\n            id={\`f-\${f.id}-input\`}\n            type=\"number\"\n            inputMode=\"decimal\"\n            placeholder={isNA ? \"Non applicable\" : \"Saisir une valeur (1, 2, 12, 24, 48, 96, 144, …)\"}\n            value={isNA ? \"\" : numVal}\n            disabled={isNA}\n            onChange={(e) =>\n              props.onChange(e.target.value === \"\" ? undefined : Number(e.target.value))\n            }\n            onFocus={() => {\n              if (isNA) props.onChange(undefined);\n            }}\n            className=\"h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground\"\n          />\n        </div>`;
const newNumberNA = `        <div className=\"flex gap-1.5\">\n          <input\n            id={\`f-\${f.id}-input\`}\n            type=\"number\"\n            inputMode=\"decimal\"\n            placeholder={isNA ? \"Non applicable\" : \"Saisir une valeur (1, 2, 12, 24, 48, 96, 144, …)\"}\n            value={isNA ? \"\" : numVal}\n            disabled={isNA}\n            onChange={(e) =>\n              props.onChange(e.target.value === \"\" ? undefined : Number(e.target.value))\n            }\n            onFocus={() => {\n              if (isNA) props.onChange(undefined);\n            }}\n            className=\"h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground\"\n          />\n          <button\n            type=\"button\"\n            aria-pressed={isNA}\n            onClick={() => props.onChange(isNA ? undefined : \"na\")}\n            className={\n              \"h-10 shrink-0 rounded-lg border px-3 text-xs font-bold transition active:scale-95 \" +\n              (isNA\n                ? \"border-primary bg-primary text-primary-foreground\"\n                : \"border-border bg-card text-foreground hover:border-primary/40\")\n            }\n          >\n            N/A\n          </button>\n        </div>`;
route = replaceOnce(route, oldNumberNA, newNumberNA, "move numeric N/A button to right");

const oldPlainText = `  return (\n    <div id={\`f-\${f.id}\`}>\n      {label}\n      <input\n        type=\"text\"\n        value={(props.value as string) ?? \"\"}\n        onChange={(e) => props.onChange(e.target.value)}\n        className=\"h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30\"\n      />\n    </div>\n  );`;
const newPlainText = `  return (\n    <div id={\`f-\${f.id}\`}>\n      {label}\n      <div className=\"flex gap-1.5\">\n        <input\n          id={\`f-\${f.id}-input\`}\n          type=\"text\"\n          value={(props.value as string) ?? \"\"}\n          onChange={(e) => props.onChange(e.target.value)}\n          className=\"h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30\"\n        />\n        {quickNAAllowed && <NAQuickButton onClick={() => props.onChange(\"N/A\")} />}\n      </div>\n    </div>\n  );`;
route = replaceOnce(route, oldPlainText, newPlainText, "put text N/A to right of input");

fs.writeFileSync(routePath, route);

const xlsxPath = "src/lib/export/xlsx.ts";
let xlsx = fs.readFileSync(xlsxPath, "utf8");
xlsx = replaceOnce(
  xlsx,
  `    if (!cri.values?.gpsCoordsA && cri.gps) {\n      fiche.getCell(\"A20\").value = \`\${cri.gps.latitude.toFixed(6)}, \${cri.gps.longitude.toFixed(6)}\`;\n    }\n`,
  "",
  "remove global GPS fallback from Point A Excel cell",
);
fs.writeFileSync(xlsxPath, xlsx);

const addressUtilPath = "src/lib/geo/address-format.ts";
fs.writeFileSync(
  addressUtilPath,
  `function normalizedPart(value: string): string {\n  return value\n    .normalize(\"NFD\")\n    .replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/\\s+/g, \" \")\n    .trim()\n    .toLocaleLowerCase(\"fr-FR\");\n}\n\n/**\n * Cleans legacy comma-separated geocoder text without deleting legitimate cities.\n * Exact duplicate parts are removed. A redundant bare city next to \"12345 City\"\n * is also removed, while the postal-code form is retained.\n */\nexport function cleanAddressText(text: string): string {\n  const parts = text\n    .split(\",\")\n    .map((part) => part.replace(/\\s+/g, \" \" ).trim())\n    .filter(Boolean);\n\n  const result: string[] = [];\n  const keys: string[] = [];\n\n  for (const part of parts) {\n    const key = normalizedPart(part);\n    if (keys.includes(key)) continue;\n\n    const postal = key.match(/^\\d{5}\\s+(.+)$/);\n    if (postal) {\n      const bareCityIndex = keys.indexOf(postal[1]);\n      if (bareCityIndex >= 0) {\n        result.splice(bareCityIndex, 1);\n        keys.splice(bareCityIndex, 1);\n      }\n    } else {\n      const alreadyWithPostal = keys.some((existing) => {\n        const match = existing.match(/^\\d{5}\\s+(.+)$/);\n        return match?.[1] === key;\n      });\n      if (alreadyWithPostal) continue;\n    }\n\n    result.push(part);\n    keys.push(key);\n  }\n\n  return result.join(\", \" );\n}\n`,
);

const xlsxConfigPath = "src/lib/export/xlsx-config.ts";
let xlsxConfig = fs.readFileSync(xlsxConfigPath, "utf8");
xlsxConfig = replaceOnce(
  xlsxConfig,
  `import type { CriRecord } from \"@/lib/cri/types\";`,
  `import type { CriRecord } from \"@/lib/cri/types\";\nimport { cleanAddressText } from \"@/lib/geo/address-format\";`,
  "xlsx address helper import",
);
xlsxConfig = replaceRegexOnce(
  xlsxConfig,
  /\nfunction cleanGeoText\(text: string\): string \{[\s\S]*?\n\}\n\nfunction fmtCleanText\(value: unknown\): string \{\n  return cleanGeoText\(String\(value \?\? \"\"\)\);\n\}/,
  `\nfunction fmtCleanText(value: unknown): string {\n  return cleanAddressText(String(value ?? \"\"));\n}`,
  "replace XLSX hard-coded city cleaner",
);
fs.writeFileSync(xlsxConfigPath, xlsxConfig);

const htmlPath = "src/lib/export/html.ts";
let html = fs.readFileSync(htmlPath, "utf8");
html = replaceOnce(
  html,
  `import { getPhoto } from \"@/lib/photos/repository\";`,
  `import { getPhoto } from \"@/lib/photos/repository\";\nimport { cleanAddressText } from \"@/lib/geo/address-format\";`,
  "HTML address helper import",
);
html = html.replace(/cleanGeoText\(/g, "cleanAddressText(");
html = replaceRegexOnce(
  html,
  /\nfunction cleanAddressText\(text: string\): string \{[\s\S]*?\n\}\n\nfunction blobToDataUrl/,
  "\nfunction blobToDataUrl",
  "remove HTML local hard-coded city cleaner",
);
fs.writeFileSync(htmlPath, html);

const testPath = "scripts/test-cri-field-regressions.mjs";
fs.writeFileSync(
  testPath,
  `import assert from \"node:assert/strict\";\nimport fs from \"node:fs\";\nimport ts from \"typescript\";\n\nconst route = fs.readFileSync(\"src/routes/cri.$id.tsx\", \"utf8\");\nconst xlsx = fs.readFileSync(\"src/lib/export/xlsx.ts\", \"utf8\");\nconst xlsxConfig = fs.readFileSync(\"src/lib/export/xlsx-config.ts\", \"utf8\");\nconst html = fs.readFileSync(\"src/lib/export/html.ts\", \"utf8\");\nconst addressSource = fs.readFileSync(\"src/lib/geo/address-format.ts\", \"utf8\");\n\nassert.match(route, /void captureGps\\(\"defaut\"\\);/, \"initial GPS must populate the default defect scope\");\nassert.match(route, /if \\(!scope \\|\\| scope === \"defaut\"\\) setGps\\(coords\\);/, \"A/B capture must not replace global defect GPS\");\nassert.match(route, /if \\(scope === \"A\" \\|\\| scope === \"B\"\\) \\{[\\s\\S]*?Point A\\/B : ne jamais écrire?aser/s, \"A/B address isolation marker missing\");\nassert.match(route, /lat < -90 \\|\\| lat > 90 \\|\\| lon < -180 \\|\\| lon > 180/, \"manual GPS range validation missing\");\nassert.doesNotMatch(route, /villefr/i, \"route must not special-case a specific commune\");\nassert.doesNotMatch(xlsx, /!cri\\.values\\?\\.gpsCoordsA && cri\\.gps/, \"Point A must not fall back to unrelated global GPS\");\nassert.match(xlsxConfig, /commentaires:\\s*\\{[^}]*cell:\\s*\"A52\"/, \"comments must remain mapped to the Excel template\");\nassert.doesNotMatch(xlsxConfig, /villefr/i, \"XLSX must not strip Villefranche-de-Rouergue\");\nassert.doesNotMatch(html, /villefr/i, \"HTML/PDF must not strip Villefranche-de-Rouergue\");\nassert.match(xlsxConfig, /cleanAddressText/, \"XLSX must use generic address cleanup\");\nassert.match(html, /cleanAddressText/, \"HTML/PDF must use generic address cleanup\");\n\nconst transpiled = ts.transpileModule(addressSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;\nconst mod = await import(\`data:text/javascript;base64,\${Buffer.from(transpiled).toString(\"base64\")}\`);\nassert.equal(\n  mod.cleanAddressText(\"12 Rue de la République, 12200 Villefranche-de-Rouergue, France\"),\n  \"12 Rue de la République, 12200 Villefranche-de-Rouergue, France\",\n  \"legitimate commune must be preserved\",\n);\nassert.equal(\n  mod.cleanAddressText(\"12 Rue de la République, 12200 Villefranche-de-Rouergue, Villefranche-de-Rouergue, France, France\"),\n  \"12 Rue de la République, 12200 Villefranche-de-Rouergue, France\",\n  \"duplicate city/country parts must be removed generically\",\n);\n\nconst numberBlock = route.slice(route.indexOf('if (f.type === \"numberNA\")'), route.indexOf('if (f.type === \"datetime\")'));\nassert.ok(numberBlock.indexOf('<input') < numberBlock.indexOf('<button'), \"number N/A button must be on the right of the input\");\nconst textBlock = route.slice(route.lastIndexOf('return (\\n    <div id={\`f-\${f.id}\`}>'), route.indexOf('function AddrInput'));
assert.match(textBlock, /<input[\\s\\S]*?<NAQuickButton/, \"text N/A button must follow the input\");\n\nconsole.log(\"CRI field/GPS/export regression checks passed\");\n`,
);

const packagePath = "package.json";
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.scripts["test:cri-regressions"] = "node scripts/test-cri-field-regressions.mjs";
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

const ciPath = ".github/workflows/ci.yml";
let ci = fs.readFileSync(ciPath, "utf8");
ci = replaceOnce(
  ci,
  `      - name: Test GeoReseaux HTTP/JS Android identity parity\n        run: npm run test:ios-georeseaux-ua-parity\n`,
  `      - name: Test GeoReseaux HTTP/JS Android identity parity\n        run: npm run test:ios-georeseaux-ua-parity\n\n      - name: Test CRI GPS, address and N/A regressions\n        run: npm run test:cri-regressions\n`,
  "add CRI regression gate to CI",
);
fs.writeFileSync(ciPath, ci);

console.log("Applied CRI audit batch 1 fixes");
