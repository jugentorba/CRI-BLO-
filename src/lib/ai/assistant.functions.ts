import { z } from "zod";

const schema = z.object({
  text: z.string().min(1).max(6000),
  inputLang: z.enum(["fr", "en", "sq", "auto"]),
  outputLang: z.enum(["fr", "en", "sq"]),
  tone: z.enum(["professional", "simple", "email", "explain", "translate"]),
});

// The APK is a client-only bundle and must never contain a private AI key.
// The assistant screen already has a local/offline fallback.
export async function askAssistant(input: { data: z.infer<typeof schema> }) {
  schema.parse(input.data);
  return {
    ok: false as const,
    status: 401,
    message: "Assistant IA en ligne indisponible dans la version APK.",
  };
}
