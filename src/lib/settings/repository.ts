import { STORE_SETTINGS, reqAsync, tx } from "@/lib/db";

export type ThemeMode = "system" | "light" | "dark";
export type DisplayDensity = "comfortable" | "compact" | "very-compact";
export type AiProvider = "gemini" | "custom";

export interface AppSettings {
  id: "app";
  autoSave: boolean;
  saveToGallery: boolean;
  watermark: boolean;
  exportFolderName?: string;
  language: "fr" | "en";
  theme: ThemeMode;
  density: DisplayDensity;
  /** Custom scale in percent, 80–110. Defaults to 100. */
  scale: number;
  cloudSyncEnabled?: boolean;
  cloudProvider?: "onedrive";
  lastSyncAt?: string;
  /** Personal AI provider. Gemini is the default no-required-payment option. */
  aiProvider?: AiProvider;
  /** Legacy/custom OpenAI-compatible endpoint; kept for backward compatibility. */
  aiEndpoint?: string;
  /** User-supplied API key. Never supplied by the build or committed to GitHub. */
  aiApiKey?: string;
  aiModel?: string;
  permissionsOnboardingDone?: boolean;
}

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

const DEFAULTS: AppSettings = {
  id: "app",
  autoSave: true,
  saveToGallery: false,
  watermark: true,
  language: "fr",
  theme: "system",
  density: "comfortable",
  scale: 100,
  cloudSyncEnabled: false,
  cloudProvider: "onedrive",
  aiProvider: "gemini",
  aiEndpoint: "",
  aiApiKey: "",
  aiModel: DEFAULT_GEMINI_MODEL,
  permissionsOnboardingDone: false,
};

function normalizeAiSettings(settings: AppSettings): AppSettings {
  if ((settings.aiProvider ?? "gemini") === "gemini") {
    return {
      ...settings,
      aiProvider: "gemini",
      // A stale custom endpoint must never silently override Gemini.
      aiEndpoint: "",
      aiModel: settings.aiModel?.startsWith("gemini-")
        ? settings.aiModel
        : DEFAULT_GEMINI_MODEL,
    };
  }
  return settings;
}

export async function getSettings(): Promise<AppSettings> {
  return tx(STORE_SETTINGS, "readonly", async (s) => {
    const r = (await reqAsync(s.get("app"))) as AppSettings | undefined;
    let merged: AppSettings = { ...DEFAULTS, ...(r ?? {}) };

    // Existing CRI-BLO installs used a generic OpenAI-compatible endpoint. Keep
    // those settings working, but new/no-endpoint installs use Gemini directly.
    if (!r?.aiProvider && r?.aiEndpoint?.trim()) merged.aiProvider = "custom";
    if (!r?.aiProvider && !r?.aiEndpoint?.trim()) {
      merged.aiProvider = "gemini";
      if (!r?.aiModel || r.aiModel === "gpt-4o-mini") merged.aiModel = DEFAULT_GEMINI_MODEL;
    }

    merged = normalizeAiSettings(merged);
    return merged;
  });
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = normalizeAiSettings({ ...current, ...patch, id: "app" });
  await tx(STORE_SETTINGS, "readwrite", (s) => reqAsync(s.put(next)));
  try {
    window.dispatchEvent(new CustomEvent("criblo:settings", { detail: next }));
  } catch {
    /* noop */
  }
  return next;
}

export async function getExportDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const r = await tx(STORE_SETTINGS, "readonly", async (s) =>
      reqAsync(s.get("exportDirHandle")),
    );
    const handle = (r as { handle?: FileSystemDirectoryHandle } | undefined)?.handle;
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function setExportDirHandle(
  handle: FileSystemDirectoryHandle | null,
): Promise<void> {
  await tx(STORE_SETTINGS, "readwrite", (s) =>
    reqAsync(s.put({ id: "exportDirHandle", handle })),
  );
}
