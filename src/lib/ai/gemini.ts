const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const FREE_GEMINI_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
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

interface GeminiModel {
  name?: string;
  baseModelId?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelListResponse {
  models?: GeminiModel[];
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

function errorMessage(status: number, body: GeminiResponse | GeminiModelListResponse): string {
  if (status === 400) return body.error?.message || "Clé ou requête Gemini invalide.";
  if (status === 401 || status === 403) return "Clé Gemini refusée. Vérifiez la clé API dans Paramètres.";
  if (status === 404) return body.error?.message || "Modèle Gemini introuvable.";
  if (status === 429) return "Quota Gemini atteint pour le moment. Réessayez plus tard.";
  if (status >= 500) return "Gemini est temporairement indisponible.";
  return body.error?.message || `Gemini a répondu ${status}.`;
}

async function listGenerateContentModels(apiKey: string): Promise<string[]> {
  const response = await fetch(`${GEMINI_API_BASE}/models?pageSize=1000`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-goog-api-key": apiKey,
    },
    cache: "no-store",
  });

  let body: GeminiModelListResponse = {};
  try {
    body = (await response.json()) as GeminiModelListResponse;
  } catch {
    // Keep the HTTP-specific error below.
  }

  if (!response.ok) throw new Error(errorMessage(response.status, body));

  return (body.models ?? [])
    .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
    .map((model) => (model.baseModelId || model.name || "").replace(/^models\//, ""))
    .filter((name) => /^gemini-/i.test(name));
}

function pickFallbackModel(models: string[]): string | null {
  const preferred = [
    DEFAULT_GEMINI_MODEL,
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
  ];
  for (const model of preferred) {
    if (models.includes(model)) return model;
  }
  return (
    models.find((model) => /flash/i.test(model) && !/image|tts|live/i.test(model)) ??
    models.find((model) => !/image|tts|live/i.test(model)) ??
    null
  );
}

async function generate(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string,
): Promise<{ response: Response; body: GeminiResponse }> {
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
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
  return { response, body };
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
  if (!key) throw new Error("Ajoutez votre clé Gemini dans Paramètres.");

  let selectedModel = cleanModel(model);
  let result = await generate(key, selectedModel, prompt, systemInstruction);

  // Existing CRI-BLO installs may contain a retired or mistyped model name.
  // If Google rejects that model, discover a currently available
  // generateContent model for this API key and retry once.
  if (result.response.status === 404 || (result.response.status === 400 && /model/i.test(result.body.error?.message ?? ""))) {
    const available = await listGenerateContentModels(key);
    const fallback = pickFallbackModel(available);
    if (fallback && fallback !== selectedModel) {
      selectedModel = fallback;
      result = await generate(key, selectedModel, prompt, systemInstruction);
    }
  }

  if (!result.response.ok) throw new Error(errorMessage(result.response.status, result.body));
  if (result.body.promptFeedback?.blockReason) {
    throw new Error(`Gemini n'a pas traité cette demande (${result.body.promptFeedback.blockReason}).`);
  }

  const text = result.body.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) throw new Error("Gemini n'a renvoyé aucun texte.");
  return text;
}

export async function testGeminiConnection(apiKey: string, model?: string): Promise<string> {
  await callGemini({
    apiKey,
    model,
    prompt: "Reply with exactly: OK",
    systemInstruction: "This is a connectivity test. Reply only with OK.",
  });
  return "Connexion Gemini réussie.";
}
