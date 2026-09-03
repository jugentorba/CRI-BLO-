// Export ZIP: official document (Excel OR PDF) + supplementary photos/files.
// Everything is deliberately flat at ZIP root: no hidden subfolders.

import JSZip from "jszip";
import type { CriRecord } from "@/lib/cri/types";
import { buildXlsxExport } from "@/lib/export/xlsx";
import { buildPdfExport } from "@/lib/export/pdf";
import { listAttachments } from "@/lib/attachments/repository";
import { getPhoto } from "@/lib/photos/repository";
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

function photoExtension(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("heic")) return "heic";
  if (type.includes("heif")) return "heif";
  return "jpg";
}

function extraPhotoNumber(slot: string): number | null {
  const match = /^photo_extra_(\d+)$/.exec(slot);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isInteger(number) && number > 0 ? number : null;
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

  // 2. Supplementary OI photos are embedded in Excel/PDF AND exported as
  // individual evidence files at ZIP root. This keeps them directly accessible
  // without creating a Photos/ or supplementary subfolder.
  const extraSlots = Object.keys(cri.photos ?? {})
    .map((slot) => ({ slot, number: extraPhotoNumber(slot) }))
    .filter((entry): entry is { slot: string; number: number } => entry.number !== null)
    .sort((a, b) => a.number - b.number);

  let exportedExtraPhotos = 0;
  for (const { slot, number } of extraSlots) {
    const stored = await getPhoto(cri.id, slot);
    if (!stored) continue;
    const photoName = `Photo_supplementaire_${number}.${photoExtension(stored.blob)}`;
    zip.file(uniqueName(used, photoName), stored.blob);
    exportedExtraPhotos += 1;
  }

  // 3. User-added supplementary files, FLAT at ZIP root. Original basenames are
  // retained; collisions become name-2.ext, name-3.ext, etc. Never overwrite.
  const attachments = await listAttachments(cri.id);
  for (const attachment of attachments) {
    zip.file(uniqueName(used, attachment.name), attachment.blob);
  }

  // Do not report success unless the in-memory package structure is complete.
  verifyFlatZip(zip, 1 + exportedExtraPhotos + attachments.length);

  const output = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  if (output.size === 0) throw new Error("ZIP vide : export annulé.");
  return output;
}
