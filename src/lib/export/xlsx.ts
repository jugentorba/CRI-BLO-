// Export XLSX en utilisant le template officiel Orange CRI BLO (jamais modifié).
// Le template est chargé depuis /cri_blo_template.xlsx (servi par Vite),
// les valeurs sont écrites dans les cellules officielles, et les photos sont
// ancrées dans leurs onglets respectifs aux emplacements officiels.

import ExcelJS from "exceljs";
import type { CriRecord } from "@/lib/cri/types";
import { getPhoto } from "@/lib/photos/repository";

interface CellMap {
  sheet: string;
  cell: string;
  // optional transform of stored value -> string written
  format?: (v: unknown, cri: CriRecord) => string;
}

// Mapping FIELD ID -> cellule officielle (Excel template Orange).
export const FIELD_CELLS: Record<string, CellMap> = {
  // Informations générales
  // Informations générales (row 3 — labels A3 / D3)
  interventionStart: { sheet: "FICHE SAV BLO", cell: "B3", format: fmtDateTime },
  interventionEnd: { sheet: "FICHE SAV BLO", cell: "E3", format: fmtDateTime },
  // B4:H4 fusionné — alimenté plus bas (Entreprise — nom et contact)
  siteAccessContact: { sheet: "FICHE SAV BLO", cell: "B5" },
  referenceOrange: { sheet: "FICHE SAV BLO", cell: "B6" },
  centre: { sheet: "FICHE SAV BLO", cell: "E6" },
  zone: { sheet: "FICHE SAV BLO", cell: "H6" }, // F6:G6 = label "zone"
  ripZone: { sheet: "FICHE SAV BLO", cell: "B7" },
  oiOc: { sheet: "FICHE SAV BLO", cell: "E7" },
  nbLiaisonsGTR: { sheet: "FICHE SAV BLO", cell: "H7", format: fmtNumberNA }, // F7:G7 = label
  clientProvisoire: { sheet: "FICHE SAV BLO", cell: "B8", format: fmtRadioOuiNon }, // efface aussi C8
  nomValideur: { sheet: "FICHE SAV BLO", cell: "F8" }, // D8:E8 = label
  dommageReseau: { sheet: "FICHE SAV BLO", cell: "B9", format: fmtRadioOuiNon },
  constatNum: { sheet: "FICHE SAV BLO", cell: "F9" }, // D9:E9 = label, F9:H9 = valeur

  // Localisation
  longueur: { sheet: "FICHE SAV BLO", cell: "E15", format: fmtNumberNA }, // C15:D15 = label
  // Adresse : labels en A16 / F16, valeurs en dessous (ligne 17, laissée libre entre le label et la ligne "Coordonnées GPS" du template)
  adresseA: { sheet: "FICHE SAV BLO", cell: "A17", format: fmtCleanText },
  adresseB: { sheet: "FICHE SAV BLO", cell: "F17", format: fmtCleanText },
  // GPS : label en A19 / F19, valeur en dessous (A20 / F20 fusionné F20:H20)
  gpsCoordsA: { sheet: "FICHE SAV BLO", cell: "A20" },
  gpsCoordsB: { sheet: "FICHE SAV BLO", cell: "F20" },
  // Chambre / Distance : label en ligne N, valeur en ligne N+1 (col A et F)
  chambrePoteauA: { sheet: "FICHE SAV BLO", cell: "A22" },
  chambrePoteauB: { sheet: "FICHE SAV BLO", cell: "F22" },
  distanceDefautA: { sheet: "FICHE SAV BLO", cell: "A24", format: fmtNumberNA },
  distanceDefautB: { sheet: "FICHE SAV BLO", cell: "F24", format: fmtNumberNA },
  defautLocalise: { sheet: "FICHE SAV BLO", cell: "B26", format: fmtDefautLocalise },
  referenceContenant: { sheet: "FICHE SAV BLO", cell: "B27" },
  causePrincipale: { sheet: "FICHE SAV BLO", cell: "B28", format: fmtCause },
  numTroncon: { sheet: "FICHE SAV BLO", cell: "B30" },
  transportDistribution: { sheet: "FICHE SAV BLO", cell: "E30" }, // overrides radio label
  typeCable: { sheet: "FICHE SAV BLO", cell: "B31" },
  longueurCable: { sheet: "FICHE SAV BLO", cell: "G31", format: fmtNumberNA }, // E31:F31 label, G31:H31 valeur

  // Réparation (label puis "=" — valeur dans la colonne qui suit)
  NBJRT: { sheet: "FICHE SAV BLO", cell: "C35", format: fmtNumberNA },
  BE: { sheet: "FICHE SAV BLO", cell: "F35", format: fmtNumberNA },
  NBSOUD: { sheet: "FICHE SAV BLO", cell: "C36", format: fmtNumberNA },
  INGE: { sheet: "FICHE SAV BLO", cell: "G36" },
  CAPA: { sheet: "FICHE SAV BLO", cell: "C37", format: fmtNumberNA },
  PEO: { sheet: "FICHE SAV BLO", cell: "E37", format: fmtNumberNA },
  PBremplace: { sheet: "FICHE SAV BLO", cell: "G37", format: fmtNumberNA },
  CC: { sheet: "FICHE SAV BLO", cell: "C38", format: fmtNumberNA },
  NBCPL: { sheet: "FICHE SAV BLO", cell: "G38", format: fmtNumberNA },
  NBOC: { sheet: "FICHE SAV BLO", cell: "C39", format: fmtNumberNA },
  descriptionTravaux: { sheet: "FICHE SAV BLO", cell: "A41" }, // A41:H41 merged

  // MAJ SI
  majIPON: { sheet: "FICHE SAV BLO", cell: "B45", format: fmtYesNoNa },
  majOPTIMUM: { sheet: "FICHE SAV BLO", cell: "E45", format: fmtYesNoNa },
  majGeofibre: { sheet: "FICHE SAV BLO", cell: "D46", format: fmtYesNoNa }, // A46:C46 = label

  // Rétablissement
  testAGIR: { sheet: "FICHE SAV BLO", cell: "B49", format: fmtYesNo },
  numDecharge: { sheet: "FICHE SAV BLO", cell: "D49" },
  commentaires: { sheet: "FICHE SAV BLO", cell: "A52" }, // A52:H54 merged

  // RDSUR
  rdsurFacture: { sheet: "RDSUR", cell: "A3", format: fmtYesNoNa },
};

// Photos — ancrage 0-indexé ExcelJS : col 0 = colonne A, row 0 = ligne 1.
// PHOTOS OI : A2:C17 / E2:G17 / A20:C35 / E20:G35
const PHOTO_ANCHORS: Record<string, { sheet: string; col: number; row: number; cols: number; rows: number }> = {
  photo_oi_situation: { sheet: "PHOTOS OI", col: 0, row: 2, cols: 3, rows: 15 },
  photo_oi_etiquette: { sheet: "PHOTOS OI", col: 4, row: 2, cols: 3, rows: 15 },
  photo_oi_avant: { sheet: "PHOTOS OI", col: 0, row: 20, cols: 3, rows: 15 },
  photo_oi_apres: { sheet: "PHOTOS OI", col: 4, row: 20, cols: 3, rows: 15 },
  // PHOTOS OC : 4 emplacements officiels + 2 courbes SAV OC ajoutées en dessous
  photo_oc_defaut: { sheet: "PHOTOS OC", col: 0, row: 2, cols: 3, rows: 15 },
  photo_oc_apres_def: { sheet: "PHOTOS OC", col: 4, row: 2, cols: 3, rows: 15 },
  photo_oc_avant: { sheet: "PHOTOS OC", col: 0, row: 20, cols: 3, rows: 15 },
  photo_oc_apres: { sheet: "PHOTOS OC", col: 4, row: 20, cols: 3, rows: 15 },
  photo_oc_mesure1: { sheet: "PHOTOS OC", col: 0, row: 37, cols: 3, rows: 14 },
  photo_oc_mesure2: { sheet: "PHOTOS OC", col: 4, row: 37, cols: 3, rows: 14 },
  // MESURES : uniquement 2 courbes de localisation (max 2 photos sur cette page)
  photo_mesures_loc1: { sheet: "MESURES", col: 0, row: 4, cols: 6, rows: 8 },
  photo_mesures_loc2: { sheet: "MESURES", col: 6, row: 4, cols: 6, rows: 8 },
  // RDSUR
  photo_rdsur_avant: { sheet: "RDSUR", col: 1, row: 4, cols: 4, rows: 14 },
  photo_rdsur_apres: { sheet: "RDSUR", col: 5, row: 4, cols: 4, rows: 14 },
  // PLAN — synoptique principal (inchangé)
  photo_plan: { sheet: "PLAN", col: 0, row: 1, cols: 7, rows: 20 },
};

function extraPhotoNumber(slot: string): number | null {
  const match = /^photo_extra_(\d+)$/.exec(slot);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function getPhotoAnchor(slot: string) {
  const fixedAnchor = PHOTO_ANCHORS[slot];
  if (fixedAnchor) return fixedAnchor;

  const n = extraPhotoNumber(slot);
  if (!n) return null;
  return {
    sheet: "PHOTOS OI",
    col: n % 2 === 1 ? 0 : 4,
    row: 37 + Math.floor((n - 1) / 2) * 15,
    cols: 3,
    rows: 14,
  };
}

function sortPhotoSlots(slots: string[]): string[] {
  return [...slots].sort((a, b) => {
    const extraA = extraPhotoNumber(a);
    const extraB = extraPhotoNumber(b);
    if (extraA && extraB) return extraA - extraB;
    if (extraA) return 1;
    if (extraB) return -1;
    return a.localeCompare(b);
  });
}

function fmtDateTime(v: unknown): string {
  if (v === "na" || v === "N/A") return "N/A";
  if (!v || typeof v !== "string") return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}
function fmtYesNo(v: unknown): string {
  if (v === true) return "oui";
  if (v === false) return "non";
  if (v === "na" || v === "N/A") return "N/A";
  return "";
}
function fmtYesNoNa(v: unknown): string {
  if (v === true) return "oui";
  if (v === false) return "non";
  if (v === "na" || v === "N/A") return "N/A";
  return "";
}
function fmtNumberNA(v: unknown): string {
  if (v === "na" || v === "N/A") return "N/A";
  if (typeof v === "number") return String(v);
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return "";
}
// Pour les lignes type "A8 / A9" où B et C contiennent déjà les libellés "oui" / "non" :
// on écrit la valeur sélectionnée dans B et on efface C pour ne garder qu'un choix.
function fmtRadioOuiNon(v: unknown): string {
  if (v === true) return "☒ oui   ☐ non";
  if (v === false) return "☐ oui   ☒ non";
  if (v === "na" || v === "N/A") return "N/A";
  return "";
}
function fmtDefautLocalise(v: unknown, cri: CriRecord): string {
  if (!v) return "";
  if (v === "Autre") {
    const a = cri.values?.defautLocaliseAutre as string | undefined;
    return a ? `Autre : ${a}` : "Autre";
  }
  return String(v);
}
function fmtCause(v: unknown, cri: CriRecord): string {
  if (!v) return "";
  if (v === "Autre") {
    const a = cri.values?.causePrincipaleAutre as string | undefined;
    return a ? `Autre : ${a}` : "Autre";
  }
  return String(v);
}

function fmtCleanText(v: unknown): string {
  return cleanGeoText(String(v ?? ""));
}

function cleanGeoText(text: string): string {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => {
      const n = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return !/villefr.nche[\s-]*(de[\s-]*)?rouergue/.test(n);
    })
    .join(", ");
}

async function loadTemplate(): Promise<ArrayBuffer> {
  const resp = await fetch("/cri_blo_template.xlsx");
  if (!resp.ok) throw new Error("Template Excel introuvable");
  return await resp.arrayBuffer();
}

export async function buildXlsxExport(cri: CriRecord): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const buf = await loadTemplate();
  await wb.xlsx.load(buf);

  const fiche = wb.getWorksheet("FICHE SAV BLO");

  // A4 : "Entreprise, nom et contact" — combine company + technicianName
  const company = (cri.values?.company as string) ?? cri.technician.company ?? "";
  const lastName = (cri.values?.technicianName as string) ?? cri.technician.lastName ?? "";
  const a4 = [company, lastName].filter(Boolean).join(" — ");
  if (fiche && a4) fiche.getCell("B4").value = a4;

  // Localisation : champs officiels (A12 commune, F12 CP, A13 voie, A14 numéro).
  // Les valeurs saisies par le technicien ont priorité sur l'adresse géocodée.
  if (fiche) {
    const commune = (cri.values?.commune as string) || cri.address.commune;
    const cp = (cri.values?.codePostal as string) || cri.address.postalCode;
    const voie = (cri.values?.nomVoie as string) || cri.address.street;
    const num = (cri.values?.numeroVoie as string) || cri.address.streetNumber;
    if (commune) fiche.getCell("B12").value = commune;
    if (cp) fiche.getCell("H12").value = cp;
    if (voie) fiche.getCell("B13").value = voie;
    if (num) fiche.getCell("B14").value = num;

    ["A17", "F17", "A20", "F20", "A22", "F22", "A24", "F24"].forEach((cell) => {
      fiche.getCell(cell).alignment = { wrapText: true, vertical: "middle", horizontal: "left" };
    });
    // Laisser les lignes 17 et 20 grandir pour afficher l'adresse complète
    fiche.getRow(17).height = 32;
    fiche.getRow(20).height = 22;

    // Si GPS A non fourni, utiliser la position capturée
    if (!cri.values?.gpsCoordsA && cri.gps) {
      fiche.getCell("A20").value = `${cri.gps.latitude.toFixed(6)}, ${cri.gps.longitude.toFixed(6)}`;
    }

    // Lignes radios oui/non : effacer la case opposée si une valeur est saisie
    if (cri.values?.clientProvisoire === true || cri.values?.clientProvisoire === false) {
      fiche.getCell("C8").value = null;
    }
    if (cri.values?.dommageReseau === true || cri.values?.dommageReseau === false) {
      fiche.getCell("C9").value = null;
    }
  }

  // Champs simples
  for (const [fieldId, map] of Object.entries(FIELD_CELLS)) {
    const ws = wb.getWorksheet(map.sheet);
    if (!ws) continue;
    const raw = cri.values?.[fieldId];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = map.format ? map.format(raw, cri) : String(raw);
    ws.getCell(map.cell).value = value;
  }

  // Photos
  for (const slot of sortPhotoSlots(Object.keys(cri.photos ?? {}))) {
    if (!cri.photos?.[slot]) continue;
    const anchor = getPhotoAnchor(slot);
    if (!anchor) continue;
    const stored = await getPhoto(cri.id, slot);
    if (!stored) continue;
    const ws = wb.getWorksheet(anchor.sheet);
    if (!ws) continue;
    const bufImg = await stored.blob.arrayBuffer();
    const ext = stored.blob.type.includes("png") ? "png" : "jpeg";
    const imgId = wb.addImage({ buffer: bufImg, extension: ext as "png" | "jpeg" });
    ws.addImage(imgId, {
      tl: { col: anchor.col, row: anchor.row } as ExcelJS.ImageRange["tl"],
      br: { col: anchor.col + anchor.cols, row: anchor.row + anchor.rows } as ExcelJS.ImageRange["br"],
      editAs: "oneCell",
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
