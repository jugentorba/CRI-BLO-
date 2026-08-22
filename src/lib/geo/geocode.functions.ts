import type { Address } from "@/lib/cri/types";

const UNNAMED_ROAD = "Route sans nom";

const ROAD_WORDS = [
  "allee",
  "allée",
  "autoroute",
  "avenue",
  "av",
  "boulevard",
  "bd",
  "carrefour",
  "chaussee",
  "chaussée",
  "chemin",
  "che",
  "cite",
  "cité",
  "clos",
  "corniche",
  "cours",
  "digue",
  "esplanade",
  "faubourg",
  "grand-rue",
  "impasse",
  "lotissement",
  "montee",
  "montée",
  "passage",
  "place",
  "placette",
  "pont",
  "promenade",
  "quai",
  "residence",
  "résidence",
  "rocade",
  "rond-point",
  "route",
  "rte",
  "rue",
  "ruelle",
  "sentier",
  "square",
  "traverse",
  "voie",
  "zone",
];

const ROAD_RE = new RegExp(`\\b(${ROAD_WORDS.join("|")})\\b`, "i");

/**
 * Reverse geocoding fiable terrain : Nominatim à plusieurs niveaux puis BAN.
 * Si aucune voie nommée n'est trouvée après tous les essais, on renseigne
 * explicitement "Route sans nom" au lieu de laisser le champ vide.
 */
export async function reverseGeocode(input: { data: { latitude: number; longitude: number } }): Promise<Address> {
  const { latitude, longitude } = input.data;



const candidates: Address[] = [];

// 1) Nominatim à plusieurs zooms : parfois le zoom 18 tombe sur un POI
//    ou un hameau, alors que 17/16 retrouve mieux la voie OSM.
for (const zoom of [18, 17, 16]) {
  try {
    candidates.push(await fetchNominatim(latitude, longitude, zoom));
  } catch {
    /* fallback suivant */
  }
}

// 2) BAN officielle : on teste les résultats adresse + rue et on choisit
//    le meilleur candidat contenant une vraie voie.
try {
  candidates.push(...(await fetchBAN(latitude, longitude)));
} catch {
  /* on garde les candidats déjà obtenus */
}

const addr = selectBestAddress(candidates);
if (!hasNamedRoad(addr.street)) addr.street = UNNAMED_ROAD;
if (!addr.country) addr.country = "France";

// Recompose un formatted final propre.
const line1 = [addr.streetNumber, addr.street].filter(Boolean).join(" ").trim();
const line2 = [addr.postalCode, addr.commune].filter(Boolean).join(" ").trim();
addr.formatted = [line1, line2, addr.region, addr.country].filter(Boolean).join(", ");
return addr;
}


function mergeAddress(a: Address, b: Address): Address {
  return {
    streetNumber: a.streetNumber || b.streetNumber,
    street: a.street || b.street,
    postalCode: a.postalCode || b.postalCode,
    commune: a.commune || b.commune,
    region: a.region || b.region,
    country: a.country || b.country || "France",
    formatted: a.formatted || b.formatted,
  };
}

function hasNamedRoad(street?: string): boolean {
  return Boolean(street?.trim() && street.trim().toLowerCase() !== UNNAMED_ROAD.toLowerCase());
}

function normalizeText(value?: string): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "").trim();
  return cleaned || undefined;
}

function parseStreetAndNumber(value?: string): Pick<Address, "street" | "streetNumber"> {
  const text = normalizeText(value);
  if (!text) return {};
  const withoutCountry = text.replace(/,?\s*France$/i, "");
  const segments = withoutCountry
    .split(",")
    .map((part) => normalizeText(part))
    .filter(Boolean) as string[];
  const roadSegment = segments.find((part) => ROAD_RE.test(part)) ?? (ROAD_RE.test(withoutCountry) ? withoutCountry : undefined);
  if (!roadSegment) return {};

  const withNumber = roadSegment.match(/^(\d+[a-zA-Z]?\s*(?:bis|ter|quater)?)[\s,-]+(.+)$/i);
  if (withNumber) {
    return {
      streetNumber: normalizeText(withNumber[1]),
      street: normalizeText(withNumber[2]),
    };
  }
  return { street: normalizeText(roadSegment) };
}

function normalizeNominatimAddress(body: {
  display_name?: string;
  name?: string;
  address?: Record<string, string | undefined>;
}): Address {
  const a = body.address ?? {};
  const explicitRoad = normalizeText(
    a.road ??
      a.pedestrian ??
      a.footway ??
      a.path ??
      a.cycleway ??
      a.residential ??
      a.living_street ??
      a.service ??
      a.track ??
      a.street ??
      a.bridleway ??
      a.busway,
  );
  const parsed = parseStreetAndNumber([body.name, body.display_name].filter(Boolean).join(", "));
  const commune =
    a.city ?? a.town ?? a.village ?? a.hamlet ?? a.locality ?? a.municipality;

  return {
    streetNumber: normalizeText(a.house_number) ?? parsed.streetNumber,
    street: explicitRoad ?? parsed.street,
    postalCode: normalizeText(a.postcode),
    commune: normalizeText(commune),
    region: normalizeText(a.state ?? a.region),
    country: normalizeText(a.country),
  };
}

function scoreAddress(a: Address): number {
  let score = 0;
  if (hasNamedRoad(a.street)) score += 100;
  if (a.streetNumber) score += 30;
  if (a.postalCode) score += 10;
  if (a.commune) score += 10;
  if (a.country) score += 2;
  return score;
}

function selectBestAddress(candidates: Address[]): Address {
  const ranked = [...candidates].sort((a, b) => scoreAddress(b) - scoreAddress(a));
  const best = ranked[0] ?? {};
  return ranked.reduce((merged, candidate) => mergeAddress(merged, candidate), best);
}

async function fetchNominatim(latitude: number, longitude: number, zoom: number): Promise<Address> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "fr");
  url.searchParams.set("zoom", String(zoom));
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "CRI-BLO-Assistant/0.1 (Orange France technician tool)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const body = (await res.json()) as {
    display_name?: string;
    name?: string;
    address?: Record<string, string | undefined>;
  };
  return normalizeNominatimAddress(body);
}

async function fetchBAN(latitude: number, longitude: number): Promise<Address[]> {
  // Base Adresse Nationale officielle (gratuite, sans clé, France).
  const types = [undefined, "housenumber", "street"] as const;
  const results: Address[] = [];
  for (const type of types) {
    const url = new URL("https://api-adresse.data.gouv.fr/reverse/");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("limit", "5");
    if (type) url.searchParams.set("type", type);
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) continue;
    const body = (await res.json()) as {
      features?: Array<{
        properties?: {
          label?: string;
          housenumber?: string;
          street?: string;
          name?: string;
          postcode?: string;
          city?: string;
          context?: string;
        };
      }>;
    };
    for (const feature of body.features ?? []) {
      const p = feature.properties ?? {};
      const parsed = parseStreetAndNumber([p.label, p.name].filter(Boolean).join(", "));
      results.push({
        streetNumber: normalizeText(p.housenumber) ?? parsed.streetNumber,
        street: normalizeText(p.street) ?? parsed.street,
        postalCode: normalizeText(p.postcode),
        commune: normalizeText(p.city),
        country: "France",
      });
    }
  }
  return results;
}
