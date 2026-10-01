import { useEffect, useState } from "react";
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw, AlertTriangle } from "lucide-react";
import { saveSettings, type AppSettings } from "@/lib/settings/repository";
import { isGoogleDriveConfigured } from "@/lib/google/config";
import { getGoogleProfile, loginGoogleDrive, logoutGoogleDrive } from "@/lib/google/auth";
import { uploadGoogleDeviceSnapshot, restoreGoogleDeviceSnapshot } from "@/lib/google/sync";
import { clearCloudBackupDirty, markCloudBackupDirty } from "@/lib/cloud/auto-backup";

export function GoogleDriveSection({
  settings,
  onSettings,
}: {
  settings: AppSettings;
  onSettings: (s: AppSettings) => void;
}) {
  const configured = isGoogleDriveConfigured();
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "disconnect" | "backup" | "restore">(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(interactive = false) {
    if (!configured) {
      setAccount(null);
      return;
    }
    const p = await getGoogleProfile(interactive);
    setAccount(p?.email || null);
  }

  useEffect(() => {
    void refresh(false);
  }, [configured]);

  async function connect() {
    setBusy("connect");
    setMessage(null);
    try {
      await loginGoogleDrive();
      await refresh(false);
      const next = await saveSettings({
        cloudProvider: "google-drive",
        cloudSyncEnabled: true,
        cloudAutoBackupEnabled: true,
      });
      markCloudBackupDirty();
      onSettings(next);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Connexion Google impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await logoutGoogleDrive();
      setAccount(null);
    } finally {
      setBusy(null);
    }
  }

  async function backup() {
    setBusy("backup");
    setMessage(null);
    try {
      const r = await uploadGoogleDeviceSnapshot();
      clearCloudBackupDirty();
      const next = await saveSettings({
        cloudProvider: "google-drive",
        cloudSyncEnabled: true,
        cloudAutoBackupEnabled: true,
        lastCloudBackupAt: r.at,
      });
      onSettings(next);
      setMessage(
        `Sauvegarde Google Drive terminée (${Math.max(1, Math.round(r.size / 1024))} Ko).`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sauvegarde Google Drive impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!confirm("Restaurer la sauvegarde Google Drive sur cet appareil ?")) return;
    setBusy("restore");
    setMessage(null);
    try {
      const r = await restoreGoogleDeviceSnapshot();
      setMessage(
        `Restauration terminée (${Math.max(1, Math.round(r.size / 1024))} Ko). Rechargez l'application.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Restauration Google Drive impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Google Drive
      </h2>

      {!configured && (
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Google Drive indisponible dans cette version</div>
            <div className="mt-0.5 opacity-80">
              La configuration Google appartient à l'application CRI BLO. L'utilisateur n'a rien à saisir.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Cloud className="h-4 w-4 text-primary" /> Google Drive
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Connectez votre propre compte Google. Chaque utilisateur sauvegarde ses données CRI BLO
          dans son propre espace privé Google Drive.
        </p>

        <div className="mb-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Compte</span>
            <span className="font-medium text-foreground">{account ?? "Non connecté"}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">Stockage</span>
            <span className="font-medium text-foreground">Dossier privé de l’application</span>
          </div>
        </div>

        {!account ? (
          <button
            type="button"
            disabled={!configured || busy !== null}
            onClick={() => void connect()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {busy === "connect" ? "Connexion…" : "Connecter mon Google Drive"}
          </button>
        ) : (
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void backup()}
                className="h-10 rounded-xl bg-primary text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy === "backup" ? "Sauvegarde…" : "Sauvegarder"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void restore()}
                className="h-10 rounded-xl border border-border bg-background text-xs font-bold disabled:opacity-50"
              >
                {busy === "restore" ? "Restauration…" : "Restaurer"}
              </button>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void disconnect()}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background text-xs font-semibold disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> Déconnecter Google
            </button>
          </div>
        )}

        {message && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-primary/5 p-2 text-xs text-muted-foreground">
            {message.toLowerCase().includes("impossible") ? (
              <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}
      </div>
    </section>
  );
}
