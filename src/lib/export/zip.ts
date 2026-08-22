// Export ZIP : document officiel (Excel OU PDF) + fichiers supplémentaires.
// Les photos supplémentaires OI sont intégrées dans le classeur Excel, pas en fichiers séparés.

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

  // 2. Photos supplémentaires OI : NON exportées séparément — elles sont déjà
  //    intégrées comme images dans le classeur Excel (feuille PHOTOS OI).

  // 3. Fichiers supplémentaires — uniquement ce que l'utilisateur a ajouté
  //    explicitement dans la section « Fichiers supplémentaires ».
  const attachments = await listAttachments(cri.id);
  for (const a of attachments) {
    zip.file(uniqueName(used, `Fichiers supplementaires/${a.name}`), a.blob);
  }


  return await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
