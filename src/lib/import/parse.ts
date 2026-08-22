// Import d'un CRI BLO existant (Excel officiel ou PDF) : analyse le document
// et retourne les informations reconnues. Aucune écriture automatique : le
// technicien valide ce qui doit être repris.

import { CRI_SECTIONS, type FieldDef } from "@/lib/cri/schema";
import { FIELD_CELLS } from "@/lib/export/xlsx";

export interface ImportedField {
  id: string;
  label: string;
  value: string;
}

export interface ImportResult {
  kind: "xlsx" | "pdf";
  fileName: string;
  fields: ImportedField[];
  values: Record<string, unknown>;
  rawPreview?: string;
  warning?: string;
}

const ALL_FIELDS: FieldDef[] = CRI_SECTIONS.flatMap((s) => s.fields);

function fieldById(id: string): FieldDef | undefined {
  return ALL_FIELDS.find((f) => f.id === id);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const rich = value as { text?: string; richText?: { text: string }[]; result?: unknown };
    if (typeof rich.text === "string") return rich.text;
    if (Array.isArray(rich.richText)) return rich.richText.map((r) => r.text).join("");
    if (rich.result !== undefined) return String(rich.result);
    if (value instanceof Date) return value.toISOString();
    return "";
  }
  return String(value);
}

/** Lit les cellules officielles du template Orange et en déduit les champs. */
export async function parseCriXlsx(file: File): Promise<ImportResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const fields: ImportedField[] = [];
  const values: Record<string, unknown> = {};

  for (const [fieldId, map] of Object.entries(FIELD_CELLS)) {
    const ws = wb.getWorksheet(map.sheet);
    if (!ws) continue;
    const text = cellText(ws.getCell(map.cell).value).trim();
    if (!text) continue;
    const def = fieldById(fieldId);
    const label = def?.label ?? fieldId;
    fields.push({ id: fieldId, label, value: text });
    if (def?.type === "number" && !Number.isNaN(Number(text.replace(",", ".")))) {
      values[fieldId] = Number(text.replace(",", "."));
    } else if (def?.type === "yesno" || def?.type === "yesnona") {
      if (/^oui/i.test(text)) values[fieldId] = true;
      else if (/^non/i.test(text)) values[fieldId] = false;
      else if (/n\/?a/i.test(text)) values[fieldId] = "na";
    } else if (def?.type === "numberNA") {
      const n = Number(text.replace(",", "."));
      values[fieldId] = Number.isNaN(n) ? "na" : n;
    } else {
      values[fieldId] = text;
    }
  }

  // Adresse du défaut (cellules hors mapping direct).
  const fiche = wb.getWorksheet("FICHE SAV BLO");
  if (fiche) {
    const extras: { id: string; cell: string }[] = [
      { id: "commune", cell: "B12" },
      { id: "codePostal", cell: "H12" },
      { id: "nomVoie", cell: "B13" },
      { id: "numeroVoie", cell: "B14" },
      { id: "gpsCoordsDefaut", cell: "A20" },
    ];
    for (const e of extras) {
      const text = cellText(fiche.getCell(e.cell).value).trim();
      if (!text || values[e.id]) continue;
      values[e.id] = text;
      fields.push({ id: e.id, label: fieldById(e.id)?.label ?? e.id, value: text });
    }
  }

  return {
    kind: "xlsx",
    fileName: file.name,
    fields: fields.sort((a, b) => a.label.localeCompare(b.label, "fr")),
    values,
    warning: fields.length ? undefined : "Aucune donnée reconnue : ce fichier ne suit pas le modèle officiel Orange.",
  };
}

const PDF_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "referenceOrange", re: /r[eé]f[eé]rence[^\n:]*:?\s*([A-Z0-9\-_/]{4,})/i },
  { id: "commune", re: /commune[^\n:]*:?\s*([^\n]{2,40})/i },
  { id: "codePostal", re: /code\s*postal[^\n:]*:?\s*(\d{5})/i },
  { id: "nomVoie", re: /nom\s*de\s*la\s*voie[^\n:]*:?\s*([^\n]{2,60})/i },
  { id: "numeroVoie", re: /num[eé]ro\s*de\s*la\s*voie[^\n:]*:?\s*([^\n]{1,12})/i },
  { id: "centre", re: /centre[^\n:]*:?\s*([^\n]{2,40})/i },
  { id: "zone", re: /\bzone\b[^\n:]*:?\s*([^\n]{2,40})/i },
  { id: "typeCable", re: /type\s*de\s*c[aâ]ble[^\n:]*:?\s*([^\n]{2,60})/i },
  { id: "numTroncon", re: /tron[cç]on[^\n:]*:?\s*([^\n]{1,30})/i },
  { id: "referenceContenant", re: /\b(?:NRO|PB|IMB)[^\n]{0,4}:?\s*([A-Z0-9\-_/]{3,})/i },
  { id: "gpsCoordsDefaut", re: /(-?\d{1,3}[.,]\d{3,}\s*[,;]\s*-?\d{1,3}[.,]\d{3,})/ },
];

/** Extrait le texte d'un PDF puis en déduit les informations reconnues. */
export async function parseCriPdf(file: File): Promise<ImportResult> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  const pages = Math.min(doc.numPages, 20);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text +=
      content.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join(" ") + "\n";
  }

  const fields: ImportedField[] = [];
  const values: Record<string, unknown> = {};
  for (const p of PDF_PATTERNS) {
    const m = text.match(p.re);
    const raw = m?.[1]?.trim();
    if (!raw) continue;
    values[p.id] = raw;
    fields.push({ id: p.id, label: fieldById(p.id)?.label ?? p.id, value: raw });
  }

  return {
    kind: "pdf",
    fileName: file.name,
    fields,
    values,
    rawPreview: text.slice(0, 1500),
    warning: fields.length
      ? undefined
      : "Aucune information reconnue automatiquement — le texte extrait est affiché ci-dessous.",
  };
}

export async function parseCriFile(file: File): Promise<ImportResult> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) return parseCriXlsx(file);
  if (/\.pdf$/i.test(file.name)) return parseCriPdf(file);
  throw new Error("Format non supporté : choisissez un fichier Excel (.xlsx) ou PDF.");
}
