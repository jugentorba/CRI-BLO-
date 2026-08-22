import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Plus, Star, History, KeyRound, Eye, EyeOff, Shield, Tabs, MoreHorizontal,
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

export const Route = createFileRoute("/navigateur")({
  head: () => ({
    meta: [
      { title: "Navigateur intégré — CRI BLO Assistant" },
      {
        name: "description",
        content:
          "Navigateur simple intégré à la PWA : ouvrir des sites, suivre les liens et télécharger des fichiers sans quitter l'application.",
      },
      { property: "og:title", content: "Navigateur intégré" },
      {
        property: "og:description",
        content: "Naviguez et téléchargez des documents sans quitter l'application terrain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Navigateur,
});

const SHORTCUTS = [
  { label: "Google", url: "https://www.google.com" },
  { label: "Orange", url: "https://www.orange.fr" },
  { label: "Météo France", url: "https://meteofrance.com" },
  { label: "Pages Jaunes", url: "https://www.pagesjaunes.fr" },
];

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}


type BrowserTab = { id: string; url: string; title: string; incognito?: boolean };
type PasswordEntry = { id: string; site: string; username: string; password: string };

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function saveLocal<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function Navigateur() {
  const [state, setState] = useState(() => getBrowserState());
  const [input, setInput] = useState(() => currentUrl());
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState<{ html: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [tabs, setTabs] = useState<BrowserTab[]>(() => loadLocal("criblo.browser.tabs", [{ id: crypto.randomUUID?.() ?? String(Date.now()), url: "", title: "Nouvel onglet" }]));
  const [activeTab, setActiveTab] = useState(0);
  const [bookmarks, setBookmarks] = useState<BrowserTab[]>(() => loadLocal("criblo.browser.bookmarks", []));
  const [history, setHistory] = useState<BrowserTab[]>(() => loadLocal("criblo.browser.history", []));
  const [passwords, setPasswords] = useState<PasswordEntry[]>(() => loadLocal("criblo.browser.passwords", []));
  const [passwordSheet, setPasswordSheet] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [incognito, setIncognito] = useState(false);

  const url = state.index >= 0 ? (state.stack[state.index] ?? "") : "";

  const loadDownloads = useCallback(async () => {
    setDownloads(await listDownloads());
  }, []);
  useEffect(() => {
    void loadDownloads();
  }, [loadDownloads]);
  useEffect(() => { saveLocal("criblo.browser.tabs", tabs); }, [tabs]);
  useEffect(() => { saveLocal("criblo.browser.bookmarks", bookmarks); }, [bookmarks]);
  useEffect(() => { if (!incognito) saveLocal("criblo.browser.history", history); }, [history, incognito]);
  useEffect(() => { saveLocal("criblo.browser.passwords", passwords); }, [passwords]);

  const open = useCallback((raw: string) => {
    const next = normalizeUrl(raw);
    if (!next) return;
    setState(pushUrl(next));
    setInput(next);
    setNotice(null);
    setEditing(false);
    setTabs((prev) => prev.map((t, i) => i === activeTab ? { ...t, url: next, title: hostOf(next) || "Nouvel onglet", incognito } : t));
    if (!incognito) setHistory((prev) => [{ id: String(Date.now()), url: next, title: hostOf(next) }, ...prev.filter((h) => h.url !== next)].slice(0, 100));
  }, [activeTab, incognito]);

  const download = useCallback(
    async (raw: string) => {
      const target = normalizeUrl(raw);
      if (!target) return;
      setDownloading(true);
      setNotice(null);
      try {
        const res = await downloadRemoteFile({ data: { url: target } });
        if (!res.ok) {
          setNotice(res.message);
          return;
        }
        await saveDownload({
          fileName: res.fileName,
          url: target,
          mimeType: res.mimeType,
          blob: base64ToBlob(res.base64, res.mimeType),
        });
        await loadDownloads();
        setNotice(`Téléchargé : ${res.fileName}`);
        setSheet(true);
      } catch {
        setNotice("Téléchargement impossible.");
      } finally {
        setDownloading(false);
      }
    },
    [loadDownloads],
  );

  // Chargement de la page via le proxy serveur (contourne les refus d'iframe).
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
        const res = await openRemotePage({ data: { url } });
        if (cancelled) return;
        if (!res.ok) {
          setNotice(res.message);
          return;
        }
        if (res.kind === "file") {
          await saveDownload({
            fileName: res.fileName,
            url: res.finalUrl,
            mimeType: res.mimeType,
            blob: base64ToBlob(res.base64, res.mimeType),
          });
          await loadDownloads();
          setNotice(`Fichier téléchargé : ${res.fileName}`);
          setSheet(true);
          return;
        }
        setPageCache(url, state.reloadKey, res.html, res.title);
        setPage({ html: res.html, title: res.title });
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

  // Liens et formulaires cliqués dans la page proxifiée.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { __briblo_nav?: string; download?: boolean } | null;
      if (!data || typeof data.__briblo_nav !== "string") return;
      if (data.download) void download(data.__briblo_nav);
      else open(data.__briblo_nav);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [download, open]);

  return (
    <AppShell title="Navigateur" subtitle={url ? hostOf(url) : "Navigation & téléchargements"}>
      {/* Barre d'adresse type navigateur mobile */}
      <div className="sticky top-0 z-10 -mx-3 mb-1.5 bg-background/95 px-3 pb-1.5 pt-0.5 backdrop-blur">
        <form
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-1.5 py-1 shadow-sm focus-within:border-primary"
          onSubmit={(e) => {
            e.preventDefault();
            open(input);
          }}
        >
          {url && !editing ? (
            <Lock className="ml-1 h-3 w-3 shrink-0 text-success" />
          ) : (
            <Search className="ml-1 h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <input
            value={editing ? input : url ? hostOf(url) : input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={(e) => {
              setEditing(true);
              setInput(url || input);
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => setEditing(false)}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Rechercher ou saisir une adresse"
            className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
          />
          {loading ? (
            <Loader2 className="mr-1 h-3 w-3 shrink-0 animate-spin text-primary" />
          ) : url ? (
            <button
              type="button"
              aria-label="Recharger"
              onClick={() => setState(reload())}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground active:scale-90"
            >
              <RotateCw className="h-3 w-3" />
            </button>
          ) : null}
          <button
            type="submit"
            aria-label="Ouvrir"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-90"
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        </form>

        <div className="mb-1 flex items-center gap-1 overflow-x-auto">
          {tabs.map((t, i) => (
            <button key={t.id} type="button" onClick={() => {
              setActiveTab(i);
              setState(t.url ? pushUrl(t.url) : getBrowserState());
              setInput(t.url);
            }} className={`flex min-w-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${i === activeTab ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}>
              <span className="max-w-24 truncate">{t.title}</span>{t.incognito && <Shield className="h-2.5 w-2.5" />}
              {tabs.length > 1 && <X className="h-2.5 w-2.5" onClick={(e) => { e.stopPropagation(); setTabs((p) => p.filter((_, j) => j !== i)); setActiveTab(Math.max(0, Math.min(activeTab, tabs.length - 2))); }} />}
            </button>
          ))}
          <button type="button" title="Nouvel onglet" onClick={() => {
            setTabs((p) => [...p, { id: crypto.randomUUID?.() ?? String(Date.now()), url: "", title: "Nouvel onglet", incognito }]);
            setActiveTab(tabs.length); setState(getBrowserState()); setInput("");
          }} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card"><Plus className="h-3 w-3" /></button>
          <button type="button" title="Navigation privée" onClick={() => setIncognito((v) => !v)} className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${incognito ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}><Shield className="h-3 w-3" /></button>
          <button type="button" title="Mots de passe" onClick={() => setPasswordSheet(true)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card"><KeyRound className="h-3 w-3" /></button>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <PillBtn
            label="Précédent"
            disabled={state.index <= 0}
            onClick={() => {
              const s = goBack();
              setState(s);
              setInput(s.stack[s.index] ?? "");
            }}
          >
            <ArrowLeft className="h-3 w-3" />
          </PillBtn>
          <PillBtn
            label="Suivant"
            disabled={state.index >= state.stack.length - 1}
            onClick={() => {
              const s = goForward();
              setState(s);
              setInput(s.stack[s.index] ?? "");
            }}
          >
            <ArrowRight className="h-3 w-3" />
          </PillBtn>
          <PillBtn label="Ajouter aux favoris" disabled={!url} onClick={() => {
            if (url) setBookmarks((p) => p.some((b) => b.url === url) ? p.filter((b) => b.url !== url) : [...p, { id: String(Date.now()), url, title: hostOf(url) }]);
          }}><Star className={`h-3 w-3 ${bookmarks.some((b) => b.url === url) ? "fill-current text-primary" : ""}`} /></PillBtn>
          <PillBtn label="Historique" onClick={() => setSheet(true)}><History className="h-3 w-3" /></PillBtn>
          <PillBtn
            label="Télécharger cette page"
            disabled={!url || downloading}
            onClick={() => void download(url)}
          >
            {downloading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
          </PillBtn>
          {url && (
            <span title="Navigation intégrée" className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 text-[10px] font-bold text-primary">
              <Globe className="h-3 w-3" /> Intégré
            </span>
          )}
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2 text-[10px] font-bold text-foreground active:scale-95"
          >
            <FolderDown className="h-3 w-3" />
            {downloads.length}
          </button>
        </div>
      </div>

      {notice && (
        <div className="mb-1.5 flex items-start gap-1.5 rounded-xl border border-border bg-card p-2 text-[11px] text-muted-foreground">
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" aria-label="Fermer" onClick={() => setNotice(null)}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {page ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <iframe
            key={`${url}#${state.reloadKey}`}
            srcDoc={page.html}
            title={page.title}
            className="h-[66vh] w-full bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : loading ? (
        <div className="flex h-[40vh] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-[11px] text-muted-foreground">Chargement de {hostOf(url)}…</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Globe className="h-3.5 w-3.5 text-primary" />
              Accès rapide
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {SHORTCUTS.map((s) => (
                <button
                  key={s.url}
                  type="button"
                  onClick={() => open(s.url)}
                  className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background px-2 py-2 text-left text-[11px] font-semibold text-foreground active:scale-[0.98]"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {s.label.charAt(0)}
                  </span>
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="rounded-xl border border-dashed border-border p-2.5 text-[11px] text-muted-foreground">
            Les pages s'affichent dans l'application. Si un site refuse l'affichage intégré,
            utilisez l'icône « onglet » ou téléchargez le fichier.
          </p>
        </div>
      )}

      {passwordSheet && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={() => setPasswordSheet(false)}>
          <div className="max-h-[78vh] w-full overflow-auto rounded-t-2xl border-t border-border bg-background p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <div className="text-sm font-bold">Mots de passe</div>
              <button type="button" className="ml-auto rounded-full border px-2 py-1 text-[10px]" onClick={() => {
                const site = prompt("Site / service");
                if (!site) return;
                const username = prompt("Identifiant") ?? "";
                const password = prompt("Mot de passe") ?? "";
                if (password) setPasswords((p) => [...p, { id: String(Date.now()), site, username, password }]);
              }}><Plus className="inline h-3 w-3" /> Ajouter</button>
              <button type="button" onClick={() => setPasswordSheet(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-2 rounded-lg bg-warning/10 p-2 text-[10px] text-muted-foreground">Coffre local de l'app. Les mots de passe restent sur cet appareil et ne sont pas envoyés au serveur.</p>
            <div className="space-y-1.5">
              {passwords.length === 0 ? <p className="text-xs text-muted-foreground">Aucun mot de passe enregistré.</p> : passwords.map((p) => (
                <div key={p.id} className="rounded-xl border border-border bg-card p-2">
                  <div className="flex items-center gap-2"><div className="min-w-0 flex-1"><div className="text-xs font-bold">{p.site}</div><div className="text-[10px] text-muted-foreground">{p.username}</div></div>
                    <button type="button" onClick={() => setShowPasswords((x) => ({ ...x, [p.id]: !x[p.id] }))}>{showPasswords[p.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                    <button type="button" onClick={() => setPasswords((x) => x.filter((v) => v.id !== p.id))}><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                  </div>
                  {showPasswords[p.id] && <div className="mt-1 rounded-md bg-muted px-2 py-1 font-mono text-xs select-all">{p.password}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Feuille des téléchargements */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setSheet(false)}>
          <div
            className="max-h-[70vh] w-full overflow-auto rounded-t-2xl border-t border-border bg-background p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <FolderDown className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">
                Bibliothèque navigateur
              </span>
              {downloads.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    await clearDownloads();
                    void loadDownloads();
                  }}
                  className="ml-auto inline-flex h-7 items-center gap-1 rounded-full border border-destructive/40 px-2 text-[10px] font-bold text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                  Tout supprimer
                </button>
              )}
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setSheet(false)}
                className={
                  "inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground " +
                  (downloads.length > 0 ? "" : "ml-auto")
                }
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-card p-2">
                <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Favoris</div>
                {bookmarks.length ? bookmarks.slice(-8).map((b) => <button key={b.id} type="button" onClick={() => { open(b.url); setSheet(false); }} className="block w-full truncate py-1 text-left text-[11px] text-primary">{b.title || hostOf(b.url)}</button>) : <div className="text-[10px] text-muted-foreground">Aucun favori</div>}
              </div>
              <div className="rounded-xl border border-border bg-card p-2">
                <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Historique</div>
                {history.length ? history.slice(0, 8).map((h) => <button key={h.id} type="button" onClick={() => { open(h.url); setSheet(false); }} className="block w-full truncate py-1 text-left text-[11px] text-primary">{h.title || hostOf(h.url)}</button>) : <div className="text-[10px] text-muted-foreground">Aucun historique</div>}
              </div>
            </div>
            <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Téléchargements</div>
            {downloads.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                Aucun fichier téléchargé.
              </p>
            ) : (
              <div className="space-y-1">
                {downloads.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-2"
                  >
                    <FolderDown className="h-3 w-3 shrink-0 text-primary" />
                    <button
                      type="button"
                      onClick={() => openDownload(d)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-xs font-bold text-foreground">{d.fileName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {Math.max(1, Math.round(d.size / 1024))} Ko ·{" "}
                        {new Date(d.createdAt).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer"
                      onClick={async () => {
                        await deleteDownload(d.id);
                        void loadDownloads();
                      }}
                      className="rounded-lg p-1 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function PillBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground active:scale-90 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
