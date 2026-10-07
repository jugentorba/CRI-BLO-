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

const PRESETS: Record<
  Exclude<AiProvider, "none" | "custom">,
  { endpoint: string; model: string; protocol: AiProtocol }
> = {
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.8-flash",
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
  return {
    provider,
    endpoint: preset.endpoint,
    apiKey,
    model: settings.aiModel?.trim() || preset.model,
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

async function postProviderJson(
  url: string,
  headers: Record<string, string>,
  data: Record<string, unknown>,
): Promise<ProviderHttpResponse> {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url,
      headers,
      data,
      connectTimeout: 15000,
      readTimeout: 60000,
    });
    return { status: response.status, data: normalizeHttpData(response.data) };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
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

export async function callIndependentAi(
  config: IndependentAiConfig,
  input: string,
  options?: { system?: string },
): Promise<string> {
  if (!config.endpoint.trim()) throw new Error("Endpoint IA non configuré.");
  if (!config.apiKey.trim()) throw new Error("Clé API manquante.");

  if (config.protocol === "anthropic") {
    const response = await postProviderJson(
      config.endpoint.trim(),
      {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      {
        model: config.model,
        max_tokens: 1200,
        ...(options?.system ? { system: options.system } : {}),
        messages: [{ role: "user", content: input }],
      },
    );
    if (response.status < 200 || response.status >= 300) {
      await throwProviderError(response, config.provider);
    }
    const text = extractAnthropicText(response.data);
    if (!text) throw new Error(`${getAiProviderLabel(config.provider)} : réponse vide.`);
    return text;
  }

  const messages = [
    ...(options?.system ? [{ role: "system", content: options.system }] : []),
    { role: "user", content: input },
  ];
  const response = await postProviderJson(
    config.endpoint.trim(),
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    {
      model: config.model,
      messages,
    },
  );
  if (response.status < 200 || response.status >= 300) {
    await throwProviderError(response, config.provider);
  }
  const text = extractOpenAiText(response.data);
  if (!text) throw new Error(`${getAiProviderLabel(config.provider)} : réponse vide.`);
  return text;
}

export async function testAiConnection(config: IndependentAiConfig): Promise<void> {
  await callIndependentAi(config, "Réponds uniquement par OK.");
}
