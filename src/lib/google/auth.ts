import { getGoogleClientId, GOOGLE_SCOPES, isGoogleDriveConfigured } from "./config";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => { requestAccessToken: (options?: { prompt?: string }) => void };
          revoke?: (token: string, callback?: () => void) => void;
        };
      };
    };
  }
}

const TOKEN_KEY = "criblo.googleDriveToken";
const TOKEN_EXP_KEY = "criblo.googleDriveTokenExpiresAt";
let scriptPromise: Promise<void> | null = null;

async function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-criblo-google-gis="1"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Google Identity Services indisponible.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.cribloGoogleGis = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Impossible de charger Google Identity Services."));
      document.head.appendChild(script);
    });
  }
  await scriptPromise;
}

function cachedToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const exp = Number(sessionStorage.getItem(TOKEN_EXP_KEY) || 0);
    if (token && exp > Date.now() + 60_000) return token;
  } catch {
    /* noop */
  }
  return null;
}

function saveToken(token: string, expiresIn = 3600) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + Math.max(60, expiresIn - 30) * 1000));
  } catch {
    /* noop */
  }
}

async function requestToken(prompt: "" | "consent" | "select_account"): Promise<string> {
  if (!isGoogleDriveConfigured()) {
    throw new Error("Configuration Google Drive requise : Client ID Google manquant.");
  }
  await loadGoogleIdentity();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services indisponible.");

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: getGoogleClientId(),
      scope: GOOGLE_SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || "Connexion Google annulée."));
          return;
        }
        saveToken(response.access_token, response.expires_in);
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({ prompt });
  });
}

export async function loginGoogleDrive(): Promise<string> {
  return requestToken("select_account");
}

export async function getGoogleAccessToken(interactive = true): Promise<string> {
  const token = cachedToken();
  if (token) return token;
  if (!interactive) throw new Error("Connexion Google requise.");
  return requestToken("");
}

export function hasCachedGoogleAccessToken(): boolean {
  return !!cachedToken();
}

export async function logoutGoogleDrive(): Promise<void> {
  const token = cachedToken();
  try {
    if (token && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(token);
    }
  } catch {
    /* noop */
  }
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
  } catch {
    /* noop */
  }
}

export async function getGoogleProfile(): Promise<{ email: string; name: string } | null> {
  try {
    const token = await getGoogleAccessToken();
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { email?: string; name?: string };
    return { email: j.email || "", name: j.name || "" };
  } catch {
    return null;
  }
}
