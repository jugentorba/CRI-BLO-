// Logique serveur de l'assistant IA autonome (hors CRI BLO).

export interface AssistantInput {
  text: string;
  inputLang: "fr" | "en" | "sq" | "auto";
  outputLang: "fr" | "en" | "sq";
  tone: "professional" | "simple" | "email" | "explain" | "translate";
}

export type AssistantResult =
  | { ok: true; text: string }
  | { ok: false; status: number; message: string };

const LANG_NAMES: Record<string, string> = {
  fr: "français",
  en: "anglais",
  sq: "albanais",
  auto: "langue détectée automatiquement",
};

const TONES: Record<string, string> = {
  professional: "Réécris le texte de façon claire, professionnelle et concise.",
  simple: "Réécris le texte en phrases très simples et directes.",
  email: "Rédige un e-mail professionnel complet (objet court puis corps du message).",
  explain: "Explique clairement le contenu, de façon pédagogique et structurée.",
  translate: "Traduis fidèlement le texte, sans reformuler ni ajouter d'information.",
};

const SYSTEM = [
  "Tu es un assistant de rédaction professionnel spécialisé dans les télécoms et la fibre optique en France (vocabulaire Orange : BLO, PB, PEO, NRO, soudure, épissure, tirage, raccordement, OI, OC).",
  "Tu restes aussi un assistant de rédaction général (e-mails, messages, commentaires, explications, traductions).",
  "RÈGLE ABSOLUE : n'invente jamais d'information, ne complète pas de données manquantes, ne fais pas de suppositions techniques.",
  "Conserve exactement le sens du texte fourni. Réponds uniquement avec le texte final, sans commentaire ni balise.",
].join("\n");

export async function runAssistant(
  data: AssistantInput,
  apiKey: string,
): Promise<AssistantResult> {
  const user = [
    `Langue d'entrée : ${LANG_NAMES[data.inputLang]}.`,
    `Langue de sortie attendue : ${LANG_NAMES[data.outputLang]} (écris TOUTE la réponse dans cette langue).`,
    TONES[data.tone],
    `Texte :\n${data.text}`,
  ].join("\n\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    let message = "Assistant IA indisponible.";
    try {
      const err = (await res.json()) as { message?: string; error?: { message?: string } };
      message = err.error?.message ?? err.message ?? message;
    } catch {
      /* réponse non JSON */
    }
    if (res.status === 402) message = message || "Crédits IA épuisés.";
    return { ok: false, status: res.status, message };
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) return { ok: false, status: 502, message: "Réponse IA vide." };
  return { ok: true, text };
}
