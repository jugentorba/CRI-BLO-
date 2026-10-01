import { z } from "zod";
import { callGemini, DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";
import { getSettings } from "@/lib/settings/repository";

const schema = z.object({
  notes: z.string().min(1).max(4000),
  style: z.enum(["simple", "professional", "detailed"]),
  context: z.string().max(2000).optional(),
  patterns: z.array(z.string().max(500)).max(8).optional(),
});

// Credentials remain device-local, shared with the main assistant.
export async function improveComment(input: { data: z.infer<typeof schema> }) {
  const data = schema.parse(input.data);
  const settings = await getSettings();
  const apiKey = settings.aiApiKey?.trim();
  if (!apiKey) return { ok: false as const, status: 401, message: "Ajoutez votre clé Gemini dans Paramètres > Assistant IA." };
  try {
    const text = await callGemini({
      apiKey,
      model: settings.aiModel || DEFAULT_GEMINI_MODEL,
      prompt: `Style : ${data.style}\nNotes : ${data.notes}\nContexte : ${data.context ?? ""}`,
      systemInstruction: "Rédige un commentaire CRI BLO en français. N'invente aucun fait. Conserve exactement les références, nombres, mesures et lieux. Réponds uniquement avec le commentaire final.",
    });
    return { ok: true as const, status: 200, text };
  } catch (error) {
    return { ok: false as const, status: 503, message: error instanceof Error ? error.message : "Gemini indisponible." };
  }
}
