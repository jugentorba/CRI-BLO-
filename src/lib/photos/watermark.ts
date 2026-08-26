import type { Address } from "@/lib/cri/types";

export interface WatermarkInfo {
  /** Capture time, not processing/export time. */
  date: Date;
  address: Address;
  coordinates?: string;
}

function formatAddressLine(address: Address): string {
  const line1 = [address.streetNumber, address.street].filter(Boolean).join(" ").trim();
  const line2 = [address.postalCode, address.commune].filter(Boolean).join(" ").trim();
  const line3 = [address.region, address.country].filter(Boolean).join(", ").trim();
  return [line1, line2, line3].filter(Boolean).join(" — ");
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const suffix = "…";
  let next = text;
  while (next.length > 1 && ctx.measureText(next + suffix).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return next + suffix;
}

/**
 * Creates the evidence/stamped version of an image. The source Blob/File is
 * never mutated; callers are responsible for retaining it as the original.
 */
export async function watermarkImage(file: File | Blob, info: WatermarkInfo): Promise<Blob> {
  const bitmap = await createBitmap(file);
  const maxDimension = 4096;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const datePart = info.date.toLocaleDateString("fr-FR");
  const timePart = info.date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const addressLine = formatAddressLine(info.address);
  const coordinateLine = info.coordinates?.trim();
  const lines = [
    `${datePart} · ${timePart}`,
    `GPS : ${coordinateLine || "indisponible"}`,
    `Adresse : ${addressLine || "indisponible"}`,
  ];

  const padding = Math.round(width * 0.018);
  const fontSize = Math.max(16, Math.round(width * 0.02));
  const lineHeight = fontSize + 6;
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", Arial`;
  ctx.textBaseline = "bottom";

  const bandHeight = lines.length * lineHeight + padding * 1.5;
  const gradient = ctx.createLinearGradient(0, height - bandHeight, 0, height);
  gradient.addColorStop(0, "rgba(0,0,0,0.08)");
  gradient.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, height - bandHeight, width, bandHeight);

  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 4;
  let y = height - padding;
  const maxTextWidth = width - padding * 2;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    ctx.fillText(fitText(ctx, lines[index], maxTextWidth), padding, y);
    y -= lineHeight;
  }

  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encodage image impossible"))),
      "image/jpeg",
      0.9,
    );
  });
}

async function createBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fallback below for formats/WebViews unsupported by createImageBitmap.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
