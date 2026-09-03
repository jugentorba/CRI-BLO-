// OneDrive / Microsoft Graph configuration.
// The Azure App Registration Client ID is a publishable build-time value.
// Set VITE_AZURE_CLIENT_ID in the build/deployment environment used for CRI-BLO.
// Technicians must never be asked to create or configure an Azure application.

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
  browser: "Browser",
} as const;

export function isOneDriveConfigured(): boolean {
  return AZURE_CLIENT_ID.length > 0;
}

export function currentRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}
