import { z } from "zod";
import { callGemini, DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";
import { getSettings } from "@/lib/settings/repository";

const schema = z.object({
  notes: z.string().min(1).max(4000),
  style: z.enum(["simple", "professional", "detailed"]),
  context: z.string().max(2000).optional(),
  patterns: z.array(z.string().max(500)).max(8).optional(),
});

const STYLE = {
  simple: "Réécris les notes de façon courte, claire et naturelle.",
  professional: "Réécris les notes comme un commentaire professionnel de technicien fibre, précis et directement utilisable.",
  detailed: "Réécris les notes de façon professionnelle et détaillée, sans inventer d'information.",
} as const;

export async function improveComment(input: { data: z.infer<typeof schema> }) {
  const data = schema.parse(input.data);
  const settings = await getSettings();
  const apiKey = settings.aiApiKey?.trim() ?? "";

  if (!apiKey) {
    return {
      ok: false as const,
      status: 401,
      message: "Ajoutez votre clé Gemini dans Paramètres > Assistant IA.",
    };
  }

  const prompt = [
    STYLE[data.style],
    "Conserve uniquement les faits fournis. N'invente aucune mesure, adresse, référence, cause ou action.",
    data.context ? `Contexte terrain:\n${data.context}` : "",
    data.patterns?.length
      ? `Exemples de style déjà utilisés:\n- ${data.patterns.join("\n- ")}`
      : "",
    `Notes à améliorer:\n${data.notes}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const text = await callGemini({
      apiKey,
      model: settings.aiModel || DEFAULT_GEMINI_MODEL,
      prompt,
      systemInstruction:
        "Tu es l'assistant de commentaire CRI-BLO pour interventions fibre optique. Réponds uniquement avec le commentaire final, sans titre ni explication.",
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
