import type { CriRecord } from "@/lib/cri/types";
import { cleanAddressText } from "@/lib/geo/address-format";

export interface CellMap {
  sheet: string;
  cell: string;
  format?: (value: unknown, cri: CriRecord) => string;
}

export interface PhotoAnchor {
  sheet: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
}

function fmtDateTime(value: unknown): string {
  if (value === "na" || value === "N/A") return "N/A";
  if (!value || typeof value !== "string") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function fmtYesNo(value: unknown): string {
  if (value === true) return "oui";
  if (value === false) return "non";
  if (value === "na" || value === "N/A") return "N/A";
  return "";
}

function fmtNumberNA(value: unknown): string {
  if (value === "na" || value === "N/A") return "N/A";
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return "";
}

function fmtRadioOuiNon(value: unknown): string {
  if (value === true) return "☒ oui   ☐ non";
  if (value === false) return "☐ oui   ☒ non";
  if (value === "na" || value === "N/A") return "N/A";
  return "";
}

function fmtDefautLocalise(value: unknown, cri: CriRecord): string {
  if (!value) return "";
  if (value === "Autre") {
    const other = cri.values?.defautLocaliseAutre as string | undefined;
    return other ? `Autre : ${other}` : "Autre";
  }
  return String(value);
}

function fmtCause(value: unknown, cri: CriRecord): string {
  if (!value) return "";
  if (value === "Autre") {
    const other = cri.values?.causePrincipaleAutre as string | undefined;
    return other ? `Autre : ${other}` : "Autre";
  }
  return String(value);
}

function fmtCleanText(value: unknown): string {
  return cleanAddressText(String(value ?? ""));
}

export const FIELD_CELLS: Record<string, CellMap> = {
  interventionStart: { sheet: "FICHE SAV BLO", cell: "B3", format: fmtDateTime },
  interventionEnd: { sheet: "FICHE SAV BLO", cell: "E3", format: fmtDateTime },
  siteAccessContact: { sheet: "FICHE SAV BLO", cell: "B5" },
  referenceOrange: { sheet: "FICHE SAV BLO", cell: "B6" },
  centre: { sheet: "FICHE SAV BLO", cell: "E6" },
  zone: { sheet: "FICHE SAV BLO", cell: "H6" },
  ripZone: { sheet: "FICHE SAV BLO", cell: "B7" },
  oiOc: { sheet: "FICHE SAV BLO", cell: "E7" },
  nbLiaisonsGTR: { sheet: "FICHE SAV BLO", cell: "H7", format: fmtNumberNA },
  clientProvisoire: { sheet: "FICHE SAV BLO", cell: "B8", format: fmtRadioOuiNon },
  nomValideur: { sheet: "FICHE SAV BLO", cell: "F8" },
  dommageReseau: { sheet: "FICHE SAV BLO", cell: "B9", format: fmtRadioOuiNon },
  constatNum: { sheet: "FICHE SAV BLO", cell: "F9" },
  longueur: { sheet: "FICHE SAV BLO", cell: "E15", format: fmtNumberNA },
  adresseA: { sheet: "FICHE SAV BLO", cell: "A17", format: fmtCleanText },
  adresseB: { sheet: "FICHE SAV BLO", cell: "F17", format: fmtCleanText },
  gpsCoordsA: { sheet: "FICHE SAV BLO", cell: "A20" },
  gpsCoordsB: { sheet: "FICHE SAV BLO", cell: "F20" },
  chambrePoteauA: { sheet: "FICHE SAV BLO", cell: "A22" },
  chambrePoteauB: { sheet: "FICHE SAV BLO", cell: "F22" },
  distanceDefautA: { sheet: "FICHE SAV BLO", cell: "A24", format: fmtNumberNA },
  distanceDefautB: { sheet: "FICHE SAV BLO", cell: "F24", format: fmtNumberNA },
  defautLocalise: { sheet: "FICHE SAV BLO", cell: "B26", format: fmtDefautLocalise },
  referenceContenant: { sheet: "FICHE SAV BLO", cell: "B27" },
  causePrincipale: { sheet: "FICHE SAV BLO", cell: "B28", format: fmtCause },
  numTroncon: { sheet: "FICHE SAV BLO", cell: "B30" },
  transportDistribution: { sheet: "FICHE SAV BLO", cell: "E30" },
  typeCable: { sheet: "FICHE SAV BLO", cell: "B31" },
  longueurCable: { sheet: "FICHE SAV BLO", cell: "G31", format: fmtNumberNA },
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
  descriptionTravaux: { sheet: "FICHE SAV BLO", cell: "A41" },
  majIPON: { sheet: "FICHE SAV BLO", cell: "B45", format: fmtYesNo },
  majOPTIMUM: { sheet: "FICHE SAV BLO", cell: "E45", format: fmtYesNo },
  majGeofibre: { sheet: "FICHE SAV BLO", cell: "D46", format: fmtYesNo },
  testAGIR: { sheet: "FICHE SAV BLO", cell: "B49", format: fmtYesNo },
  numDecharge: { sheet: "FICHE SAV BLO", cell: "D49" },
  commentaires: { sheet: "FICHE SAV BLO", cell: "A52" },
  rdsurFacture: { sheet: "RDSUR", cell: "A3", format: fmtYesNo },
};

const PHOTO_ANCHORS: Record<string, PhotoAnchor> = {
  photo_oi_situation: { sheet: "PHOTOS OI", col: 0, row: 2, cols: 3, rows: 15 },
  photo_oi_etiquette: { sheet: "PHOTOS OI", col: 4, row: 2, cols: 3, rows: 15 },
  photo_oi_avant: { sheet: "PHOTOS OI", col: 0, row: 20, cols: 3, rows: 15 },
  photo_oi_apres: { sheet: "PHOTOS OI", col: 4, row: 20, cols: 3, rows: 15 },
  photo_oc_defaut: { sheet: "PHOTOS OC", col: 0, row: 2, cols: 3, rows: 15 },
  photo_oc_apres_def: { sheet: "PHOTOS OC", col: 4, row: 2, cols: 3, rows: 15 },
  photo_oc_avant: { sheet: "PHOTOS OC", col: 0, row: 20, cols: 3, rows: 15 },
  photo_oc_apres: { sheet: "PHOTOS OC", col: 4, row: 20, cols: 3, rows: 15 },
  photo_oc_mesure1: { sheet: "PHOTOS OC", col: 0, row: 37, cols: 3, rows: 14 },
  photo_oc_mesure2: { sheet: "PHOTOS OC", col: 4, row: 37, cols: 3, rows: 14 },
  photo_mesures_loc1: { sheet: "MESURES", col: 0, row: 4, cols: 6, rows: 8 },
  photo_mesures_loc2: { sheet: "MESURES", col: 6, row: 4, cols: 6, rows: 8 },
  photo_rdsur_avant: { sheet: "RDSUR", col: 1, row: 4, cols: 4, rows: 14 },
  photo_rdsur_apres: { sheet: "RDSUR", col: 5, row: 4, cols: 4, rows: 14 },
  photo_plan: { sheet: "PLAN", col: 0, row: 1, cols: 7, rows: 20 },
};

export function extraPhotoNumber(slot: string): number | null {
  const match = /^photo_extra_(\d+)$/.exec(slot);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function getPhotoAnchor(slot: string): PhotoAnchor | null {
  const fixed = PHOTO_ANCHORS[slot];
  if (fixed) return fixed;
  const number = extraPhotoNumber(slot);
  if (!number) return null;
  return {
    sheet: "PHOTOS OI",
    col: number % 2 === 1 ? 0 : 4,
    row: 37 + Math.floor((number - 1) / 2) * 15,
    cols: 3,
    rows: 14,
  };
}

export function sortPhotoSlots(slots: string[]): string[] {
  return [...slots].sort((a, b) => {
    const extraA = extraPhotoNumber(a);
    const extraB = extraPhotoNumber(b);
    if (extraA && extraB) return extraA - extraB;
    if (extraA) return 1;
    if (extraB) return -1;
    return a.localeCompare(b);
  });
}
