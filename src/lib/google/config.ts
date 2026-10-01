const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || "";

export function getGoogleClientId(): string {
  return GOOGLE_CLIENT_ID;
}

export function isGoogleDriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/userinfo.email",
];

export const GOOGLE_SCOPES_STRING = GOOGLE_SCOPES.join(" ");
