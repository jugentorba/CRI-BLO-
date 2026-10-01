const ENV_GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || "";

const STORAGE_KEY = "criblo.googleClientId";

export function getGoogleClientId(): string {
  if (ENV_GOOGLE_CLIENT_ID) return ENV_GOOGLE_CLIENT_ID;
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function setRuntimeGoogleClientId(value: string): void {
  try {
    const v = value.trim();
    if (v) localStorage.setItem(STORAGE_KEY, v);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function isGoogleDriveConfigured(): boolean {
  return getGoogleClientId().length > 0;
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");
