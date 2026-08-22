// Analyse d'un fichier importé pour déterminer son TYPE avant toute action.
// Module isolé : n'écrit rien et ne touche jamais aux données CRI BLO.

import { detectFromSheets, detectFromText, type DetectionResult } from "@/lib/docs/registry";

export async function detectDocument(file: File): Promise<DetectionResult> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const names = wb.worksheets.map((w) => w.name);
      return detectFromSheets(names, file.name);
    } catch {
      return {
        type: "unknown",
        confidence: 0,
        reasons: ["Classeur Excel illisible ou protégé."],
      };
    }
  }

  if (/\.pdf$/i.test(file.name)) {
    try {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      let text = "";
      const pages = Math.min(doc.numPages, 5);
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text +=
          content.items
            .map((it) => ("str" in it ? (it as { str: string }).str : ""))
            .join(" ") + "\n";
      }
      return detectFromText(text, file.name);
    } catch {
      return { type: "unknown", confidence: 0, reasons: ["PDF illisible."] };
    }
  }

  if (/\.docx$/i.test(file.name)) {
    try {
      const zip = await import("jszip");
      const z = await zip.default.loadAsync(await file.arrayBuffer());
      const xml = await z.file("word/document.xml")?.async("string");
      const text = xml?.replace(/<w:tab[^>]*\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
      return detectFromText(text, file.name);
    } catch {
      return { type: "unknown", confidence: 0, reasons: ["DOCX illisible."] };
    }
  }

  return {
    type: "unknown",
    confidence: 0,
    reasons: ["Format importé : édition disponible pour PDF, DOCX et Excel."],
  };
}
