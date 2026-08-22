// État persistant (en mémoire) du navigateur intégré : conservé quand on
// quitte l'onglet Navigateur puis qu'on y revient.

export interface BrowserState {
  stack: string[];
  index: number;
  reloadKey: number;
}

const state: BrowserState = { stack: [], index: -1, reloadKey: 0 };

/** Dernière page rendue (HTML proxifié) — évite un rechargement au retour. */
let pageCache: { url: string; reloadKey: number; html: string; title: string } | null = null;

export function getPageCache(url: string, reloadKey: number): { html: string; title: string } | null {
  if (pageCache && pageCache.url === url && pageCache.reloadKey === reloadKey) {
    return { html: pageCache.html, title: pageCache.title };
  }
  return null;
}

export function setPageCache(url: string, reloadKey: number, html: string, title: string): void {
  pageCache = { url, reloadKey, html, title };
}

export function getBrowserState(): BrowserState {
  return { ...state, stack: [...state.stack] };
}

export function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(raw)) return `https://${raw}`;
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(raw)}`;
}

export function pushUrl(url: string): BrowserState {
  if (state.stack[state.index] === url) return getBrowserState();
  state.stack = [...state.stack.slice(0, state.index + 1), url];
  state.index = state.stack.length - 1;
  return getBrowserState();
}

export function goBack(): BrowserState {
  if (state.index > 0) state.index -= 1;
  return getBrowserState();
}

export function goForward(): BrowserState {
  if (state.index < state.stack.length - 1) state.index += 1;
  return getBrowserState();
}

export function reload(): BrowserState {
  state.reloadKey += 1;
  return getBrowserState();
}

export function currentUrl(): string {
  return state.index >= 0 ? state.stack[state.index] : "";
}
