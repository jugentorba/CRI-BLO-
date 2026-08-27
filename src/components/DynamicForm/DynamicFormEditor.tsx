/**
 * DynamicFormEditor – auto-generates a fillable form UI from any uploaded document.
 *
 * Supports: Excel (.xlsx/.xlsm), CSV, JSON, PDF (text extraction), plain text.
 * The CRI BLO module is NEVER touched by this component.
 *
 * Features:
 *  - N/A toggle for every non-address field
 *  - Save form values back to the document (Excel) or as JSON/PDF export
 */

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Save,
  ChevronDown,
  FileText,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from "lucide-react";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { useI18n } from "@/lib/i18n/use-i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FormField {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  value: string;
  /** true when user toggled N/A */
  na: boolean;
  options?: string[];
  /** Whether this field is an address field (no N/A option) */
  isAddress: boolean;
}

export interface DynamicFormEditorProps {
  /** Raw file to generate the form from */
  file: File;
  onClose: () => void;
  onSaved?: (blob: Blob, fileName: string) => void;
}

// ─── Address heuristic ────────────────────────────────────────────────────────

const ADDRESS_KEYWORDS = [
  "adresse",
  "address",
  "adresë",
  "rue",
  "street",
  "voie",
  "commune",
  "ville",
  "city",
  "postal",
  "cp ",
  "code postal",
  "postcode",
  "zip",
];

function isAddressField(label: string): boolean {
  const l = label.toLowerCase();
  return ADDRESS_KEYWORDS.some((k) => l.includes(k));
}

// ─── Parser helpers ───────────────────────────────────────────────────────────

function guessType(values: string[]): FormField["type"] {
  const sample = values.filter(Boolean).slice(0, 20);
  if (!sample.length) return "text";
  if (sample.every((v) => /^\d+([.,]\d+)?$/.test(v.trim()))) return "number";
  if (sample.every((v) => /^\d{4}-\d{2}-\d{2}$|^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(v.trim())))
    return "date";
  const unique = new Set(sample.map((v) => v.trim()));
  if (unique.size <= 8 && sample.length >= 4) return "select";
  if (sample.some((v) => v.length > 80)) return "textarea";
  return "text";
}

async function parseExcel(file: File): Promise<FormField[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: string[][] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 50); r++) {
    const row: string[] = [];
    for (let c = 1; c <= Math.min(ws.columnCount || 10, 20); c++) {
      const v = ws.getCell(r, c).value;
      row.push(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    rows.push(row);
  }

  if (!rows.length) return [];

  // Try to detect header row (first non-empty row with mostly non-numeric values)
  const headerRow = rows[0];
  const dataRows = rows.slice(1);
  const colValues: string[][] = headerRow.map((_, ci) =>
    dataRows.map((r) => r[ci] ?? "").filter(Boolean),
  );

  return headerRow
    .map((label, i): FormField | null => {
      if (!label.trim()) return null;
      const vals = colValues[i] ?? [];
      const type = guessType(vals);
      const options = type === "select" ? [...new Set(vals.map((v) => v.trim()))] : undefined;
      return {
        id: `col_${i}`,
        label: label.trim(),
        type,
        value: vals[0] ?? "",
        na: false,
        options,
        isAddress: isAddressField(label),
      };
    })
    .filter((f): f is FormField => f !== null);
}

async function parseCsv(file: File): Promise<FormField[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 1) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const dataLines = lines.slice(1);
  const colValues = headers.map((_, ci) =>
    dataLines
      .map((l) => (l.split(sep)[ci] ?? "").trim().replace(/^"|"$/g, ""))
      .filter(Boolean),
  );

  return headers.map(
    (label, i): FormField => ({
      id: `col_${i}`,
      label,
      type: guessType(colValues[i] ?? []),
      value: colValues[i]?.[0] ?? "",
      na: false,
      options:
        guessType(colValues[i] ?? []) === "select"
          ? [...new Set((colValues[i] ?? []).map((v) => v.trim()))]
          : undefined,
      isAddress: isAddressField(label),
    }),
  );
}

async function parseJson(file: File): Promise<FormField[]> {
  const text = await file.text();
  const json = JSON.parse(text) as unknown;
  const obj = Array.isArray(json) ? json[0] : json;
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).map(([key, value], i): FormField => {
    const label = key.replace(/[_-]/g, " ");
    const strVal = value == null ? "" : String(value);
    return {
      id: `key_${i}`,
      label,
      type: typeof value === "number" ? "number" : "text",
      value: strVal,
      na: false,
      isAddress: isAddressField(label),
    };
  });
}

async function parsePdf(file: File): Promise<FormField[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  }
  // Build a single textarea field for PDF text
  return [
    {
      id: "pdf_text",
      label: "Contenu du document / Document content",
      type: "textarea",
      value: text.trim(),
      na: false,
      isAddress: false,
    },
  ];
}

async function parseFile(file: File): Promise<FormField[]> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) return parseExcel(file);
  if (/\.csv$/i.test(file.name)) return parseCsv(file);
  if (/\.json$/i.test(file.name)) return parseJson(file);
  if (/\.pdf$/i.test(file.name)) return parsePdf(file);
  // Plain text: try CSV or single textarea
  if (/\.txt$/i.test(file.name)) {
    const fields = await parseCsv(file);
    if (fields.length > 1) return fields;
  }
  return [
    {
      id: "raw_text",
      label: "Contenu / Content",
      type: "textarea",
      value: await file.text(),
      na: false,
      isAddress: false,
    },
  ];
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function exportAsPdf(fields: FormField[], fileName: string): Promise<Blob> {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  pdf.setFontSize(14);
  pdf.text(fileName, 40, 40);
  pdf.setFontSize(10);
  let y = 70;
  for (const f of fields) {
    if (y > 780) {
      pdf.addPage();
      y = 40;
    }
    const val = f.na ? "N/A" : f.value || "—";
    const line = `${f.label}: ${val}`;
    const wrapped = pdf.splitTextToSize(line, 520);
    pdf.text(wrapped, 40, y);
    y += wrapped.length * 15 + 5;
  }
  return pdf.output("blob");
}

async function exportAsJson(fields: FormField[], fileName: string): Promise<Blob> {
  const obj: Record<string, string> = {};
  for (const f of fields) {
    obj[f.label] = f.na ? "N/A" : f.value;
  }
  return new Blob([JSON.stringify({ source: fileName, fields: obj }, null, 2)], {
    type: "application/json",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DynamicFormEditor({ file, onClose, onSaved }: DynamicFormEditorProps) {
  const { t } = useI18n();
  const [fields, setFields] = useState<FormField[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void parseFile(file)
      .then(setFields)
      .catch((e) => setError(e instanceof Error ? e.message : "Impossible de lire le fichier."))
      .finally(() => setBusy(false));
  }, [file]);

  function updateField(id: string, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function save() {
    setSaving(true);
    try {
      let blob: Blob;
      let outName: string;
      if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        // Write back values to Excel
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        if (ws) {
          fields.forEach((f, i) => {
            ws.getCell(2, i + 1).value = f.na ? "N/A" : f.value;
          });
        }
        const buf = await wb.xlsx.writeBuffer();
        blob = new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        outName = file.name;
      } else if (/\.json$/i.test(file.name)) {
        blob = await exportAsJson(fields, file.name);
        outName = file.name;
      } else {
        blob = await exportAsPdf(fields, file.name);
        outName = file.name.replace(/\.[^.]+$/, "") + "-filled.pdf";
      }

      onSaved?.(blob, outName);
      await deliver(blob, outName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function deliver(blob: Blob, name: string) {
    if ("showSaveFilePicker" in window) {
      try {
        const picker = (
          window as Window & { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }
        ).showSaveFilePicker;
        const handle = await picker?.({ suggestedName: name });
        if (handle) {
          const w = await handle.createWritable();
          await w.write(blob);
          await w.close();
          return;
        }
      } catch {
        /* fallback */
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const filledCount = useMemo(() => fields.filter((f) => f.value || f.na).length, [fields]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <FileText className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-foreground">{file.name}</div>
          <div className="text-[10px] text-muted-foreground">
            {busy
              ? t.docs_analysing
              : `${fields.length} ${t.form_fields_found} · ${filledCount} ✓`}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      {busy ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t.docs_analysing}
        </div>
      ) : error ? (
        <div className="m-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
          {fields.map((field) => (
            <FieldRow key={field.id} field={field} naLabel={t.form_na} naFullLabel={t.form_na_label} onChange={(p) => updateField(field.id, p)} />
          ))}
        </div>
      )}

      {/* Footer */}
      {!busy && !error && (
        <div className="border-t border-border bg-card px-4 py-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t.form_save}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  naLabel,
  naFullLabel,
  onChange,
}: {
  field: FormField;
  naLabel: string;
  naFullLabel: string;
  onChange: (patch: Partial<FormField>) => void;
}) {
  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50";

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-foreground">{field.label}</label>
        {!field.isAddress && (
          <button
            type="button"
            onClick={() => onChange({ na: !field.na, value: field.na ? "" : field.value })}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
              field.na
                ? "bg-warning/20 text-warning"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {field.na ? (
              <ToggleRight className="h-3 w-3" />
            ) : (
              <ToggleLeft className="h-3 w-3" />
            )}
            {naLabel}
          </button>
        )}
      </div>

      {field.na ? (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm font-semibold text-warning">
          {naFullLabel}
        </div>
      ) : field.type === "select" && field.options ? (
        <div className="relative">
          <select
            value={field.value}
            onChange={(e) => onChange({ value: e.target.value })}
            className={inputClass + " appearance-none pr-8"}
          >
            <option value="">—</option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      ) : field.type === "textarea" ? (
        <textarea
          value={field.value}
          onChange={(e) => onChange({ value: e.target.value })}
          rows={4}
          className={inputClass + " resize-y"}
        />
      ) : (
        <input
          type={field.type}
          value={field.value}
          onChange={(e) => onChange({ value: e.target.value })}
          className={inputClass}
        />
      )}
    </div>
  );
}
