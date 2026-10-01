// OneDrive / Microsoft Graph configuration.
// OAuth Client ID belongs to the CRI BLO application build.
// End users only sign in with their own Microsoft account.

const AZURE_CLIENT_ID =
  (import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined)?.trim() || "";

export function getAzureClientId(): string {
  return AZURE_CLIENT_ID;
}

export const AZURE_AUTHORITY = "https://login.microsoftonline.com/common";
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
