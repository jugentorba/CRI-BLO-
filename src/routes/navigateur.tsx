import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Search,
  Download,
  Trash2,
  FolderDown,
  Globe,
  Loader2,
  X,
  Lock,
  Star,
  History,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  currentUrl,
  getBrowserState,
  getPageCache,
  goBack,
  goForward,
  normalizeUrl,
  pushUrl,
  reload,
  setPageCache,
} from "@/lib/browser/state";
import { openRemotePage } from "@/lib/browser/proxy.functions";
import { downloadRemoteFile } from "@/lib/browser/fetch.functions";
import {
  clearDownloads,
  deleteDownload,
  listDownloads,
  openDownload,
  saveDownload,
  type DownloadRecord,
} from "@/lib/browser/downloads";
import { hasNativeCriBrowser, openNativeCriBrowser } from "@/lib/browser/native";
import { backupNativeBrowserToCloud, syncNativeBrowserBeforeOpen } from "@/lib/browser/sync";

export const Route = createFileRoute("/navigateur")({
  head: () => ({
    meta: [
      { title: "CRI-BLO Browser" },
      {
        name: "description",
        content: "Navigateur terrain CRI-BLO avec historique, favoris et sessions persistantes.",
      },
    ],
  }),
  component: Navigateur,
});

// Stable target behind the Orange authentication URL supplied by the user.
// SiteMinder generates a fresh authentication URL when the saved session is no
// longer valid, so the permanent favorite does not freeze an expired login token.
const PINNED_ORANGE_URL = "https://mobi-prod.orange.fr/mobi2/web/home/?codeContexte=MOBI2";
const PINNED_ORANGE = { id: "pinned-orange", url: PINNED_ORANGE_URL, title: "Orange GeoReseaux" };

type BrowserEntry = { id: string; url: string; title: string };

let nativeLaunchInFlight = false;

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage is best effort. Native cookies/session storage is managed
    // separately by WKWebsiteDataStore / Android CookieManager.
  }
}

function initialBookmarks(): BrowserEntry[] {
  const stored = loadLocal<BrowserEntry[]>("criblo.browser.bookmarks", []);
  return [PINNED_ORANGE, ...stored.filter((item) => item.url !== PINNED_ORANGE_URL && item.id !== PINNED_ORANGE.id)];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

function Navigateur() {
  return hasNativeCriBrowser() ? <NativeNavigator /> : <WebNavigator />;
}

function NativeNavigator() {
  const mountedRef = useRef(true);
  const [opening, setOpening] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    try {
      localStorage.removeItem("criblo.browser.passwords");
    } catch {
      // ignore obsolete plaintext vault
    }
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const launch = useCallback(async () => {
    if (nativeLaunchInFlight) return;
    nativeLaunchInFlight = true;
    setOpening(true);
    setError(null);
    try {
      await syncNativeBrowserBeforeOpen().catch(() => "disabled" as const);
      const result = await openNativeCriBrowser(PINNED_ORANGE_URL, {
        longPressCompatibility: true,
        resumeLast: true,
      });
      if (result.url) {
        try {
          localStorage.setItem("criblo.browser.lastUrl", result.url);
        } catch {
          // native browser has its own persistent last-url store
        }
      }
      await backupNativeBrowserToCloud().catch(() => false);
      if (mountedRef.current) setSessionReady(true);
    } catch (cause) {
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : "Impossible d'ouvrir CRI-BLO Browser.");
      }
    } finally {
      nativeLaunchInFlight = false;
      if (mountedRef.current) setOpening(false);
    }
  }, []);

  useEffect(() => {
    void launch();
  }, [launch]);

  return (
    <AppShell title="Navigateur" subtitle="CRI-BLO Browser">
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-5 text-center">
        {opening ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Globe className="h-7 w-7 text-primary" />}
        <div>
          <p className="text-sm font-bold text-foreground">
            {opening ? "Ouverture du navigateur…" : sessionReady ? "Navigateur en arrière-plan" : "CRI-BLO Browser"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sur iPhone, utilisez le bouton ↓ du navigateur pour revenir à CRI-BLO sans fermer la page. En le reprenant, la même page, la carte, les onglets et la session restent ouverts.
          </p>
        </div>
        {error ? <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{error}</p> : null}
        {!opening ? (
          <button
            type="button"
            onClick={() => void launch()}
            className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground"
          >
            {sessionReady ? "Reprendre le navigateur" : "Ouvrir le navigateur"}
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}

function WebNavigator() {
  const [state, setState] = useState(() => getBrowserState());
  const [input, setInput] = useState(() => currentUrl());
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState<{ html: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [bookmarks, setBookmarks] = useState<BrowserEntry[]>(initialBookmarks);
  const [history, setHistory] = useState<BrowserEntry[]>(() => loadLocal("criblo.browser.history", []));

  const url = state.index >= 0 ? (state.stack[state.index] ?? "") : "";

  const loadDownloads = useCallback(async () => {
    setDownloads(await listDownloads());
  }, []);

  useEffect(() => {
    void loadDownloads();
    try {
      localStorage.removeItem("criblo.browser.passwords");
    } catch {
      // Remove legacy plaintext vault if present.
    }
  }, [loadDownloads]);

  useEffect(() => saveLocal("criblo.browser.bookmarks", bookmarks.filter((item) => item.id !== PINNED_ORANGE.id)), [bookmarks]);
  useEffect(() => saveLocal("criblo.browser.history", history), [history]);

  const open = useCallback((raw: string) => {
    const next = normalizeUrl(raw);
    if (!next) return;
    setState(pushUrl(next));
    setInput(next);
    setNotice(null);
    setEditing(false);
    setHistory((previous) => [
      { id: String(Date.now()), url: next, title: hostOf(next) },
      ...previous.filter((entry) => entry.url !== next),
    ].slice(0, 100));
  }, []);

  const download = useCallback(async (raw: string) => {
    const target = normalizeUrl(raw);
    if (!target) return;
    setDownloading(true);
    setNotice(null);
    try {
      const result = await downloadRemoteFile({ data: { url: target } });
      if (!result.ok) {
        setNotice(result.message);
        return;
      }
      await saveDownload({
        fileName: result.fileName,
        url: target,
        mimeType: result.mimeType,
        blob: base64ToBlob(result.base64, result.mimeType),
      });
      await loadDownloads();
      setNotice(`Téléchargé : ${result.fileName}`);
      setSheet(true);
    } catch {
      setNotice("Téléchargement impossible.");
    } finally {
      setDownloading(false);
    }
  }, [loadDownloads]);

  useEffect(() => {
    if (!url) {
      setPage(null);
      return;
    }
    const cached = getPageCache(url, state.reloadKey);
    if (cached) {
      setPage(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPage(null);
    void (async () => {
      try {
        const result = await openRemotePage({ data: { url } });
        if (cancelled) return;
        if (!result.ok) {
          setNotice(result.message);
          return;
        }
        if (result.kind === "file") {
          await saveDownload({
            fileName: result.fileName,
            url: result.finalUrl,
            mimeType: result.mimeType,
            blob: base64ToBlob(result.base64, result.mimeType),
          });
          await loadDownloads();
          setSheet(true);
          return;
        }
        setPageCache(url, state.reloadKey, result.html, result.title);
        setPage({ html: result.html, title: result.title });
      } catch {
        if (!cancelled) setNotice("Chargement impossible.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, state.reloadKey, loadDownloads]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { __briblo_nav?: string; download?: boolean } | null;
      if (!data || typeof data.__briblo_nav !== "string") return;
      if (data.download) void download(data.__briblo_nav);
      else open(data.__briblo_nav);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [download, open]);

  function toggleFavorite() {
    if (!url || url === PINNED_ORANGE_URL) return;
    setBookmarks((previous) =>
      previous.some((item) => item.url === url)
        ? previous.filter((item) => item.url !== url)
        : [...previous, { id: String(Date.now()), url, title: hostOf(url) }],
    );
  }

  return (
    <AppShell title="Navigateur" subtitle={url ? hostOf(url) : "CRI-BLO Browser"}>
      <div className="pb-28">
        {notice ? (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-border bg-card p-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Fermer"><X className="h-3 w-3" /></button>
          </div>
        ) : null}

        {page ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <iframe
              key={`${url}#${state.reloadKey}`}
              srcDoc={page.html}
              title={page.title}
              className="h-[65vh] w-full bg-white"
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : loading ? (
          <div className="flex h-[50vh] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Chargement de {hostOf(url)}…</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-bold"><Globe className="h-4 w-4 text-primary" /> Favoris</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {bookmarks.slice(0, 8).map((item) => (
                <button key={item.id} type="button" onClick={() => open(item.url)} className="rounded-xl border border-border bg-background p-3 text-left text-xs font-semibold">
                  <span className="block truncate">{item.title}</span>
                  <span className="mt-1 block truncate text-[10px] text-muted-foreground">{hostOf(item.url)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="fixed inset-x-0 z-30 border-t border-border/60 bg-surface/95 px-3 pt-2 backdrop-blur"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 3.75rem)" }}
      >
        <form
          className="mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            open(input);
          }}
        >
          {url && !editing ? <Lock className="h-3 w-3 text-success" /> : <Search className="h-3 w-3 text-muted-foreground" />}
          <input
            value={editing ? input : url ? hostOf(url) : input}
            onChange={(event) => setInput(event.target.value)}
            onFocus={(event) => {
              setEditing(true);
              setInput(url || input);
              requestAnimationFrame(() => event.target.select());
            }}
            onBlur={() => setEditing(false)}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Rechercher ou saisir une adresse"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
          <button type="submit" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><ArrowRight className="h-3 w-3" /></button>
        </form>
        <div className="mx-auto flex h-11 max-w-3xl items-center justify-around">
          <BottomButton label="Précédent" disabled={state.index <= 0} onClick={() => { const next = goBack(); setState(next); setInput(next.stack[next.index] ?? ""); }}><ArrowLeft className="h-4 w-4" /></BottomButton>
          <BottomButton label="Suivant" disabled={state.index >= state.stack.length - 1} onClick={() => { const next = goForward(); setState(next); setInput(next.stack[next.index] ?? ""); }}><ArrowRight className="h-4 w-4" /></BottomButton>
          <BottomButton label="Recharger" disabled={!url} onClick={() => setState(reload())}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}</BottomButton>
          <BottomButton label="Favori" disabled={!url} onClick={toggleFavorite}><Star className={`h-4 w-4 ${bookmarks.some((item) => item.url === url) ? "fill-current text-primary" : ""}`} /></BottomButton>
          <BottomButton label="Historique et téléchargements" onClick={() => setSheet(true)}><History className="h-4 w-4" /></BottomButton>
          <BottomButton label="Télécharger" disabled={!url || downloading} onClick={() => void download(url)}>{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}</BottomButton>
        </div>
      </div>

      {sheet ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setSheet(false)}>
          <div className="max-h-[72vh] w-full overflow-auto rounded-t-2xl bg-background p-3 safe-bottom" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <FolderDown className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">Bibliothèque navigateur</span>
              <button type="button" className="ml-auto" onClick={() => setSheet(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-card p-2">
                <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Favoris</div>
                {bookmarks.map((item) => <button key={item.id} type="button" onClick={() => { open(item.url); setSheet(false); }} className="block w-full truncate py-1 text-left text-xs text-primary">{item.title}</button>)}
              </div>
              <div className="rounded-xl border border-border bg-card p-2">
                <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Historique</div>
                {history.slice(0, 12).map((item) => <button key={item.id} type="button" onClick={() => { open(item.url); setSheet(false); }} className="block w-full truncate py-1 text-left text-xs text-primary">{item.title}</button>)}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase text-muted-foreground">Téléchargements</div>
              {downloads.length ? <button type="button" onClick={async () => { await clearDownloads(); void loadDownloads(); }} className="text-[10px] font-bold text-destructive"><Trash2 className="inline h-3 w-3" /> Tout supprimer</button> : null}
            </div>
            <div className="mt-1 space-y-1">
              {downloads.length === 0 ? <p className="text-xs text-muted-foreground">Aucun fichier téléchargé.</p> : downloads.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2">
                  <button type="button" onClick={() => openDownload(item)} className="min-w-0 flex-1 text-left"><div className="truncate text-xs font-bold">{item.fileName}</div></button>
                  <button type="button" onClick={async () => { await deleteDownload(item.id); void loadDownloads(); }} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function BottomButton({ children, label, onClick, disabled = false }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground active:scale-90 disabled:opacity-35">
      {children}
    </button>
  );
}
