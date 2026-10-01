// Microsoft authentication (MSAL browser, PKCE, popup flow).
// No password ever stored inside CRI BLO — Microsoft's own login page handles the credentials.

import type { AccountInfo, PublicClientApplication } from "@azure/msal-browser";
import {
  AZURE_AUTHORITY,
  getAzureClientId,
  GRAPH_SCOPES,
  currentRedirectUri,
  isOneDriveConfigured,
} from "./config";

let pcaPromise: Promise<PublicClientApplication> | null = null;

async function getPca(): Promise<PublicClientApplication> {
  if (!isOneDriveConfigured()) {
    throw new Error(
      "Configuration OneDrive requise : renseignez le Client ID Microsoft dans Paramètres.",
    );
  }
  if (!pcaPromise) {
    pcaPromise = (async () => {
      const { PublicClientApplication } = await import("@azure/msal-browser");
      const pca = new PublicClientApplication({
        auth: {
          clientId: getAzureClientId(),
          authority: AZURE_AUTHORITY,
          redirectUri: currentRedirectUri(),
        },
        cache: { cacheLocation: "localStorage" },
      });
      await pca.initialize();
      return pca;
    })();
  }
  return pcaPromise;
}

export function getAccount(): AccountInfo | null {
  try {
    if (typeof window === "undefined") return null;
    if (!isOneDriveConfigured()) return null;
    // Read cached account without initializing MSAL (fast path).
    const raw = localStorage.getItem("msal.account.keys");
    if (!raw) return null;
  } catch {
    /* noop */
  }
  return null;
}

export async function getCurrentAccount(): Promise<AccountInfo | null> {
  try {
    const pca = await getPca();
    const accts = pca.getAllAccounts();
    return accts[0] ?? null;
  } catch {
    return null;
  }
}

export async function login(): Promise<AccountInfo> {
  const pca = await getPca();
  const res = await pca.loginPopup({ scopes: GRAPH_SCOPES, prompt: "select_account" });
  pca.setActiveAccount(res.account);
  return res.account;
}

export async function logout(): Promise<void> {
  try {
    const pca = await getPca();
    const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
    if (account) {
      // logoutPopup would open a Microsoft page — we only clear local cache.
      await pca.clearCache({ account });
    }
  } catch {
    /* noop */
  }
}

export async function getAccessToken(interactive = true): Promise<string> {
  const pca = await getPca();
  const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
  if (!account) throw new Error("Aucun compte Microsoft connecté.");
  try {
    const res = await pca.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
    return res.accessToken;
  } catch {
    if (!interactive) throw new Error("Connexion Microsoft requise.");
    const res = await pca.acquireTokenPopup({ scopes: GRAPH_SCOPES, account });
    return res.accessToken;
  }
}
