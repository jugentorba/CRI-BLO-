import { Capacitor, CapacitorHttp } from "@capacitor/core";

export type AiProvider =
  | "none"
  | "gemini"
  | "openai"
  | "deepseek"
  | "claude"
  | "grok"
  | "mistral"
  | "openrouter"
  | "custom";

type AiProtocol = "openai" | "anthropic";

export interface IndependentAiConfig {
  provider: Exclude<AiProvider, "none">;
  endpoint: string;
  apiKey: string;
  model: string;
  protocol: AiProtocol;
}

export interface AiProviderOption {
  id: AiProvider;
  label: string;
}

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  { id: "none", label: "Aucun (moteur local)" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI / ChatGPT" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "claude", label: "Anthropic Claude" },
  { id: "grok", label: "xAI Grok" },
  { id: "mistral", label: "Mistral AI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "custom", label: "Autre / endpoint compatible OpenAI" },
];

/** Verified Google Gemini API model IDs (October 2026).
 * Speed and quality labels are guidance, not measured latency or an availability guarantee.
 */
export const GEMINI_MODEL_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  speed: string;
  usage: string;
}> = [
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", speed: "Très rapide", usage: "Recommandé : corrections, notes et traductions courtes" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", speed: "Rapide", usage: "Bon équilibre : rédaction et reformulation" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", speed: "Équilibré", usage: "Travaux nécessitant plus de raisonnement" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", speed: "Équilibré", usage: "Analyses détaillées et consignes complexes" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", speed: "Qualité prioritaire", usage: "Travaux complexes, généralement moins économique" },
];

export function getGeminiReasoningEffort(model: string, fast: boolean): "minimal" | "low" | undefined {
  // Gemini 3.7/3.8 Flash reject "minimal", returning HTTP 400.
  if (/^gemini-3\.(?:7|8)-flash(?:$|-)/.test(model)) return "low";
  // Earlier 3.x Flash and Flash-Lite accept minimal thinking on short jobs.
  if (/^gemini-3\.(?:5|6)-flash(?:-lite)?(?:$|-)/.test(model)) return fast ? "minimal" : "low";
  // For manually entered or legacy IDs, use the provider's default instead
  // of guessing an unsupported reasoning value.
  return undefined;
}

const PRESETS: Record<
  Exclude<AiProvider, "none" | "custom">,
  { endpoint: string; model: string; protocol: AiProtocol }
> = {
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.5-flash-lite",
    protocol: "openai",
  },
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-6-luna",
    protocol: "openai",
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-flash",
    protocol: "openai",
  },
  claude: {
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-5-5",
    protocol: "anthropic",
  },
  grok: {
    endpoint: "https://api.x.ai/v1/chat/completions",
    model: "grok-4.7",
    protocol: "openai",
  },
  mistral: {
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest",
    protocol: "openai",
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "openrouter/auto",
    protocol: "openai",
  },
};

export function getAiProviderPreset(provider: AiProvider) {
  if (provider === "none" || provider === "custom") return null;
  return PRESETS[provider];
}

export function getAiProviderLabel(provider: AiProvider): string {
  return AI_PROVIDER_OPTIONS.find((item) => item.id === provider)?.label ?? provider;
}

export interface AiSettingsLike {
  aiProvider?: AiProvider;
  aiEndpoint?: string;
  aiApiKey?: string;
  aiModel?: string;
}

export function buildAiConfig(settings: AiSettingsLike): IndependentAiConfig | null {
  const provider: AiProvider =
    settings.aiProvider ?? (settings.aiEndpoint?.trim() ? "custom" : "none");

  if (provider === "none") return null;

  const apiKey = settings.aiApiKey?.trim() ?? "";
  if (!apiKey) throw new Error("Clé API manquante.");

  if (provider === "custom") {
    const endpoint = settings.aiEndpoint?.trim() ?? "";
    const model = settings.aiModel?.trim() ?? "";
    if (!endpoint) throw new Error("Endpoint IA manquant.");
    if (!model) throw new Error("Modèle IA manquant.");
    return { provider, endpoint, apiKey, model, protocol: "openai" };
  }

  const preset = PRESETS[provider];
  const configuredModel = settings.aiModel?.trim() ?? "";
  const model = configuredModel || preset.model;
  return {
    provider,
    endpoint: preset.endpoint,
    apiKey,
    model,
    protocol: preset.protocol,
  };
}

function readErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as {
    error?: { message?: unknown };
    message?: unknown;
    detail?: unknown;
  };
  if (typeof obj.error?.message === "string") return obj.error.message;
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.detail === "string") return obj.detail;
  return null;
}

interface ProviderHttpResponse {
  status: number;
  data: unknown;
}

function normalizeHttpData(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /timeout|timed out|time out|délai dépassé/i.test(message);
}

/** Erreurs qui justifient d'essayer un autre modèle du même fournisseur. */
function isUnknownModelError(response: ProviderHttpResponse): boolean {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  const message = readErrorMessage(response.data) ?? "";
  // Attention : « Invalid reasoning level for selected model » contient le mot
  // « model » mais ne signifie pas que le modèle est inconnu.
  return /(model|modèle)\s+(?:is\s+)?(?:not\s+found|not\s+supported|unsupported|does\s+not\s+exist|inconnu)/i.test(
    message,
  ) || /unknown\s+model|invalid\s+model|no\s+such\s+model/i.test(message);
}

/** Modèles essayés dans l'ordre si l'identifiant configuré est refusé. */
function modelCandidates(config: IndependentAiConfig): string[] {
  const configured = config.model.trim();
  if (config.provider !== "gemini") return [configured];
  const fallbacks = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
  return [...new Set([configured, ...fallbacks].filter(Boolean))];
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

async function postProviderJson(
  url: string,
  headers: Record<string, string>,
  data: Record<string, unknown>,
  provider?: AiProvider,
  fast = false,
): Promise<ProviderHttpResponse> {
  if (Capacitor.isNativePlatform()) {
    const attempts = provider === "gemini" && !fast ? 2 : 1;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await CapacitorHttp.post({
          url,
          headers,
          data,
          connectTimeout: fast ? 10000 : 20000,
          // 35 s était trop court quand le modèle « réfléchit » : l'assistant
          // semblait s'arrêter. On laisse 60 s, avec une seule relance.
          readTimeout: fast ? 60000 : 120000,
        });
        return { status: response.status, data: normalizeHttpData(response.data) };
      } catch (error) {
        lastError = error;
        const retry = provider === "gemini" && attempt === 0 && isTimeoutError(error);
        if (!retry) break;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    if (provider === "gemini" && isTimeoutError(lastError)) {
      throw new Error("Google Gemini : délai dépassé après deux tentatives.");
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Requête IA impossible."));
  }

  // Sans timeout, une requête bloquée laissait l'assistant « occupé » indéfiniment.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fast ? 45000 : 90000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Délai dépassé : l'IA n'a pas répondu. Réessayez.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }
  return { status: response.status, data: normalizeHttpData(body) };
}

async function throwProviderError(response: ProviderHttpResponse, provider: AiProvider): Promise<never> {
  const message = readErrorMessage(response.data) ?? "";
  const prefix = getAiProviderLabel(provider);
  if (response.status === 401 || response.status === 403) {
    throw new Error(`${prefix} : clé API refusée (HTTP ${response.status}).`);
  }
  if (response.status === 404) {
    throw new Error(`${prefix} : endpoint ou modèle introuvable (HTTP 404).`);
  }
  if (response.status === 429) {
    throw new Error(`${prefix} : limite d\'utilisation atteinte (HTTP 429).`);
  }
  throw new Error(message ? `${prefix} : ${message}` : `${prefix} : HTTP ${response.status}`);
}
function extractOpenAiText(data: unknown): string {
  const content = (data as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  })?.choices?.[0]?.message?.content;

  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function extractAnthropicText(data: unknown): string {
  const blocks = (data as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export interface CallAiOptions {
  system?: string;
  maxTokens?: number;
  fast?: boolean;
  /** 0 = très déterministe. Défaut 0.2 : reformulation fidèle. */
  temperature?: number;
  /** Modèle réellement utilisé (après bascule éventuelle). */
  onModelUsed?: (model: string) => void;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Une seule nouvelle tentative sur les erreurs transitoires (429 / 5xx). */
async function postWithRetry(
  url: string,
  headers: Record<string, string>,
  data: Record<string, unknown>,
  provider: AiProvider,
  fast: boolean,
): Promise<ProviderHttpResponse> {
  let response = await postProviderJson(url, headers, data, provider, fast);
  if (RETRYABLE.has(response.status)) {
    await wait(response.status === 429 ? 900 : 400);
    response = await postProviderJson(url, headers, data, provider, fast);
  }
  return response;
}

function tokenBudget(config: IndependentAiConfig, model: string, requested?: number): number {
  // Les jetons de raisonnement comptent dans la limite de sortie : une limite
  // trop basse (220) peut renvoyer une réponse vide sur les modèles 3.7/3.8.
  if (config.provider === "gemini" && /^gemini-3\.(?:7|8)-flash(?:$|-)/.test(model)) {
    return Math.max(requested ?? 1200, 1536);
  }
  return requested ?? 1200;
}

export async function callIndependentAi(
  config: IndependentAiConfig,
  input: string,
  options?: CallAiOptions,
): Promise<string> {
  if (!config.endpoint.trim()) throw new Error("Endpoint IA non configuré.");
  if (!config.apiKey.trim()) throw new Error("Clé API manquante.");

  const temperature = options?.temperature ?? 0.2;
  const fast = options?.fast ?? false;

  if (config.protocol === "anthropic") {
    const response = await postWithRetry(
      config.endpoint.trim(),
      {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      {
        model: config.model,
        max_tokens: options?.maxTokens ?? 1200,
        temperature,
        ...(options?.system ? { system: options.system } : {}),
        messages: [{ role: "user", content: input }],
      },
      config.provider,
      fast,
    );
    if (response.status < 200 || response.status >= 300) {
      await throwProviderError(response, config.provider);
    }
    const text = extractAnthropicText(response.data);
    if (!text) throw new Error(`${getAiProviderLabel(config.provider)} : réponse vide.`);
    options?.onModelUsed?.(config.model);
    return text;
  }

  const messages = [
    ...(options?.system ? [{ role: "system", content: options.system }] : []),
    { role: "user", content: input },
  ];
  const endpoint = config.endpoint.trim();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey.trim()}`,
  };
  const models = modelCandidates(config);
  let lastResponse: ProviderHttpResponse | null = null;

  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: tokenBudget(config, model, options?.maxTokens),
      ...(config.provider === "gemini" && getGeminiReasoningEffort(model, fast)
        ? { reasoning_effort: getGeminiReasoningEffort(model, fast) }
        : {}),
    };

    let response = await postWithRetry(endpoint, headers, body, config.provider, fast);

    if (response.status >= 200 && response.status < 300) {
      let text = extractOpenAiText(response.data);
      if (!text) {
        // Réponse vide : souvent une limite de sortie atteinte par les jetons
        // de raisonnement. Une seule relance avec un budget doublé.
        const bigger = {
          ...body,
          max_tokens: Math.max(Number(body.max_tokens ?? 1200) * 2, 1024),
        };
        response = await postWithRetry(endpoint, headers, bigger, config.provider, fast);
        text = response.status >= 200 && response.status < 300 ? extractOpenAiText(response.data) : "";
      }
      if (!text) throw new Error(`${getAiProviderLabel(config.provider)} : réponse vide.`);
      options?.onModelUsed?.(model);
      return text;
    }

    // Modèle refusé (identifiant inconnu) : on essaie le suivant avant d'échouer.
    if (isUnknownModelError(response) && model !== models[models.length - 1]) {
      lastResponse = response;
      continue;
    }
    await throwProviderError(response, config.provider);
  }

  if (lastResponse) await throwProviderError(lastResponse, config.provider);
  throw new Error(`${getAiProviderLabel(config.provider)} : aucun modèle disponible.`);
}

export async function testAiConnection(config: IndependentAiConfig): Promise<void> {
  // Reasoning tokens can consume the small completion budget before visible text.
  // Use enough headroom for a genuine provider round-trip even in low-thinking mode.
  await callIndependentAi(config, "Réponds uniquement par OK.", { maxTokens: 1024, fast: true });
}
