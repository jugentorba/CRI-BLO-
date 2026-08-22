// Moteur HORS-LIGNE de rédaction de commentaires CRI BLO.
// Traduit / normalise des notes rapides (français, anglais, albanais, mots simples)
// en français technique télécom Orange.
//
// RÈGLE ABSOLUE : ne JAMAIS inventer d'information. Le moteur ne fait que
// réorganiser, traduire et normaliser ce que le technicien a écrit.

export type CommentStyle = "simple" | "professional" | "detailed";

export interface CommentContext {
  reference?: string;
  commune?: string;
  typeCable?: string;
  referenceContenant?: string;
  defautLocalise?: string;
  causePrincipale?: string;
  longueurCable?: string | number;
  interventionStart?: string;
}

/** Traductions mot-à-mot (anglais / albanais / abréviations → français télécom). */
const TERMS: Record<string, string> = {
  // actions
  repair: "réparation",
  repaired: "réparé",
  fix: "réparation",
  fixed: "réparé",
  riparim: "réparation",
  riparova: "réparé",
  rregullova: "réparé",
  ndreqa: "réparé",
  replace: "remplacement",
  replaced: "remplacé",
  zevendesova: "remplacé",
  ndryshova: "remplacé",
  change: "remplacement",
  changed: "remplacé",
  install: "pose",
  installed: "posé",
  vendosa: "posé",
  montova: "posé",
  splice: "épissure",
  splices: "épissures",
  splicing: "épissurage",
  fusion: "soudure",
  fusions: "soudures",
  weld: "soudure",
  welds: "soudures",
  saldim: "soudure",
  saldime: "soudures",
  cut: "coupure",
  broken: "coupé",
  break: "coupure",
  prerje: "coupure",
  prere: "coupé",
  damaged: "endommagé",
  damage: "endommagement",
  demtuar: "endommagé",
  demtim: "endommagement",
  clean: "nettoyage",
  cleaned: "nettoyé",
  pastrova: "nettoyé",
  test: "test",
  tested: "testé",
  testova: "testé",
  measure: "mesure",
  measured: "mesuré",
  matje: "mesure",
  check: "contrôle",
  checked: "contrôlé",
  kontrollova: "contrôlé",
  found: "constaté",
  find: "constat",
  gjeta: "constaté",
  open: "ouverture",
  opened: "ouvert",
  hapa: "ouvert",
  close: "fermeture",
  closed: "fermé",
  mbylla: "fermé",
  pulled: "tiré",
  pull: "tirage",
  terjek: "tirage",

  // matériel / réseau
  cable: "câble",
  cables: "câbles",
  kabll: "câble",
  kablli: "câble",
  kabllo: "câble",
  fiber: "fibre",
  fibers: "fibres",
  fibre: "fibre",
  fiber_optic: "fibre optique",
  fibra: "fibre",
  chamber: "chambre",
  manhole: "chambre",
  pole: "appui",
  poles: "appuis",
  shtylla: "appui",
  shtyllë: "appui",
  duct: "fourreau",
  ducts: "fourreaux",
  tube: "tube",
  box: "boîtier",
  closure: "boîtier",
  kuti: "boîtier",
  connector: "connecteur",
  coupler: "coupleur",
  couplers: "coupleurs",
  splitter: "coupleur",
  jumper: "jarretière",
  jumpers: "jarretières",
  patchcord: "jarretière",
  cassette: "cassette",
  tray: "cassette",
  sheath: "gaine",
  gaine: "gaine",
  water: "eau",
  uje: "eau",
  ujë: "eau",
  rodent: "rongeur",
  rodents: "rongeurs",
  vandalism: "vandalisme",
  works: "travaux",
  work: "travaux",
  punime: "travaux",
  pune: "travaux",
  client: "client",
  clients: "clients",
  customer: "client",
  customers: "clients",
  klient: "client",
  klienti: "client",
  network: "réseau",
  rrjet: "réseau",
  rrjeti: "réseau",
  street: "rue",
  rruga: "rue",
  rrugë: "rue",
  road: "voie",
  building: "immeuble",
  ndertesa: "immeuble",
  basement: "sous-sol",
  riser: "colonne montante",
  loss: "affaiblissement",
  attenuation: "affaiblissement",
  reflection: "réflexion",
  power: "puissance",
  signal: "signal",
  fault: "défaut",
  defekt: "défaut",
  defekti: "défaut",
  problem: "problème",
  problemi: "problème",

  // divers
  before: "avant",
  after: "après",
  para: "avant",
  pas: "après",
  from: "de",
  nga: "de",
  to: "à",
  deri: "jusqu'à",
  distance: "distance",
  distanca: "distance",
  meters: "m",
  meter: "m",
  metra: "m",
  metër: "m",
  ok: "conforme",
  good: "conforme",
  mire: "conforme",
  mirë: "conforme",
  bad: "non conforme",
  keq: "non conforme",
  new: "neuf",
  old: "vétuste",
  vjeter: "vétuste",
  night: "de nuit",
  rain: "pluie",
  shi: "pluie",
  traffic: "circulation",
  access: "accès",
  hyrje: "accès",
  key: "clé",
  permission: "autorisation",
};

/** Abréviations métier laissées telles quelles (jamais traduites). */
const KEEP_UPPER = new Set([
  "PB", "PM", "PMZ", "PEP", "PEO", "PTO", "NRO", "BTI", "BE", "OI", "OC", "RIP",
  "AMI", "AMII", "GTR", "OTDR", "SOR", "FO", "D3", "APPUI", "IPON", "OPTIMUM",
  "AGIR", "RDSUR", "NBSOUD", "NBJRT", "CAPA", "CC", "NBCPL", "NBOC", "INGE",
  "PA", "PE", "PMI", "SAV", "CRI", "BLO", "TDR", "GPS",
]);

const TYPE_INTERVENTION: { re: RegExp; label: string }[] = [
  { re: /(soud|splic|fusion|epissur|épissur|saldim)/i, label: "réfection d'épissures" },
  { re: /(remplac|replace|zevendes|ndryshov|change)/i, label: "remplacement de câble / matériel" },
  { re: /(coupur|coupé|coupe|cut|prerj|prere|break|broken)/i, label: "réparation de câble coupé" },
  { re: /(coupleur|splitter|cpl)/i, label: "remplacement de coupleur" },
  { re: /(jarreti|jumper|patchcord|jrt)/i, label: "reprise de jarretières" },
  { re: /(nettoy|pastr|clean)/i, label: "nettoyage / reprise de connectique" },
  { re: /(mesur|otdr|sor|matje|measure)/i, label: "mesures optiques" },
  { re: /(pto|prise|client)/i, label: "intervention côté client" },
];

function normalizeToken(raw: string): string {
  const bare = raw.replace(/[^\p{L}\p{N}°'’\-/.]/gu, "");
  if (!bare) return raw;
  if (KEEP_UPPER.has(bare.toUpperCase())) return bare.toUpperCase();
  if (/\d/.test(bare)) return bare; // références / mesures : jamais modifiées
  const key = bare
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const hit = TERMS[key] ?? TERMS[bare.toLowerCase()];
  return hit ?? raw;
}

/** Traduit les mots reconnus, conserve tout le reste à l'identique. */
export function translateNotes(notes: string): string {
  return notes
    .split(/(\s+)/)
    .map((chunk) => (/^\s+$/.test(chunk) ? chunk : normalizeToken(chunk)))
    .join("");
}

function capitalize(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function sentence(s: string): string {
  const t = capitalize(s.trim().replace(/\s+/g, " "));
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : t + ".";
}

interface Extracted {
  distances: string[];
  fibers: string[];
  soudures: string[];
  fromTo: string | null;
  refs: string[];
  type: string | null;
}

function extract(text: string): Extracted {
  const distances: string[] = [];
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(km|m|metre|mètre|meters?|metra|metër)\b/gi)) {
    const unit = /km/i.test(m[2]) ? "km" : "m";
    distances.push(`${m[1].replace(",", ".")} ${unit}`);
  }
  const fibers: string[] = [];
  for (const m of text.matchAll(/(\d+)\s*(fo|fibres?|fibers?|fibra)\b/gi)) fibers.push(`${m[1]} FO`);
  const soudures: string[] = [];
  for (const m of text.matchAll(
    /(\d+)\s*(soudures?|epissures?|épissures?|splices?|fusions?|saldime?)\b/gi,
  ))
    soudures.push(m[1]);
  const ftMatch = text.match(
    /\b(?:de|from|nga|depuis)\s+([\p{L}\p{N}°'’\-/. ]{2,28}?)\s+(?:jusqu'?à|à|a|to|deri(?:\s+ne|\s+në)?|vers)\s+([\p{L}\p{N}°'’\-/. ]{2,28})/iu,
  );
  const refs: string[] = [];
  for (const m of text.matchAll(/\b(PB|PM|PEP|PEO|PTO|NRO|BTI|D3|PMI)\s*n?[°o]?\s*([A-Z0-9\-/]{1,14})/gi))
    refs.push(`${m[1].toUpperCase()}${m[2] ? " " + m[2].toUpperCase() : ""}`.trim());
  const type = TYPE_INTERVENTION.find((t) => t.re.test(text))?.label ?? null;
  return {
    distances: [...new Set(distances)],
    fibers: [...new Set(fibers)],
    soudures: [...new Set(soudures)],
    fromTo: ftMatch ? `${ftMatch[1].trim()} → ${ftMatch[2].trim()}` : null,
    refs: [...new Set(refs)],
    type,
  };
}

/**
 * Rédaction hors-ligne. Fonctionne sans réseau, sans modèle : dictionnaire
 * télécom + extraction de motifs + patrons appris localement.
 */
export function composeOfflineComment(
  notes: string,
  style: CommentStyle,
  ctx: CommentContext = {},
): string {
  const raw = notes.trim();
  if (!raw) return "";
  const fr = translateNotes(raw);
  const ex = extract(fr);

  const body = fr
    .split(/\r?\n|[.;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sentence);

  if (style === "simple") {
    const head = ex.type ? capitalize(ex.type) : null;
    const bits = [head, ex.fromTo ? `${ex.fromTo}` : null, ex.distances[0] ?? null].filter(
      Boolean,
    ) as string[];
    const lead = bits.length ? sentence(bits.join(" — ")) : "";
    return [lead, body.join(" ")].filter(Boolean).join(" ").trim();
  }

  const lines: string[] = [];
  if (style === "detailed") {
    if (ctx.reference) lines.push(`Intervention réf. ${ctx.reference}${ctx.commune ? ` — ${ctx.commune}` : ""}.`);
    else if (ctx.commune) lines.push(`Intervention sur la commune de ${ctx.commune}.`);
  }
  if (ex.type) lines.push(`Type d'intervention : ${ex.type}.`);
  if (ex.refs.length) lines.push(`Point(s) concerné(s) : ${ex.refs.join(", ")}.`);
  else if (ctx.referenceContenant) lines.push(`Point concerné : ${ctx.referenceContenant}.`);
  if (ex.fibers.length || ctx.typeCable)
    lines.push(`Câble : ${[...ex.fibers, ctx.typeCable].filter(Boolean).join(" ")}.`);
  if (ex.fromTo) lines.push(`Tronçon : ${ex.fromTo}.`);
  if (ex.distances.length) lines.push(`Distance / longueur : ${ex.distances.join(", ")}.`);
  if (ex.soudures.length) lines.push(`Soudures réalisées : ${ex.soudures.join(", ")}.`);
  lines.push(`Constat et travaux : ${body.join(" ")}`);
  if (style === "detailed" && ctx.causePrincipale)
    lines.push(`Cause retenue : ${ctx.causePrincipale}.`);

  return lines.join("\n").trim();
}

/** Prompt système partagé avec l'IA en ligne. */
export const SYSTEM_PROMPT = [
  "Tu es assistant de rédaction pour des techniciens fibre optique travaillant en sous-traitance Orange France (CRI BLO / SAV BLO).",
  "Tu reçois des notes brutes rédigées en français, anglais, albanais ou en mots-clés.",
  "Tu les reformules en français technique clair, sobre et professionnel, avec le vocabulaire télécom Orange (câble, FO, épissure, soudure, PB, PM, PEP, PEO, PTO, NRO, BTI, coupleur, jarretière, chambre, appui, fourreau, OTDR, affaiblissement).",
  "RÈGLES STRICTES :",
  "- N'invente JAMAIS une information absente des notes ou du contexte fourni.",
  "- Ne modifie aucune valeur numérique, référence, distance ou nom de lieu.",
  "- N'exagère pas, pas d'adjectifs commerciaux, pas de conclusion inventée.",
  "- Si une information manque, ne la mentionne pas.",
  "- Réponds uniquement avec le commentaire final, sans titre ni explication.",
].join("\n");

export const STYLE_INSTRUCTIONS: Record<CommentStyle, string> = {
  simple: "Style : simple et court. Une à deux phrases maximum, l'essentiel seulement.",
  professional:
    "Style : professionnel. 2 à 4 phrases structurées, ton neutre de compte-rendu d'intervention.",
  detailed:
    "Style : détaillé. Compte-rendu structuré (type d'intervention, matériel, tronçon, distances, constat, travaux réalisés, essais) uniquement à partir des informations disponibles.",
};
