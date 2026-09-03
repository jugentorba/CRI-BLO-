import ExcelJS from "exceljs";
import type { CriRecord } from "@/lib/cri/types";
import { getPhoto } from "@/lib/photos/repository";
import { FIELD_CELLS, getPhotoAnchor, sortPhotoSlots } from "@/lib/export/xlsx-config";

export { FIELD_CELLS } from "@/lib/export/xlsx-config";

async function loadTemplate(): Promise<ArrayBuffer> {
  const response = await fetch("/cri_blo_template.xlsx");
  if (!response.ok) throw new Error("Template Excel introuvable");
  return response.arrayBuffer();
}

function normalizedSheetName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function getWorksheet(workbook: ExcelJS.Workbook, requestedName: string) {
  return (
    workbook.getWorksheet(requestedName) ??
    workbook.worksheets.find(
      (sheet) => normalizedSheetName(sheet.name) === normalizedSheetName(requestedName),
    )
  );
}

function sniffSupportedImage(buffer: ArrayBuffer): "png" | "jpeg" | null {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return null;
}

async function decodeImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fallback to the WebView image decoder below.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function normalizeImageToPng(blob: Blob): Promise<ArrayBuffer> {
  const image = await decodeImage(blob);
  const maxDimension = 4096;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponible pour l'export Excel");
  context.drawImage(image, 0, 0, width, height);
  if ("close" in image && typeof image.close === "function") image.close();

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Encodage PNG impossible"))),
      "image/png",
    );
  });
  return png.arrayBuffer();
}

async function excelImageData(
  blob: Blob,
  forceNormalize = false,
): Promise<{ buffer: ArrayBuffer; extension: "png" | "jpeg" }> {
  const raw = await blob.arrayBuffer();
  const detected = sniffSupportedImage(raw);
  if (!forceNormalize && detected) return { buffer: raw, extension: detected };

  // Android may provide WebP/HEIC or an unreliable MIME type. The PLAN image
  // is always decoded and re-encoded as PNG so a visible Geofibre synoptic can
  // no longer silently disappear from the final Excel workbook.
  return { buffer: await normalizeImageToPng(blob), extension: "png" };
}

export async function buildXlsxExport(cri: CriRecord): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await loadTemplate());

  const fiche = getWorksheet(workbook, "FICHE SAV BLO");
  const company = (cri.values?.company as string) ?? cri.technician.company ?? "";
  const lastName = (cri.values?.technicianName as string) ?? cri.technician.lastName ?? "";
  const companyAndName = [company, lastName].filter(Boolean).join(" — ");
  if (fiche && companyAndName) fiche.getCell("B4").value = companyAndName;

  if (fiche) {
    const commune = (cri.values?.commune as string) || cri.address.commune;
    const postalCode = (cri.values?.codePostal as string) || cri.address.postalCode;
    const street = (cri.values?.nomVoie as string) || cri.address.street;
    const streetNumber = (cri.values?.numeroVoie as string) || cri.address.streetNumber;
    if (commune) fiche.getCell("B12").value = commune;
    if (postalCode) fiche.getCell("H12").value = postalCode;
    if (street) fiche.getCell("B13").value = street;
    if (streetNumber) fiche.getCell("B14").value = streetNumber;

    ["A17", "F17", "A20", "F20", "A22", "F22", "A24", "F24"].forEach((cell) => {
      fiche.getCell(cell).alignment = {
        wrapText: true,
        vertical: "middle",
        horizontal: "left",
      };
    });
    fiche.getRow(17).height = 32;
    fiche.getRow(20).height = 22;

    if (cri.values?.clientProvisoire === true || cri.values?.clientProvisoire === false) {
      fiche.getCell("C8").value = null;
    }
    if (cri.values?.dommageReseau === true || cri.values?.dommageReseau === false) {
      fiche.getCell("C9").value = null;
    }
  }

  for (const [fieldId, map] of Object.entries(FIELD_CELLS)) {
    const sheet = getWorksheet(workbook, map.sheet);
    if (!sheet) continue;
    const raw = cri.values?.[fieldId];
    if (raw === undefined || raw === null || raw === "") continue;
    sheet.getCell(map.cell).value = map.format ? map.format(raw, cri) : String(raw);
  }

  for (const slot of sortPhotoSlots(Object.keys(cri.photos ?? {}))) {
    if (!cri.photos?.[slot]) continue;
    const anchor = getPhotoAnchor(slot);
    if (!anchor) continue;

    const stored = await getPhoto(cri.id, slot);
    if (!stored) continue;
    const sheet = getWorksheet(workbook, anchor.sheet);
    if (!sheet) continue;

    const image = await excelImageData(stored.blob, slot === "photo_plan");
    const imageId = workbook.addImage({ buffer: image.buffer, extension: image.extension });
    sheet.addImage(imageId, {
      tl: { col: anchor.col, row: anchor.row } as ExcelJS.ImageRange["tl"],
      br: {
        col: anchor.col + anchor.cols,
        row: anchor.row + anchor.rows,
      } as ExcelJS.ImageRange["br"],
      editAs: "oneCell",
    });

    if (slot === "photo_plan") sheet.state = "visible";
  }

  const output = await workbook.xlsx.writeBuffer();
  return new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
