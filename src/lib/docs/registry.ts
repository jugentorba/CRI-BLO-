// Registre des types de documents gérés par la PWA.
// Chaque type est un module INDÉPENDANT : le module CRI BLO reste protégé et
// n'est jamais modifié par la détection d'un autre document.

export type DocTypeId = "cri_blo" | "d15" | "unknown";

export interface DocTypeDef {
  id: DocTypeId;
  label: string;
  description: string;
  /** Route du module qui sait ouvrir ce document (null = pas de module dédié). */
  route: "/cri/$id" | "/documents" | null;
}

export const DOC_TYPES: Record<DocTypeId, DocTypeDef> = {
  cri_blo: {
    id: "cri_blo",
    label: "CRI BLO",
    description: "Compte-rendu d'intervention BLO (module officiel Orange).",
    route: "/cri/$id",
  },
  d15: {
    id: "d15",
    label: "D15",
    description: "Fiche D15 — conservée dans son propre historique.",
    route: "/documents",
  },
  unknown: {
    id: "unknown",
    label: "Document non reconnu",
    description: "Type inconnu : aucune action automatique sur le CRI BLO.",
    route: null,
  },
};

export interface DetectionResult {
  type: DocTypeId;
  confidence: number; // 0 → 1
  reasons: string[];
  sheetNames?: string[];
  textPreview?: string;
}

const CRI_SHEET_HINTS = ["fiche sav blo", "mesures", "photos oi", "plan"];
const CRI_TEXT_HINTS = ["cri blo", "fiche sav blo", "blo", "raccordement", "soudure"];
const D15_HINTS = ["d15", "d 15"];

function score(hits: number, total: number): number {
  return total === 0 ? 0 : Math.min(1, hits / total);
}

/** Détection à partir des noms de feuilles d'un classeur Excel. */
export function detectFromSheets(sheetNames: string[], fileName: string): DetectionResult {
  const lower = sheetNames.map((s) => s.trim().toLowerCase());
  const criHits = CRI_SHEET_HINTS.filter((h) => lower.some((s) => s.includes(h)));
  const reasons: string[] = [];
  if (criHits.length) reasons.push(`Feuilles CRI BLO détectées : ${criHits.join(", ")}`);

  const name = fileName.toLowerCase();
  if (/cri\s*[-_ ]?blo/.test(name)) {
    reasons.push("Nom du fichier contenant « CRI BLO »");
    return { type: "cri_blo", confidence: Math.max(0.8, score(criHits.length, 4)), reasons, sheetNames };
  }
  if (criHits.length >= 2) {
    return { type: "cri_blo", confidence: score(criHits.length, 4), reasons, sheetNames };
  }
  if (D15_HINTS.some((h) => name.includes(h) || lower.some((s) => s.includes(h)))) {
    reasons.push("Référence « D15 » trouvée");
    return { type: "d15", confidence: 0.7, reasons, sheetNames };
  }
  reasons.push("Aucune signature CRI BLO reconnue dans ce classeur");
  return { type: "unknown", confidence: 0, reasons, sheetNames };
}

/** Détection à partir du texte extrait d'un PDF. */
export function detectFromText(text: string, fileName: string): DetectionResult {
  const t = `${fileName}\n${text}`.toLowerCase();
  const reasons: string[] = [];
  const criHits = CRI_TEXT_HINTS.filter((h) => t.includes(h));
  if (criHits.length) reasons.push(`Termes CRI BLO détectés : ${criHits.join(", ")}`);
  if (t.includes("cri blo") || t.includes("fiche sav blo") || criHits.length >= 3) {
    return {
      type: "cri_blo",
      confidence: t.includes("cri blo") ? 0.9 : score(criHits.length, 5),
      reasons,
      textPreview: text.slice(0, 800),
    };
  }
  if (D15_HINTS.some((h) => t.includes(h))) {
    reasons.push("Référence « D15 » trouvée");
    return { type: "d15", confidence: 0.7, reasons, textPreview: text.slice(0, 800) };
  }
  reasons.push("Aucune signature CRI BLO reconnue dans ce document");
  return { type: "unknown", confidence: 0, reasons, textPreview: text.slice(0, 800) };
}
