import { STORE_SETTINGS, reqAsync, tx } from "@/lib/db";

export type ThemeMode = "system" | "light" | "dark";
export type DisplayDensity = "comfortable" | "compact" | "very-compact";
export type AiProvider = "gemini";

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
  /** CRI-BLO's personal AI provider. */
  aiProvider?: AiProvider;
  /** Legacy field retained only so older local records can be migrated safely. */
  aiEndpoint?: string;
  /** User-supplied Gemini API key. Never supplied by the build or committed to GitHub. */
  aiApiKey?: string;
  aiModel?: string;
  permissionsOnboardingDone?: boolean;
}

const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";

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
  return {
    ...settings,
    aiProvider: "gemini",
    // Old custom/OpenAI-compatible endpoints are intentionally retired. This
    // prevents a stale endpoint from silently bypassing the Gemini setup shown
    // in Settings on upgraded installations.
    aiEndpoint: "",
    aiModel: settings.aiModel?.startsWith("gemini-")
      ? settings.aiModel
      : DEFAULT_GEMINI_MODEL,
  };
}

export async function getSettings(): Promise<AppSettings> {
  return tx(STORE_SETTINGS, "readonly", async (s) => {
    const r = (await reqAsync(s.get("app"))) as AppSettings | undefined;
    return normalizeAiSettings({ ...DEFAULTS, ...(r ?? {}) });
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
