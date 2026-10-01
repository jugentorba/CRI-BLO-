// OneDrive / Microsoft Graph configuration.
// The Azure Client ID is public OAuth metadata. It can come from the build
// environment or be entered once in CRI BLO settings on the device.

const ENV_AZURE_CLIENT_ID =
  (import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined)?.trim() || "";

const STORAGE_KEY = "criblo.azureClientId";

export function getAzureClientId(): string {
  if (ENV_AZURE_CLIENT_ID) return ENV_AZURE_CLIENT_ID;
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function setRuntimeAzureClientId(value: string): void {
  try {
    const v = value.trim();
    if (v) localStorage.setItem(STORAGE_KEY, v);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export const AZURE_AUTHORITY = "https://login.microsoftonline.com/common";
export const GRAPH_SCOPES = ["Files.ReadWrite.AppFolder", "offline_access", "User.Read"];

export const APP_FOLDERS = {
  drafts: "Drafts",
  excel: "Excel Exports",
  zip: "ZIP Packages",
} as const;

export function isOneDriveConfigured(): boolean {
  return getAzureClientId().length > 0;
}

export function currentRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}
