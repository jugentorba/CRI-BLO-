import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const route = fs.readFileSync("src/routes/cri.$id.tsx", "utf8");
const xlsx = fs.readFileSync("src/lib/export/xlsx.ts", "utf8");
const xlsxConfig = fs.readFileSync("src/lib/export/xlsx-config.ts", "utf8");
const html = fs.readFileSync("src/lib/export/html.ts", "utf8");
const addressSource = fs.readFileSync("src/lib/geo/address-format.ts", "utf8");

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

console.log("CRI field/GPS/export regression checks passed");
