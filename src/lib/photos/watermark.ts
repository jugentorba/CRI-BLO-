import type { Address } from "@/lib/cri/types";

export interface WatermarkInfo {
  date: Date;
  address: Address;
  coordinates?: string;
}

function formatAddressLine(a: Address): string {
  const line1 = [a.streetNumber, a.street].filter(Boolean).join(" ").trim();
  const line2 = [a.postalCode, a.commune].filter(Boolean).join(" ").trim();
  const line3 = [a.region, a.country].filter(Boolean).join(", ").trim();
  return [line1, line2, line3].filter(Boolean).join(" — ");
}

/**
 * Lit un fichier image, redimensionne à 2560 max, applique un watermark
 * en bas (date + heure + adresse complète UNIQUEMENT), retourne un Blob JPEG.
 */
export async function watermarkImage(file: File | Blob, info: WatermarkInfo): Promise<Blob> {
  const bitmap = await createBitmap(file);
  const MAX = 4096; // Pleine résolution (limite raisonnable pour stockage mobile).
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const datePart = info.date.toLocaleDateString("fr-FR");
  const timePart = info.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const addr = formatAddressLine(info.address);
  const line1 = `${datePart} · ${timePart}`;
  const line2 = [addr, info.coordinates].filter(Boolean).join(" · ");

  const padding = Math.round(w * 0.018);
  const fontSize = Math.max(16, Math.round(w * 0.022));
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", Arial`;
  ctx.textBaseline = "bottom";

  const lines = line2 ? [line1, line2] : [line1];
  const bandHeight = lines.length * (fontSize + 6) + padding * 1.5;
  const gradient = ctx.createLinearGradient(0, h - bandHeight, 0, h);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, h - bandHeight, w, bandHeight);

  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;
  let y = h - padding;
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i], padding, y);
    y -= fontSize + 6;
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Encodage image impossible"))),
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
      // fallback below
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
