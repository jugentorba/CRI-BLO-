// Export ZIP : document officiel (Excel OU PDF) + fichiers supplémentaires.
// Les photos supplémentaires OI sont réservées au classeur Excel (feuille PHOTOS OI).
// Elles ne sont jamais ajoutées au ZIP comme fichiers séparés et ne sont pas ajoutées au PDF.

import JSZip from "jszip";
import type { CriRecord } from "@/lib/cri/types";
import { buildXlsxExport } from "@/lib/export/xlsx";
import { buildPdfExport } from "@/lib/export/pdf";
import { listAttachments } from "@/lib/attachments/repository";
import { exportFileName } from "@/lib/export/naming";

export type ZipVariant = "xlsx" | "pdf";


function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (used.has(`${base}-${i}${ext}`)) i++;
  const next = `${base}-${i}${ext}`;
  used.add(next);
  return next;
}

export async function buildZipExport(
  cri: CriRecord,
  variant: ZipVariant = "xlsx",
): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();

  const reference = (cri.values?.referenceOrange as string) ?? cri.reference ?? "";
  const commune = (cri.values?.commune as string) ?? cri.address?.commune ?? "";

  // 1. Document officiel à la racine du ZIP (Excel ou PDF selon le choix).
  const mainBlob = variant === "pdf" ? await buildPdfExport(cri) : await buildXlsxExport(cri);
  zip.file(uniqueName(used, exportFileName(reference, commune, variant)), mainBlob);

  // 2. Photos supplémentaires OI : jamais exportées comme fichiers.
  //    Avec la variante XLSX, elles sont intégrées uniquement dans la feuille PHOTOS OI.
  //    Avec la variante PDF, elles ne sont pas exportées.

  // 3. Fichiers supplémentaires — uniquement ce que l'utilisateur a ajouté
  //    explicitement dans la section « Fichiers supplémentaires ».
  const attachments = await listAttachments(cri.id);
  for (const a of attachments) {
    zip.file(uniqueName(used, a.name), a.blob);
  }


  // Génère d'abord un buffer complet : sur Android/WebView c'est plus fiable
  // qu'un Blob produit directement pendant la compression, surtout pour les
  // archives volumineuses avec photos et pièces jointes.
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  // Round-trip validation catches truncated archives before they are downloaded.
  const verified = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const expected = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  for (const name of expected) {
    const item = verified.file(name);
    if (!item) throw new Error(`Export ZIP invalide : fichier manquant : ${name}`);
    const original = await zip.file(name)?.async("uint8array");
    const extracted = await item.async("uint8array");
    if (!original || original.byteLength !== extracted.byteLength) {
      throw new Error(`Export ZIP invalide : fichier incomplet : ${name}`);
    }
  }
  const zipBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(zipBuffer).set(bytes);
  return new Blob([zipBuffer], { type: "application/zip" });
}
