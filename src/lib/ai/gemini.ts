const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";
export const FREE_GEMINI_MODELS = [
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
] as const;

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export interface GeminiRequest {
  apiKey: string;
  model?: string;
  prompt: string;
  systemInstruction?: string;
}

function cleanModel(model?: string): string {
  const value = (model || DEFAULT_GEMINI_MODEL).trim().replace(/^models\//, "");
  if (!/^[a-z0-9._-]+$/i.test(value)) return DEFAULT_GEMINI_MODEL;
  return value;
}

function errorMessage(status: number, body: GeminiResponse): string {
  if (status === 400) return body.error?.message || "Clé ou requête Gemini invalide.";
  if (status === 401 || status === 403) return "Clé Gemini refusée. Vérifiez la clé API dans Paramètres.";
  if (status === 429) return "Quota gratuit Gemini atteint pour le moment. Réessayez plus tard.";
  if (status >= 500) return "Gemini est temporairement indisponible.";
  return body.error?.message || `Gemini a répondu ${status}.`;
}

/**
 * Personal CRI-BLO Gemini client.
 *
 * The API key is supplied at runtime from the user's local settings. Nothing
 * is embedded in the repository, web bundle or APK at build time.
 */
export async function callGemini({
  apiKey,
  model,
  prompt,
  systemInstruction,
}: GeminiRequest): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error("Ajoutez votre clé Gemini gratuite dans Paramètres.");

  const selectedModel = cleanModel(model);
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${encodeURIComponent(selectedModel)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        ...(systemInstruction
          ? {
              systemInstruction: {
                parts: [{ text: systemInstruction }],
              },
            }
          : {}),
        contents: [
          {
            role: "user",
            parts: [{ text: prompt.slice(0, 12000) }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1600,
        },
      }),
    },
  );

  let body: GeminiResponse = {};
  try {
    body = (await response.json()) as GeminiResponse;
  } catch {
    // Preserve the HTTP-specific error below when Google returned no JSON.
  }

  if (!response.ok) throw new Error(errorMessage(response.status, body));
  if (body.promptFeedback?.blockReason) {
    throw new Error(`Gemini n'a pas traité cette demande (${body.promptFeedback.blockReason}).`);
  }

  const text = body.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) throw new Error("Gemini n'a renvoyé aucun texte.");
  return text;
}
