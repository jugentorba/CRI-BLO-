import { Capacitor } from "@capacitor/core";
import { GoogleSignIn } from "@capawesome/capacitor-google-sign-in";
import {
  getGoogleClientId,
  GOOGLE_SCOPES,
  GOOGLE_SCOPES_STRING,
  isGoogleDriveConfigured,
} from "./config";

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
const EMAIL_KEY = "criblo.googleDriveEmail";
const NAME_KEY = "criblo.googleDriveName";
let scriptPromise: Promise<void> | null = null;
let nativeInitPromise: Promise<void> | null = null;

function isNative(): boolean {
  return Capacitor.getPlatform() !== "web";
}

async function initNativeGoogle(): Promise<void> {
  if (!isGoogleDriveConfigured()) {
    throw new Error("Google Drive n'est pas configuré dans cette version de CRI BLO.");
  }
  if (!nativeInitPromise) {
    nativeInitPromise = GoogleSignIn.initialize({
      clientId: getGoogleClientId(),
      scopes: GOOGLE_SCOPES,
    }).catch((e) => {
      nativeInitPromise = null;
      throw e;
    });
  }
  await nativeInitPromise;
}

async function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-criblo-google-gis="1"]',
      );
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Google Identity Services indisponible.")),
          { once: true },
        );
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
    sessionStorage.setItem(
      TOKEN_EXP_KEY,
      String(Date.now() + Math.max(60, expiresIn - 30) * 1000),
    );
  } catch {
    /* noop */
  }
}

function saveProfile(email?: string | null, name?: string | null) {
  try {
    if (email) sessionStorage.setItem(EMAIL_KEY, email);
    if (name) sessionStorage.setItem(NAME_KEY, name);
  } catch {
    /* noop */
  }
}

async function requestWebToken(
  prompt: "" | "consent" | "select_account",
): Promise<string> {
  if (!isGoogleDriveConfigured()) {
    throw new Error("Google Drive n'est pas configuré dans cette version de CRI BLO.");
  }
  await loadGoogleIdentity();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services indisponible.");

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: getGoogleClientId(),
      scope: GOOGLE_SCOPES_STRING,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description || response.error || "Connexion Google annulée.",
            ),
          );
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
  if (isNative()) {
    await initNativeGoogle();
    const result = await GoogleSignIn.signIn();
    if (!result.accessToken) {
      throw new Error("Google n'a pas fourni l'autorisation Drive.");
    }
    saveToken(result.accessToken);
    saveProfile(result.email, result.displayName);
    return result.accessToken;
  }
  return requestWebToken("select_account");
}

export async function getGoogleAccessToken(interactive = true): Promise<string> {
  const token = cachedToken();
  if (token) return token;
  if (!interactive) throw new Error("Connexion Google requise.");
  return loginGoogleDrive();
}

export function hasCachedGoogleAccessToken(): boolean {
  return !!cachedToken();
}

export async function logoutGoogleDrive(): Promise<void> {
  const token = cachedToken();
  if (isNative()) {
    try {
      await initNativeGoogle();
      await GoogleSignIn.signOut();
    } catch {
      /* noop */
    }
  } else {
    try {
      if (token && window.google?.accounts?.oauth2?.revoke) {
        window.google.accounts.oauth2.revoke(token);
      }
    } catch {
      /* noop */
    }
  }
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
    sessionStorage.removeItem(NAME_KEY);
  } catch {
    /* noop */
  }
}

export async function getGoogleProfile(
  interactive = true,
): Promise<{ email: string; name: string } | null> {
  try {
    const token = await getGoogleAccessToken(interactive);
    try {
      const email = sessionStorage.getItem(EMAIL_KEY) || "";
      const name = sessionStorage.getItem(NAME_KEY) || "";
      if (email) return { email, name };
    } catch {
      /* noop */
    }
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { email?: string; name?: string };
    saveProfile(j.email, j.name);
    return { email: j.email || "", name: j.name || "" };
  } catch {
    return null;
  }
}
