// Patrons de rédaction appris localement (100 % hors-ligne).
// Chaque commentaire validé par le technicien est mémorisé et sert ensuite
// de contexte, en ligne comme hors-ligne.

import { STORE_AI_PATTERNS, reqAsync, tx } from "@/lib/db";

export interface CommentPattern {
  id: string;
  text: string;
  usedAt: string;
  uses: number;
}

const MAX_PATTERNS = 60;

function keyOf(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

export async function rememberPattern(text: string): Promise<void> {
  const clean = text.trim();
  if (clean.length < 20) return;
  try {
    const id = keyOf(clean);
    await tx(STORE_AI_PATTERNS, "readwrite", async (s) => {
      const existing = (await reqAsync(s.get(id))) as CommentPattern | undefined;
      await reqAsync(
        s.put({
          id,
          text: clean.slice(0, 500),
          usedAt: new Date().toISOString(),
          uses: (existing?.uses ?? 0) + 1,
        } satisfies CommentPattern),
      );
    });
    await prune();
  } catch {
    /* mémoire locale indisponible — sans impact */
  }
}

async function prune(): Promise<void> {
  const all = await listPatterns();
  if (all.length <= MAX_PATTERNS) return;
  const drop = all.slice(MAX_PATTERNS);
  await tx(STORE_AI_PATTERNS, "readwrite", async (s) => {
    for (const p of drop) await reqAsync(s.delete(p.id));
  });
}

export async function listPatterns(): Promise<CommentPattern[]> {
  try {
    const all = (await tx(STORE_AI_PATTERNS, "readonly", (s) =>
      reqAsync(s.getAll()),
    )) as CommentPattern[];
    return all.sort(
      (a, b) => b.uses - a.uses || (b.usedAt > a.usedAt ? 1 : -1),
    );
  } catch {
    return [];
  }
}

/** Les meilleurs patrons pour guider le ton (en ligne) ou proposer un modèle (hors-ligne). */
export async function topPatterns(limit = 5): Promise<string[]> {
  return (await listPatterns()).slice(0, limit).map((p) => p.text);
}
