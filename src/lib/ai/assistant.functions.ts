import { z } from "zod";
import { callGemini, DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";
import { getSettings } from "@/lib/settings/repository";

const schema = z.object({
  text: z.string().min(1).max(6000),
  inputLang: z.enum(["fr", "en", "sq", "auto"]),
  outputLang: z.enum(["fr", "en", "sq"]),
  tone: z.enum(["professional", "simple", "email", "explain", "translate"]),
});

const LANGUAGE_NAMES = {
  fr: "français",
  en: "anglais",
  sq: "albanais",
} as const;

const TONE_INSTRUCTIONS = {
  professional: "Réponds de manière professionnelle, concise et adaptée à un technicien fibre sur le terrain.",
  simple: "Réponds simplement, clairement et sans jargon inutile.",
  email: "Rédige un e-mail professionnel directement utilisable.",
  explain: "Explique clairement le problème et les étapes utiles, sans inventer de faits.",
  translate: "Traduis fidèlement, naturellement, sans ajouter d'informations absentes du texte source.",
} as const;

/**
 * Personal online assistant for CRI-BLO.
 *
 * No provider key is embedded in the source. The user's Gemini key is read at
 * runtime from their local app settings. If no key is present, the caller can
 * continue with CRI-BLO's offline/local fallback.
 */
export async function askAssistant(input: { data: z.infer<typeof schema> }) {
  const data = schema.parse(input.data);
  const settings = await getSettings();

  if ((settings.aiProvider ?? "gemini") !== "gemini") {
    return {
      ok: false as const,
      status: 400,
      message: "Le fournisseur IA sélectionné n'est pas Gemini.",
    };
  }

  const apiKey = settings.aiApiKey?.trim() ?? "";
  if (!apiKey) {
    return {
      ok: false as const,
      status: 401,
      message: "Ajoutez votre clé Gemini gratuite dans Paramètres > Assistant IA.",
    };
  }

  const outputLanguage = LANGUAGE_NAMES[data.outputLang];
  const inputLanguage = data.inputLang === "auto" ? "détectée automatiquement" : LANGUAGE_NAMES[data.inputLang];

  const systemInstruction = [
    "Tu es l'assistant terrain intégré à CRI-BLO, une application de compte-rendu pour interventions fibre optique.",
    "Aide le technicien à rédiger, traduire, expliquer et vérifier ses informations.",
    "N'invente jamais une mesure, une adresse, une coordonnée GPS, une référence réseau ou une preuve terrain.",
    "Distingue clairement les suggestions des informations confirmées.",
    `La langue d'entrée est ${inputLanguage}. Réponds en ${outputLanguage}.`,
    TONE_INSTRUCTIONS[data.tone],
  ].join(" ");

  try {
    const text = await callGemini({
      apiKey,
      model: settings.aiModel || DEFAULT_GEMINI_MODEL,
      prompt: data.text,
      systemInstruction,
    });
    return { ok: true as const, status: 200, text };
  } catch (error) {
    return {
      ok: false as const,
      status: 503,
      message: error instanceof Error ? error.message : "Gemini est indisponible.",
    };
  }
}
