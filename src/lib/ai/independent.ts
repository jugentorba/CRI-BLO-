export interface IndependentAiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export async function callIndependentAi(
  config: IndependentAiConfig,
  input: string,
): Promise<string> {
  if (!config.endpoint.trim()) throw new Error("Endpoint IA non configuré.");
  const res = await fetch(config.endpoint.trim(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
    },
    body: JSON.stringify({
      model: config.model || "gpt-4o-mini",
      messages: [{ role: "user", content: input }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`IA indépendante : HTTP ${res.status}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Réponse IA vide.");
  return text;
}
