import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { AttachmentRecord } from "@/lib/attachments/repository";
import { downloadBlob } from "@/lib/export/folder";
import { attachmentMimeType } from "@/lib/attachments/open";

type Preview = { kind: "image" | "pdf" | "text" | "table" | "unsupported"; text?: string; rows?: string[][]; url?: string };
type PdfDocument = import("pdfjs-dist").PDFDocumentProxy;

export function AttachmentViewer({ attachment, onClose }: { attachment: AttachmentRecord; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const mime = attachmentMimeType(attachment.name, attachment.type || attachment.blob.type);
  const ext = attachment.name.split(".").pop()?.toLowerCase() || "";

  useEffect(() => {
    let disposed = false;
    let blobUrl: string | undefined;
    setPreview(null);
    setError("");
    setPage(1);
    async function load() {
      try {
        if (mime.startsWith("image/")) {
          blobUrl = URL.createObjectURL(attachment.blob);
          if (!disposed) setPreview({ kind: "image", url: blobUrl });
        } else if (ext === "pdf") {
          const pdfjs = await import("pdfjs-dist");
          const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
          pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
          const pdf = await pdfjs.getDocument({ data: new Uint8Array(await attachment.blob.arrayBuffer()) }).promise;
          if (disposed) { await pdf.destroy(); return; }
          pdfRef.current = pdf;
          setPages(pdf.numPages);
          setPreview({ kind: "pdf" });
        } else if (ext === "xlsx") {
          const ExcelJS = (await import("exceljs")).default;
          const book = new ExcelJS.Workbook();
          await book.xlsx.load(await attachment.blob.arrayBuffer());
          const rows: string[][] = [];
          book.eachSheet((sheet) => {
            rows.push([sheet.name]);
            sheet.eachRow((row) => {
              const cells = Array.isArray(row.values) ? row.values.slice(1) : [];
              rows.push(cells.map((v) => typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "")));
            });
            rows.push([]);
          });
          if (!disposed) setPreview({ kind: "table", rows: rows.slice(0, 300) });
        } else if (ext === "docx") {
          const JSZip = (await import("jszip")).default;
          const archive = await JSZip.loadAsync(attachment.blob);
          const xml = await archive.file("word/document.xml")?.async("string");
          if (!xml) throw new Error("Document Word invalide.");
          const doc = new DOMParser().parseFromString(xml, "application/xml");
          const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p"));
          const text = paragraphs.map((p) => Array.from(p.getElementsByTagNameNS("*", "t")).map((n) => n.textContent || "").join("")).join("\n");
          if (!disposed) setPreview({ kind: "text", text });
        } else if (ext === "zip") {
          const JSZip = (await import("jszip")).default;
          const archive = await JSZip.loadAsync(attachment.blob);
          if (!disposed) setPreview({ kind: "text", text: Object.values(archive.files).map((f) => f.name).join("\n") });
        } else if (mime.startsWith("text/") || ["csv", "json", "xml", "log", "sor"].includes(ext)) {
          if (!disposed) setPreview({ kind: "text", text: (await attachment.blob.text()).slice(0, 250000) });
        } else {
          if (!disposed) setPreview({ kind: "unsupported" });
        }
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : "Lecture impossible."); }
    }
    void load();
    return () => {
      disposed = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (pdfRef.current) { void pdfRef.current.destroy(); pdfRef.current = null; }
    };
  }, [attachment]);

  useEffect(() => {
    if (preview?.kind !== "pdf" || !pdfRef.current || !canvasRef.current) return;
    let cancelled = false;
    let task: import("pdfjs-dist").RenderTask | undefined;
    (async () => {
      try {
        const pdfPage = await pdfRef.current!.getPage(page);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const available = Math.min(window.innerWidth - 40, 920);
        const original = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: available / original.width });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Affichage PDF indisponible.");
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        task = pdfPage.render({ canvasContext: context, canvas, viewport: pdfPage.getViewport({ scale: available / original.width * pixelRatio }) });
        await task.promise;
      } catch (e) {
        if (!cancelled && !(e instanceof Error && e.name === "RenderingCancelledException")) setError("Impossible d'afficher cette page PDF.");
      }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [preview, page]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={attachment.name}>
      <div className="flex items-center gap-2 border-b bg-background px-3 py-3">
        <button type="button" onClick={onClose} aria-label="Fermer"><X className="h-5 w-5" /></button>
        <strong className="min-w-0 flex-1 truncate text-sm">{attachment.name}</strong>
        <button type="button" onClick={() => downloadBlob(attachment.name, attachment.blob)} aria-label="Télécharger"><Download className="h-5 w-5" /></button>
      </div>
      {preview?.kind === "pdf" && <div className="flex items-center justify-center gap-4 border-b py-2">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button>
        <span className="text-sm">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight /></button>
      </div>}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {!error && !preview && <p>Chargement du document…</p>}
        {preview?.kind === "pdf" && <canvas ref={canvasRef} className="mx-auto shadow-md" />}
        {preview?.kind === "image" && <img src={preview.url} alt={attachment.name} className="mx-auto max-w-full object-contain" />}
        {preview?.kind === "text" && <pre className="whitespace-pre-wrap break-words text-sm">{preview.text}</pre>}
        {preview?.kind === "table" && <div className="overflow-x-auto"><table className="text-xs">{preview.rows?.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="border p-1 align-top">{cell}</td>)}</tr>)}</table></div>}
        {preview?.kind === "unsupported" && <p>Aperçu intégré indisponible pour ce format. Le fichier reste disponible au téléchargement.</p>}
      </div>
    </div>
  );
}
