// Naming utilities for CRI BLO exports.
// - Excel/PDF/HTML: CRI_BLO_{Commune}_{NuméroDossier}.{ext}
// - ZIP package:    {NuméroDossier}_{Commune}.zip

function safe(s: string): string {
  return (s || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "_") || "NA";
}

export function exportFileName(
  reference: string,
  commune: string,
  ext: "pdf" | "xlsx" | "html",
): string {
  return `CRI_BLO_${safe(commune)}_${safe(reference)}.${ext}`;
}

export function zipFileName(reference: string, commune: string): string {
  return `${safe(reference)}_${safe(commune)}.zip`;
}
