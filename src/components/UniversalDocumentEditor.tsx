import { useEffect, useMemo, useState } from "react";
import { FileText, Save, X, Download, Plus, Trash2, Sheet, FilePenLine } from "lucide-react";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";

export interface EditableDocument {
  name: string;
  mimeType?: string;
  blob: Blob;
}

export function UniversalDocumentEditor({
  document,
  onClose,
  onSaved,
}: {
  document: EditableDocument;
  onClose: () => void;
  onSaved?: (blob: Blob, fileName: string) => void;
}) {
  const kind = /\.xlsx?$|\.xlsm$/i.test(document.name)
    ? "xlsx"
    : /\.docx$/i.test(document.name)
      ? "docx"
      : /\.pdf$/i.test(document.name)
        ? "pdf"
        : "text";
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [cells, setCells] = useState<string[][]>([]);
  const [sheetName, setSheetName] = useState("Sheet1");

  useEffect(() => {
    void load();
    async function load() {
      setBusy(true); setError(null);
      try {
        if (kind === "xlsx") {
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(await document.blob.arrayBuffer());
          const ws = wb.worksheets[0];
          setSheetName(ws?.name ?? "Sheet1");
          const rows: string[][] = [];
          if (ws) {
            for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
              const row: string[] = [];
              for (let c = 1; c <= Math.min(ws.columnCount || 10, 12); c++) {
                const v = ws.getCell(r, c).value;
                row.push(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
              }
              rows.push(row);
            }
          }
          setCells(rows.length ? rows : [Array(6).fill("")]);
        } else if (kind === "docx") {
          const JSZip = (await import("jszip")).default;
          const z = await JSZip.loadAsync(await document.blob.arrayBuffer());
          const xml = await z.file("word/document.xml")?.async("string");
          setText(xml ? xml.replace(/<w:tab[^>]*\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "");
        } else if (kind === "pdf") {
          const pdfjs = await import("pdfjs-dist");
          const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
          pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
          const pdf = await pdfjs.getDocument({ data: await document.blob.arrayBuffer() }).promise;
          let out = "";
          for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            out += content.items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n\n";
          }
          setText(out);
        } else {
          setText(await document.blob.text());
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Document illisible.");
      } finally { setBusy(false); }
    }
  }, [document, kind]);

  const title = useMemo(() => kind === "xlsx" ? `Excel · ${sheetName}` : kind === "pdf" ? "PDF · texte éditable" : kind === "docx" ? "Word · texte éditable" : "Document", [kind, sheetName]);

  async function save() {
    setBusy(true); setError(null);
    try {
      if (kind === "xlsx") {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await document.blob.arrayBuffer());
        const ws = wb.worksheets[0] ?? wb.addWorksheet(sheetName);
        cells.forEach((row, r) => row.forEach((v, c) => { ws.getCell(r + 1, c + 1).value = v; }));
        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        await deliver(blob, document.name);
      } else if (kind === "docx") {
        const JSZip = (await import("jszip")).default;
        const z = await JSZip.loadAsync(await document.blob.arrayBuffer());
        const xml = await z.file("word/document.xml")?.async("string");
        if (!xml) throw new Error("document.xml absent.");
        const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const runs = escaped.split(/\n/).map((line) => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`).join("");
        const sectPr = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";
        const rebuilt = xml.replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${runs}${sectPr}</w:body>`);
        z.file("word/document.xml", rebuilt);
        const out = await z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        await deliver(out, document.name);
      } else if (kind === "pdf") {
        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        const lines = pdf.splitTextToSize(text, 520);
        let y = 48;
        for (const line of lines) {
          if (y > 790) { pdf.addPage(); y = 48; }
          pdf.text(line, 40, y); y += 15;
        }
        const out = pdf.output("blob");
        await deliver(out, document.name.replace(/\.pdf$/i, "-modified.pdf"));
      } else {
        await deliver(new Blob([text], { type: document.mimeType || "text/plain" }), document.name);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  }

  async function deliver(blob: Blob, name: string) {
    onSaved?.(blob, name);
    const file = new File([blob], name, { type: blob.type });
    if ("showSaveFilePicker" in window) {
      try {
        const picker = (window as Window & { showSaveFilePicker?: (o: unknown) => Promise<any> }).showSaveFilePicker;
        const handle = await picker?.({ suggestedName: name });
        if (handle) {
          const w = await handle.createWritable(); await w.write(blob); await w.close(); return;
        }
      } catch { /* fallback */ }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-card p-3">
        <FilePenLine className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{document.name}</div><div className="text-[10px] text-muted-foreground">{title}</div></div>
        <button type="button" onClick={onClose} className="rounded-full p-2"><X className="h-4 w-4" /></button>
      </div>
      {error && <div className="m-3 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
      {busy && !text && !cells.length ? <div className="p-4 text-sm">Ouverture…</div> : kind === "xlsx" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3"><table className="min-w-full border-collapse text-xs"><tbody>{cells.map((row,r)=><tr key={r}>{row.map((v,c)=><td key={c} className="border border-border p-0"><input value={v} onChange={e=>setCells(prev=>prev.map((rr,ri)=>ri===r?rr.map((cc,ci)=>ci===c?e.target.value:cc):rr))} className="min-w-24 bg-background p-2 outline-none focus:bg-primary/5"/></td>)}</tr>)}</tbody></table><button type="button" onClick={()=>setCells(p=>[...p,Array(p[0]?.length||6).fill("")])} className="mt-2 rounded-lg border px-3 py-2 text-xs"><Plus className="mr-1 inline h-3 w-3"/>Ajouter une ligne</button></div>
      ) : (
        <textarea value={text} onChange={e=>setText(e.target.value)} className="min-h-0 flex-1 resize-none p-4 font-mono text-sm outline-none" spellCheck={false}/>
      )}
      <div className="border-t border-border bg-card p-3"><button type="button" disabled={busy} onClick={()=>void save()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground"><Save className="h-4 w-4"/>Enregistrer sous…</button><p className="mt-1 text-center text-[10px] text-muted-foreground">PDF : le texte est recréé dans un nouveau PDF. Excel conserve le classeur. DOCX conserve le conteneur DOCX mais réécrit le corps du document.</p></div>
    </div>
  );
}
