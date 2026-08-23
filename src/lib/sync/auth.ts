/**
 * Cloud auth service – web-only (no Capacitor).
 * Google: uses Google Identity Services popup flow.
 * Microsoft: uses MSAL browser popup flow (already in package.json).
 *
 * Both flows are optional. The app works fully as "guest" without any sign-in.
 */

export interface CloudUser {
  provider: "google" | "microsoft";
  email: string;
  name: string;
  /** Access token or identity token – used for cloud sync API calls */
  token: string;
}

// ─── Storage key ────────────────────────────────────────────────────────────
const STORAGE_KEY = "criblo_cloud_user";

export function getStoredUser(): CloudUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CloudUser) : null;
  } catch {
    return null;
  }
}

function storeUser(user: CloudUser | null) {
  if (user) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

// ─── Google ─────────────────────────────────────────────────────────────────

/** Sign in with Google using the Identity Services credential flow (popup). */
export async function signInGoogle(): Promise<CloudUser> {
  // We use window.google which is injected by the GSI script loaded lazily.
  await loadGsiScript();

  return new Promise<CloudUser>((resolve, reject) => {
    const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";
    if (!clientId) {
      reject(
        new Error(
          "Google Client ID not configured. Add VITE_GOOGLE_CLIENT_ID to .env to enable Google sign-in.",
        ),
      );
      return;
    }

    const g = (window as Window & {
      google?: {
        accounts: {
          id: {
            initialize: (options: {
              client_id: string;
              callback: (response: { credential: string }) => void;
            }) => void;
            prompt: () => void;
          };
        };
      };
    }).google;
    if (!g) {
      reject(new Error("Google Identity Services failed to load."));
      return;
    }

    g.accounts.id.initialize({
      client_id: clientId,
      callback: (response: { credential: string }) => {
        try {
          const payload = parseJwt(response.credential);
          const user: CloudUser = {
            provider: "google",
            email: payload.email as string,
            name: (payload.name as string) ?? (payload.email as string),
            token: response.credential,
          };
          storeUser(user);
          resolve(user);
        } catch (e) {
          reject(e);
        }
      },
    });
    g.accounts.id.prompt();
  });
}

async function loadGsiScript(): Promise<void> {
  if ((window as Window & { google?: unknown }).google) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services script."));
    document.head.appendChild(s);
  });
}

// ─── Microsoft ───────────────────────────────────────────────────────────────

/** Sign in with Microsoft using MSAL browser (popup). */
export async function signInMicrosoft(): Promise<CloudUser> {
  const { PublicClientApplication } = await import("@azure/msal-browser");

  const clientId = (import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined) ?? "";
  if (!clientId) {
    throw new Error(
      "Azure Client ID not configured. Add VITE_AZURE_CLIENT_ID to .env to enable Microsoft sign-in.",
    );
  }

  const msalInstance = new PublicClientApplication({
    auth: {
      clientId,
      authority:
        (import.meta.env.VITE_AZURE_AUTHORITY as string | undefined) ??
        "https://login.microsoftonline.com/common",
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false },
  });

  await msalInstance.initialize();

  const response = await msalInstance.loginPopup({
    scopes: ["openid", "profile", "email", "User.Read"],
  });

  const user: CloudUser = {
    provider: "microsoft",
    email: response.account?.username ?? "",
    name: response.account?.name ?? response.account?.username ?? "",
    token: response.accessToken,
  };
  storeUser(user);
  return user;
}

// ─── Sign out ────────────────────────────────────────────────────────────────

export function signOut(): void {
  storeUser(null);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseJwt(token: string): Record<string, unknown> {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join(""),
  );
  return JSON.parse(json) as Record<string, unknown>;
}
