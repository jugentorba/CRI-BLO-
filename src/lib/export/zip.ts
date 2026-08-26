// Export ZIP: official document (Excel OR PDF) + supplementary files.
// Supplementary OI photos stay embedded in the official document and user
// attachments are deliberately flat at ZIP root.

import JSZip from "jszip";
import type { CriRecord } from "@/lib/cri/types";
import { buildXlsxExport } from "@/lib/export/xlsx";
import { buildPdfExport } from "@/lib/export/pdf";
import { listAttachments } from "@/lib/attachments/repository";
import { exportFileName } from "@/lib/export/naming";

export type ZipVariant = "xlsx" | "pdf";

function flatFileName(name: string): string {
  // Browser File.name is normally already a basename, but imported records may
  // contain path separators. Strip them so no attachment can create a ZIP subfolder.
  const base = name.split(/[\\/]/).filter(Boolean).pop()?.trim();
  return base || "fichier-supplementaire";
}

function uniqueName(used: Set<string>, requestedName: string): string {
  const name = flatFileName(requestedName);
  const key = name.toLocaleLowerCase("fr-FR");
  if (!used.has(key)) {
    used.add(key);
    return name;
  }

  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let index = 2;
  let next = `${base}-${index}${extension}`;
  while (used.has(next.toLocaleLowerCase("fr-FR"))) {
    index += 1;
    next = `${base}-${index}${extension}`;
  }
  used.add(next.toLocaleLowerCase("fr-FR"));
  return next;
}

function verifyFlatZip(zip: JSZip, expectedFiles: number): void {
  const entries = Object.values(zip.files);
  const files = entries.filter((entry) => !entry.dir);
  if (files.length !== expectedFiles) {
    throw new Error(
      `ZIP incomplet : ${files.length} fichier(s) présent(s), ${expectedFiles} attendu(s).`,
    );
  }

  const invalid = files.find((entry) => /[\\/]/.test(entry.name));
  if (invalid) {
    throw new Error(`ZIP invalide : « ${invalid.name} » n'est pas à la racine.`);
  }

  const normalized = files.map((entry) => entry.name.toLocaleLowerCase("fr-FR"));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("ZIP invalide : des noms de fichiers en double ont été détectés.");
  }
}

export async function buildZipExport(
  cri: CriRecord,
  variant: ZipVariant = "xlsx",
): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();

  const reference = (cri.values?.referenceOrange as string) ?? cri.reference ?? "";
  const commune = (cri.values?.commune as string) ?? cri.address?.commune ?? "";

  // 1. Official document at ZIP root.
  const mainBlob = variant === "pdf" ? await buildPdfExport(cri) : await buildXlsxExport(cri);
  const mainName = uniqueName(used, exportFileName(reference, commune, variant));
  zip.file(mainName, mainBlob);

  // 2. Supplementary OI photos are already embedded in the document/template.

  // 3. User-added supplementary files, FLAT at ZIP root. Original basenames are
  // retained; collisions become name-2.ext, name-3.ext, etc. Never overwrite.
  const attachments = await listAttachments(cri.id);
  for (const attachment of attachments) {
    zip.file(uniqueName(used, attachment.name), attachment.blob);
  }

  // Do not report success unless the in-memory package structure is complete.
  verifyFlatZip(zip, 1 + attachments.length);

  const output = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  if (output.size === 0) throw new Error("ZIP vide : export annulé.");
  return output;
}
