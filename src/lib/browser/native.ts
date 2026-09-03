import { Capacitor, registerPlugin } from "@capacitor/core";

interface NativeBrowserOpenOptions {
  url: string;
  longPressCompatibility?: boolean;
  resumeLast?: boolean;
}

interface NativeBrowserOpenResult {
  url?: string;
  title?: string;
}

interface CRIBrowserPlugin {
  open(options: NativeBrowserOpenOptions): Promise<NativeBrowserOpenResult>;
  getState(): Promise<{ stateJson?: string }>;
  restoreState(options: { stateJson: string }): Promise<{ applied?: boolean }>;
}

const CRIBrowser = registerPlugin<CRIBrowserPlugin>("CRIBrowser");

export function hasNativeCriBrowser(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativeBrowserPlatform(): "ios" | "android" | "web" {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : "web";
}

export async function openNativeCriBrowser(
  url: string,
  options: { longPressCompatibility?: boolean; resumeLast?: boolean } = {},
): Promise<NativeBrowserOpenResult> {
  if (!hasNativeCriBrowser()) {
    throw new Error("Le navigateur natif CRI-BLO n'est disponible que dans l'application Android/iOS.");
  }

  return CRIBrowser.open({
    url,
    longPressCompatibility: options.longPressCompatibility ?? true,
    resumeLast: options.resumeLast ?? false,
  });
}

export async function getNativeBrowserStateJson(): Promise<string> {
  if (!hasNativeCriBrowser()) return "";
  const result = await CRIBrowser.getState();
  return result.stateJson ?? "";
}

export async function restoreNativeBrowserState(stateJson: string): Promise<boolean> {
  if (!hasNativeCriBrowser() || !stateJson.trim()) return false;
  const result = await CRIBrowser.restoreState({ stateJson });
  return result.applied ?? false;
}
