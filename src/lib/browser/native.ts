import { Capacitor, registerPlugin } from "@capacitor/core";

interface NativeBrowserOpenOptions {
  url: string;
  longPressCompatibility?: boolean;
}

interface NativeBrowserOpenResult {
  url?: string;
  title?: string;
}

interface CRIBrowserPlugin {
  open(options: NativeBrowserOpenOptions): Promise<NativeBrowserOpenResult>;
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
  options: { longPressCompatibility?: boolean } = {},
): Promise<NativeBrowserOpenResult> {
  if (!hasNativeCriBrowser()) {
    throw new Error("Le navigateur natif CRI-BLO n'est disponible que dans l'application Android/iOS.");
  }

  return CRIBrowser.open({
    url,
    longPressCompatibility: options.longPressCompatibility ?? true,
  });
}
