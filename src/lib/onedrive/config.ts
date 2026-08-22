// OneDrive / Microsoft Graph configuration.
// Publishable Azure App Registration Client ID — safe to expose in a public PWA.
// Set VITE_AZURE_CLIENT_ID in Lovable Cloud env once the Azure app is registered.

export const AZURE_CLIENT_ID: string =
  (import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined)?.trim() || "";

// "common" allows both personal (outlook.com / hotmail.com) and work/school accounts.
export const AZURE_AUTHORITY = "https://login.microsoftonline.com/common";

// AppFolder scope = sandboxed folder under /Apps/CRI BLO Assistant/. Safest OneDrive permission.
export const GRAPH_SCOPES = ["Files.ReadWrite.AppFolder", "offline_access", "User.Read"];

export const APP_FOLDERS = {
  drafts: "Drafts",
  excel: "Excel Exports",
  zip: "ZIP Packages",
} as const;

export function isOneDriveConfigured(): boolean {
  return AZURE_CLIENT_ID.length > 0;
}

export function currentRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}
