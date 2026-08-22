import { useEffect, useState } from "react";
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw, AlertTriangle } from "lucide-react";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings/repository";
import { isOneDriveConfigured } from "@/lib/onedrive/config";
import { getCurrentAccount, login, logout } from "@/lib/onedrive/auth";
import { ensureAppFolders, getSignedInProfile } from "@/lib/onedrive/graph";
import { drainQueue, queueSize } from "@/lib/onedrive/queue";

export function OneDriveSection({
  settings,
  onSettings,
}: {
  settings: AppSettings;
  onSettings: (s: AppSettings) => void;
}) {
  const configured = isOneDriveConfigured();
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "disconnect" | "sync">(null);
  const [pending, setPending] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const refreshStatus = async () => {
    const acc = await getCurrentAccount();
    if (acc) {
      const p = await getSignedInProfile();
      setAccount(p?.mail || acc.username || "connecté");
    } else {
      setAccount(null);
    }
    setPending(await queueSize());
  };

  useEffect(() => {
    if (configured) void refreshStatus();
  }, [configured]);

  async function toggleSync(enabled: boolean) {
    const next = await saveSettings({ cloudSyncEnabled: enabled, cloudProvider: "onedrive" });
    onSettings(next);
  }

  async function doConnect() {
    setErr(null);
    setBusy("connect");
    try {
      await login();
      await ensureAppFolders();
      await refreshStatus();
      const next = await saveSettings({ cloudSyncEnabled: true, cloudProvider: "onedrive" });
      onSettings(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connexion Microsoft impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function doDisconnect() {
    setBusy("disconnect");
    try {
      await logout();
      await refreshStatus();
    } finally {
      setBusy(null);
    }
  }

  async function doSync() {
    setErr(null);
    setBusy("sync");
    try {
      const res = await drainQueue();
      await refreshStatus();
      const next = await getSettings();
      onSettings(next);
      if (res.failed > 0) setErr(`Certains fichiers n'ont pas pu être synchronisés (${res.failed}).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Synchronisation impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Synchronisation cloud
      </h2>

      {!configured && (
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Configuration OneDrive requise</div>
            <div className="mt-0.5 opacity-80">
              Un administrateur doit renseigner <code>VITE_AZURE_CLIENT_ID</code> (enregistrement
              d'application Azure) pour activer la synchronisation OneDrive.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Cloud className="h-4 w-4 text-primary" /> Microsoft OneDrive
        </div>

        {/* ON / OFF */}
        <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-background p-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">Cloud Sync</div>
            <div className="text-xs text-muted-foreground">
              Copier les brouillons, Excel et ZIP dans votre OneDrive personnel.
            </div>
          </div>
          <input
            type="checkbox"
            checked={!!settings.cloudSyncEnabled}
            disabled={!configured}
            onChange={(e) => toggleSync(e.target.checked)}
            className="sr-only"
          />
          <span
            className={
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition " +
              (settings.cloudSyncEnabled ? "bg-primary" : "bg-muted")
            }
          >
            <span
              className={
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition " +
                (settings.cloudSyncEnabled ? "translate-x-6" : "translate-x-1")
              }
            />
          </span>
        </label>

        {/* Status */}
        <div className="mb-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Compte</span>
            <span className="font-medium text-foreground">
              {account ?? <span className="text-muted-foreground">Non connecté</span>}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Statut</span>
            <span className="font-medium text-foreground">
              {pending > 0 ? `${pending} en attente` : "À jour"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dernière synchronisation</span>
            <span className="font-medium text-foreground">
              {settings.lastSyncAt
                ? new Date(settings.lastSyncAt).toLocaleString("fr-FR")
                : "—"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid gap-2">
          {!account ? (
            <button
              type="button"
              disabled={!configured || busy !== null}
              onClick={doConnect}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              {busy === "connect" ? "Connexion…" : "Connecter OneDrive"}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy !== null}
                onClick={doSync}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={"h-4 w-4 " + (busy === "sync" ? "animate-spin" : "")} />
                {busy === "sync" ? "Synchronisation…" : "Synchroniser maintenant"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={doDisconnect}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition active:scale-95 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                {busy === "disconnect" ? "Déconnexion…" : "Déconnecter"}
              </button>
            </>
          )}
        </div>

        {err && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-900 dark:text-red-200">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </div>
    </section>
  );
}
