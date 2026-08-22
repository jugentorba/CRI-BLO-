import { z } from "zod";

const schema = z.object({
  notes: z.string().min(1).max(4000),
  style: z.enum(["simple", "professional", "detailed"]),
  context: z.string().max(2000).optional(),
  patterns: z.array(z.string().max(500)).max(8).optional(),
});

// The APK is a client-only bundle and must never contain a private AI key.
// CommentAssistant falls back to the local composition engine on failure.
export async function improveComment(input: { data: z.infer<typeof schema> }) {
  schema.parse(input.data);
  return {
    ok: false as const,
    status: 401,
    message: "Assistant IA en ligne indisponible dans la version APK.",
  };
}
