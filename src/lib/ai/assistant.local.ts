// Moteur LOCAL de l'assistant autonome (hors-ligne, sans modèle de langage).
//
// Objectif : produire un vrai texte télécom à partir d'une note brute, même
// sans clé API et sans réseau. Il ne fait que reformuler et structurer ce que
// le technicien a écrit : aucune information n'est inventée.
//
// Ce module est indépendant du module CRI BLO : il ne remplace pas
// `composeOfflineComment` (utilisé par l'assistant intégré au CRI) et ne
// modifie pas son comportement.

import { KEEP_UPPER, TERMS } from "@/lib/ai/glossary";

export type LocalTone = "professional" | "simple" | "email" | "explain" | "translate";
export type LocalLang = "fr" | "en" | "sq";

export interface LocalResult {
  text: string;
  /** Vrai quand le texte est une traduction approximative produite hors-ligne. */
  approximate: boolean;
}

/** Formes fléchies et mots fréquents absents du dictionnaire de base. */
const EXTRA_TERMS: Record<string, string> = {
  // albanais — formes définies / accusatif / participes
  kabllin: "câble",
  kabllit: "câble",
  kabllot: "câbles",
  ne: "dans",
  në: "dans",
  te: "à",
  tek: "à",
  midis: "entre",
  dhe: "et",
  me: "avec",
  mbi: "sur",
  para: "avant",
  pas: "après",
  "prerë": "coupé",
  preu: "coupé",
  "prerje": "coupure",
  "dëmtuar": "endommagé",
  demtuar: "endommagé",
  "dëmtim": "endommagement",
  riparuar: "réparé",
  "zëvendësuar": "remplacé",
  zevendesuar: "remplacé",
  salduar: "soudé",
  kontrolluar: "contrôlé",
  testuar: "testé",
  instaluar: "installé",
  pastruar: "nettoyé",
  mungon: "absent",
  mbyllur: "fermé",
  hapur: "ouvert",
  fibra: "fibre",
  fibër: "fibre",
  // anglais — formes utiles
  optical: "optique",
  optic: "optique",
  cut: "coupé",
  cuts: "coupures",
  damaged: "endommagé",
  repaired: "réparé",
  replaced: "remplacé",
  welded: "soudé",
  installed: "installé",
  checked: "contrôlé",
  tested: "testé",
  missing: "absent",
  between: "entre",
  with: "avec",
  without: "sans",
  from: "de",
  to: "à",
  in: "dans",
  on: "sur",
  at: "à",
  and: "et",
  the: "",
  a: "",
};

const WORD_FIXES: Array<[RegExp, string]> = [
  [/\bacces\b/gi, "accès"],
  [/\bcable\b/gi, "câble"],
  [/\bcables\b/gi, "câbles"],
  [/\bboitier\b/gi, "boîtier"],
  [/\bdefaut\b/gi, "défaut"],
  [/\bpenne\b/gi, "panne"],
  [/\bepissure\b/gi, "épissure"],
  [/\bepissures\b/gi, "épissures"],
  [/(\d+)\s?fo\b/gi, "$1 FO"],
  // PB12 → PB 12, 35m → 35 m (lisibilité, aucune donnée modifiée)
  [/\b(PB|PM|PEP|PEO|PTO|NRO|BTI|D3|PMI)(\d)/g, "$1 $2"],
  [/(\d)\s?(km|m)\b/gi, "$1 $2"],
  [/\bdans\s+(PB|PM|NRO|PTO|PEO)\s+(\d+)/g, "au $1 $2"],
];

const PHRASE_FIXES: Array<[RegExp, string]> = [
  [/\bc[âa]ble\s+coup(e|é|er)\b/gi, "câble coupé"],
  [/\bc[âa]ble\s+endommage\b/gi, "câble endommagé"],
  [/\b(soudure|épissure|saldim)\s+(\d+)\b/gi, "$2 soudures"],
];

/** « Réparé câble » → « câble réparé » (accord masculin / féminin). */
function fixParticipleOrder(text: string): string {
  return text
    .replace(
      /\b(réparé|remplacé|posé|nettoyé|testé|contrôlé|installé)\s+(c[âa]ble|boîtier|pb|nro|pto|peo|chambre|appui|coupleur|fourreau)\b/gi,
      (_m, verb: string, noun: string) => `${noun} ${verb.toLowerCase()}`,
    )
    .replace(
      /\b(réparé|remplacé|posé|nettoyé|testé|contrôlé|installé)\s+(fibre|jarretière|cassette|gaine)\b/gi,
      (_m, verb: string, noun: string) => `${noun} ${verb.toLowerCase()}e`,
    );
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function squash(value: string): string {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function translateWord(word: string): string {
  if (!word) return word;
  if (/\d/.test(word)) {
    // PB12 / NRO0021 : on remonte le sigle, on ne touche pas au numéro.
    const sigle = /^([A-Za-z]{2,4})(\d.*)$/.exec(word);
    if (sigle && KEEP_UPPER.has(sigle[1].toUpperCase())) {
      return sigle[1].toUpperCase() + sigle[2];
    }
    return word;
  }
  const upper = word.toUpperCase();
  if (KEEP_UPPER.has(upper)) return upper;
  const key = stripAccents(word.toLowerCase());
  const hit = EXTRA_TERMS[key] ?? TERMS[key] ?? TERMS[word.toLowerCase()];
  return hit ?? word;
}

/** Traduit les mots connus vers le français, en conservant la ponctuation. */
export function translateToFrench(text: string): string {
  return text
    .replace(/\bfiber[\s-]*optic\b/gi, "fibre optique")
    .replace(/\boptical\s+fiber\b/gi, "fibre optique")
    .replace(/[\p{L}]+/gu, (word) => translateWord(word))
    .replace(/[ \t]{2,}/g, " ");
}

function capitalizeSentences(value: string): string {
  return value.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_m, prefix: string, letter: string) =>
    prefix + letter.toUpperCase(),
  );
}

/** Remet le texte en français propre : accents, majuscules, ponctuation. */
export function tidyFrench(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  for (const [re, to] of WORD_FIXES) out = out.replace(re, to);
  for (const [re, to] of PHRASE_FIXES) out = out.replace(re, to);
  out = fixParticipleOrder(out);
  out = capitalizeSentences(out);
  if (out && !/[.!?]$/.test(out)) out += ".";
  return out;
}

interface Facts {
  refs: string[];
  fiber: string | null;
  distance: string | null;
  soudures: string | null;
}

function extractFacts(raw: string): Facts {
  const refs = [
    ...raw.matchAll(
      /\b(PB|PM|PEP|PEO|PTO|NRO|BTI|D3|PMI)\s*n?[°o]?\s*([A-Za-z0-9][A-Za-z0-9\-/]{0,13})/gi,
    ),
  ]
    .map((m) => `${m[1].toUpperCase()} ${m[2].toUpperCase()}`)
    .filter((ref) => !/\b(FO|FIBRE|FIBRES)\b/.test(ref));

  const fiber = raw.match(/\b(\d{1,3})\s*(?:fo|fibres?|fibers?|fibra)\b/i);
  const distance = raw.match(/\b(\d+(?:[.,]\d+)?)\s*(km|m)\b/i);
  const soudures = raw.match(
    /\b(\d{1,3})\s*(?:soudures?|épissures?|epissures?|splices?|fusions?|saldime?)\b/i,
  );

  return {
    refs: [...new Set(refs)],
    fiber: fiber ? `${fiber[1]} FO` : null,
    distance: distance ? `${distance[1].replace(",", ".")} ${distance[2].toLowerCase()}` : null,
    soudures: soudures ? `${soudures[1]} soudures` : null,
  };
}

function splitSentences(text: string): string[] {
  // Coupe après un point/exclamation/interrogation suivi d'un espace :
  // « 1.2 km » et les décimales restent intacts.
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Ajoute les informations certaines qui ne figurent pas déjà dans le texte. */
function extraFacts(body: string, raw: string): string[] {
  const facts = extractFacts(raw);
  const has = (value: string) => squash(body).includes(squash(value));
  const out: string[] = [];
  const missingRefs = facts.refs.filter((ref) => !has(ref));
  if (missingRefs.length) out.push(`Point(s) concerné(s) : ${missingRefs.join(", ")}.`);
  if (facts.fiber && !has(facts.fiber)) out.push(`Câble : ${facts.fiber}.`);
  if (facts.distance && !has(facts.distance)) out.push(`Distance : ${facts.distance}.`);
  if (facts.soudures && !has(facts.soudures)) out.push(`Soudures : ${facts.soudures}.`);
  return out;
}

function composeBody(fr: string, tone: "professional" | "simple", raw: string): string {
  const sentences = splitSentences(fr);
  if (!sentences.length) return "";
  if (tone === "simple") return sentences.slice(0, 2).join(" ");
  return [sentences.join(" "), ...extraFacts(fr, raw)].join(" ").trim();
}

function composeEmail(fr: string, raw: string): string {
  const facts = extractFacts(raw);
  const subject = facts.refs.length
    ? `Objet : Compte-rendu d'intervention — ${facts.refs[0]}`
    : "Objet : Compte-rendu d'intervention";
  return `${subject}\n\nBonjour,\n\n${fr}\n\nCordialement.`;
}

function composeExplain(fr: string): string {
  const sentences = splitSentences(fr);
  const short = sentences.length > 3 ? sentences.slice(0, 3).join(" ") : fr;
  return `En clair : ${short}`;
}

const EN: Record<string, string> = {
  câble: "cable",
  cables: "cables",
  câbles: "cables",
  fibre: "fiber",
  fibres: "fibers",
  coupé: "cut",
  coupée: "cut",
  coupure: "cut",
  coupures: "cuts",
  endommagé: "damaged",
  réparé: "repaired",
  réparée: "repaired",
  réparation: "repair",
  remplacé: "replaced",
  remplacée: "replaced",
  remplacement: "replacement",
  posée: "installed",
  nettoyée: "cleaned",
  testée: "tested",
  contrôlée: "checked",
  installée: "installed",
  soudure: "splice",
  soudures: "splices",
  épissure: "splice",
  épissures: "splices",
  boîtier: "enclosure",
  chambre: "chamber",
  appui: "pole",
  poteau: "pole",
  fourreau: "duct",
  gaine: "sheath",
  jarretière: "jumper",
  coupleur: "splitter",
  client: "customer",
  accès: "access",
  absent: "absent",
  impossible: "impossible",
  mesure: "measurement",
  mesures: "measurements",
  distance: "distance",
  longueur: "length",
  défaut: "fault",
  réseau: "network",
  contrôle: "check",
  contrôlé: "checked",
  testé: "tested",
  nettoyé: "cleaned",
  nettoyage: "cleaning",
  installé: "installed",
  posé: "installed",
  dans: "in",
  entre: "between",
  et: "and",
  avec: "with",
  sans: "without",
  sur: "on",
  au: "at",
  à: "to",
  avant: "before",
  après: "after",
  neuf: "new",
  vétuste: "old",
  conforme: "compliant",
  intervention: "intervention",
  travaux: "works",
  ouvert: "open",
  fermé: "closed",
};

const SQ: Record<string, string> = {
  câble: "kabllo",
  câbles: "kabllo",
  cables: "kabllo",
  fibre: "fibër",
  fibres: "fibra",
  coupé: "prerë",
  coupée: "prerë",
  coupure: "prerje",
  coupures: "prerje",
  endommagé: "dëmtuar",
  réparé: "riparuar",
  réparée: "riparuar",
  réparation: "riparim",
  remplacé: "zëvendësuar",
  remplacée: "zëvendësuar",
  remplacement: "zëvendësim",
  posée: "vendosur",
  nettoyée: "pastruar",
  testée: "testuar",
  contrôlée: "kontrolluar",
  installée: "instaluar",
  soudure: "saldim",
  soudures: "saldime",
  épissure: "saldim",
  épissures: "saldime",
  boîtier: "kuti",
  jarretière: "jarretierë",
  coupleur: "splitter",
  client: "klient",
  accès: "hyrje",
  absent: "mungon",
  mesure: "matje",
  mesures: "matje",
  distance: "distancë",
  longueur: "gjatësi",
  défaut: "defekt",
  réseau: "rrjet",
  contrôle: "kontroll",
  contrôlé: "kontrolluar",
  testé: "testuar",
  nettoyé: "pastruar",
  installé: "instaluar",
  posé: "vendosur",
  dans: "në",
  entre: "midis",
  et: "dhe",
  avec: "me",
  sans: "pa",
  sur: "mbi",
  à: "në",
  avant: "para",
  après: "pas",
  neuf: "i ri",
  ouvert: "hapur",
  fermé: "mbyllur",
  intervention: "ndërhyrje",
  travaux: "punime",
};

/** Traduction approximative hors-ligne (FR → EN / SQ), pour les notes courtes. */
export function roughTranslate(fr: string, lang: Exclude<LocalLang, "fr">): string {
  const dict = lang === "en" ? EN : SQ;
  const out = fr.replace(/[\p{L}]+/gu, (word) => {
    if (KEEP_UPPER.has(word.toUpperCase())) return word.toUpperCase();
    const key = stripAccents(word.toLowerCase());
    const hit = dict[key] ?? dict[word.toLowerCase()];
    if (!hit) return word;
    return /^\p{Lu}/u.test(word) ? hit.charAt(0).toUpperCase() + hit.slice(1) : hit;
  });
  const cleaned = capitalizeSentences(out);
  return cleaned && !/[.!?]$/.test(cleaned) ? `${cleaned}.` : cleaned;
}

/**
 * Rédaction locale complète pour l'assistant autonome.
 * `tone` suit les objectifs de l'écran ; `outputLang` la langue de sortie.
 */
export function composeLocalAssistant(
  notes: string,
  tone: LocalTone,
  outputLang: LocalLang,
): LocalResult {
  const raw = notes.trim();
  if (!raw) return { text: "", approximate: false };

  const fr = tidyFrench(translateToFrench(raw));
  if (!fr) return { text: "", approximate: false };

  const localized = outputLang !== "fr";
  const body =
    tone === "email"
      ? composeEmail(fr, raw)
      : tone === "explain"
        ? composeExplain(fr)
        : tone === "translate"
          ? fr
          : composeBody(fr, tone, raw);

  if (!localized) return { text: body, approximate: false };
  return { text: roughTranslate(body, outputLang), approximate: true };
}
