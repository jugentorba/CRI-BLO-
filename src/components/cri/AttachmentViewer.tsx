import { useEffect, useState } from "react";
import { Download, FileQuestion, Loader2, X } from "lucide-react";
import ExcelJS from "exceljs";
import type { AttachmentRecord } from "@/lib/attachments/repository";
import { downloadBlob } from "@/lib/export/folder";

type Preview =
  | { kind: "image"; url: string }
  | { kind: "pdf"; pages: string[] }
  | { kind: "table"; rows: string[][]; sheetName: string }
  | { kind: "text"; text: string }
  | { kind: "unsupported" };

function extension(name: string): string {
  return name.split(".").pop()?.toLocaleLowerCase("fr-FR") ?? "";
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toLocaleString("fr-FR");
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result != null) return String(value.result);
    return JSON.stringify(value);
  }
  return String(value);
}

async function loadPreview(file: AttachmentRecord): Promise<Preview> {
  const ext = extension(file.name);
  const mime = file.type.toLocaleLowerCase();

  if (mime.startsWith("image/") || /^(png|jpe?g|gif|webp|bmp|svg)$/.test(ext)) {
    return { kind: "image", url: URL.createObjectURL(file.blob) };
  }

  if (mime === "application/pdf" || ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument({ data: await file.blob.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const initial = page.getViewport({ scale: 1 });
      const scale = Math.min(2, Math.max(1, 1400 / initial.width));
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Affichage PDF indisponible sur cet appareil.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pages.push(canvas.toDataURL("image/jpeg", 0.9));
      page.cleanup();
    }
    await pdf.destroy();
    return { kind: "pdf", pages };
  }

  if (/^(xlsx|xlsm)$/.test(ext)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.blob.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return { kind: "table", rows: [], sheetName: "Excel" };
    const rows: string[][] = [];
    const rowCount = Math.min(sheet.rowCount, 500);
    const columnCount = Math.min(sheet.columnCount || 1, 50);
    for (let row = 1; row <= rowCount; row += 1) {
      const values: string[] = [];
      for (let column = 1; column <= columnCount; column += 1) {
        values.push(cellText(sheet.getCell(row, column).value));
      }
      rows.push(values);
    }
    return { kind: "table", rows, sheetName: sheet.name };
  }

  if (ext === "docx") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")?.async("string");
    const text = (xml ?? "")
      .replace(/<w:tab[^>]*\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    return { kind: "text", text };
  }

  if (mime.startsWith("text/") || /^(txt|csv|json|xml|log|md)$/.test(ext)) {
    return { kind: "text", text: await file.blob.text() };
  }

  return { kind: "unsupported" };
}

export function AttachmentViewer({
  file,
  onClose,
}: {
  file: AttachmentRecord;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPreview(null);
    setError(null);
    void loadPreview(file)
      .then((result) => {
        if (result.kind === "image") objectUrl = result.url;
        if (!active) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return;
        }
        setPreview(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Ouverture impossible.");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border bg-card p-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-foreground">{file.name}</div>
          <div className="text-[10px] text-muted-foreground">
            Fichier enregistré dans ce dossier
          </div>
        </div>
        <button
          type="button"
          onClick={() => downloadBlob(file.name, file.blob)}
          className="rounded-full p-2 text-primary"
          aria-label="Enregistrer une copie"
        >
          <Download className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} className="rounded-full p-2" aria-label="Fermer">
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-auto bg-muted/30 p-3">
        {!preview && !error && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Ouverture…
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        {preview?.kind === "image" && (
          <img
            src={preview.url}
            alt={file.name}
            className="mx-auto max-h-full max-w-full object-contain"
          />
        )}
        {preview?.kind === "pdf" && (
          <div className="mx-auto max-w-4xl space-y-3">
            {preview.pages.map((page, index) => (
              <img
                key={index}
                src={page}
                alt={`Page ${index + 1}`}
                className="w-full rounded shadow"
              />
            ))}
          </div>
        )}
        {preview?.kind === "table" && (
          <div className="overflow-auto rounded-lg border border-border bg-background">
            <div className="sticky left-0 top-0 border-b border-border bg-card px-3 py-2 text-xs font-bold">
              {preview.sheetName}
            </div>
            <table className="border-collapse text-xs">
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, columnIndex) => (
                      <td
                        key={columnIndex}
                        className="max-w-72 whitespace-pre-wrap border border-border px-2 py-1 align-top"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview?.kind === "text" && (
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs text-foreground">
            {preview.text || "Document vide."}
          </pre>
        )}
        {preview?.kind === "unsupported" && (
          <div className="mx-auto mt-10 max-w-sm rounded-xl border border-border bg-card p-5 text-center">
            <FileQuestion className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="text-sm font-bold">Aperçu indisponible pour ce format</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Le fichier est bien conservé dans le dossier. Enregistrez une copie pour l'ouvrir avec
              une application compatible.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
