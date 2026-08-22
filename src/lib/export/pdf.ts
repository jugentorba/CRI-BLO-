// Génère un vrai PDF (A4) à partir du rendu HTML officiel du CRI BLO.
// On insère le HTML dans un iframe caché à largeur A4 (794 px @ 96 dpi),
// puis on rasterise chaque "page" avec html2canvas et on l'injecte dans jsPDF.
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { CriRecord } from "@/lib/cri/types";
import { buildHtmlExport } from "./html";

const A4_W_PX = 794; // 210mm @ 96dpi
const A4_H_PX = 1123; // 297mm @ 96dpi

export async function buildPdfExport(cri: CriRecord): Promise<Blob> {
  const htmlBlob = await buildHtmlExport(cri);
  const html = await htmlBlob.text();

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${A4_W_PX}px`;
  iframe.style.height = `${A4_H_PX}px`;
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    // Attendre chargement des images
    await new Promise((r) => setTimeout(r, 150));
    const imgs = Array.from(doc.images);
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
      ),
    );

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWmm = 210;
    const pageHmm = 297;

    const body = doc.body;
    body.style.margin = "0";
    body.style.padding = "0";
    body.style.width = `${A4_W_PX}px`;
    body.style.background = "#ffffff";

    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".page"));
    let firstPdfPage = true;
    for (const page of pages) {
      // Chaque .page fait exactement une A4 (794 × 1123 px) : on la rasterise
      // telle quelle, sans découpage, pour éviter tout décalage / contenu coupé.
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        width: A4_W_PX,
        height: A4_H_PX,
        windowWidth: A4_W_PX,
        windowHeight: A4_H_PX,
      });

      if (!firstPdfPage) pdf.addPage();
      firstPdfPage = false;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWmm, pageHmm);
    }

    const out = pdf.output("blob");
    return out;
  } finally {
    iframe.remove();
  }
}
