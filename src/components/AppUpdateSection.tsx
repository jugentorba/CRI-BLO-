import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Smartphone } from "lucide-react";
import {
  checkForAppUpdate,
  CRI_BLO_VERSION,
  refreshPwaServiceWorker,
  type AppUpdateInfo,
} from "@/lib/updates/github";
import { canInstallUpdateNatively, downloadAndInstallUpdate } from "@/lib/updates/native";

export function AppUpdateSection() {
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<AppUpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    setError(null);
    setInstallMessage(null);
    try {
      await refreshPwaServiceWorker();
      const info = await checkForAppUpdate();
      setResult(info);

      // On Android, one tap should be enough: once a newer signed APK is found,
      // immediately start the native download/install flow. The explicit button
      // below remains available as a retry path.
      if (
        info.updateAvailable &&
        info.platform === "android" &&
        info.downloadUrl &&
        canInstallUpdateNatively()
      ) {
        await openUpdate(info);
      }
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Impossible de vérifier les mises à jour.");
    } finally {
      setChecking(false);
    }
  }

  async function openUpdate(info: AppUpdateInfo) {
    const url = info.downloadUrl || info.releaseUrl;
    setError(null);
    setInstallMessage(null);

    if (info.platform === "android" && info.downloadUrl && canInstallUpdateNatively()) {
      setInstalling(true);
      try {
        const nativeResult = await downloadAndInstallUpdate(
          info.downloadUrl,
          info.downloadName || "CRI-BLO.apk",
          info.downloadSize,
        );
        if (nativeResult.status === "permission_required") {
          setInstallMessage(
            "Android a ouvert l'autorisation « Installer des applications inconnues ». Autorisez CRI BLO, revenez ici puis appuyez de nouveau sur Installer.",
          );
        } else {
          setInstallMessage(
            "APK téléchargé. Android a ouvert l'installateur : confirmez la mise à jour pour conserver vos données.",
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Téléchargement de la mise à jour impossible.");
      } finally {
        setInstalling(false);
      }
      return;
    }

    window.location.assign(url);
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Mise à jour de l'application
      </h2>
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-foreground">CRI-BLO {CRI_BLO_VERSION}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Vérifie la dernière version signée publiée dans GitHub Releases.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void check()}
          disabled={checking || installing}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-bold text-foreground transition active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={"h-4 w-4 " + (checking ? "animate-spin" : "")} />
          {checking ? "Vérification…" : "Vérifier les mises à jour"}
        </button>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{error}</span>
          </div>
        )}

        {installMessage && (
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
            {installMessage}
          </div>
        )}

        {result && !result.updateAvailable && (
          <div className="mt-3 rounded-xl border border-success/30 bg-success/10 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Vous avez déjà la dernière version ({result.latestVersion}).
            </div>
          </div>
        )}

        {result?.updateAvailable && (
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="text-sm font-bold text-foreground">
              Nouvelle version {result.latestVersion}
            </div>
            {result.releaseName !== result.latestVersion && (
              <div className="mt-0.5 text-xs text-muted-foreground">{result.releaseName}</div>
            )}
            {result.platform === "android" && !result.downloadUrl && (
              <div className="mt-2 text-xs text-warning">
                La version est publiée, mais aucun APK signé n'est attaché à cette release.
              </div>
            )}
            {result.platform === "ios" && (
              <div className="mt-2 text-xs text-muted-foreground">
                Sur iPhone/iPad, l'installation doit utiliser une distribution iOS signée.
              </div>
            )}
            <button
              type="button"
              onClick={() => void openUpdate(result)}
              disabled={installing || (result.platform === "android" && !result.downloadUrl)}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50"
            >
              {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {installing
                ? "Téléchargement de l'APK…"
                : result.platform === "android" && result.downloadUrl && canInstallUpdateNatively()
                  ? "Télécharger et installer"
                  : result.platform === "android" && result.downloadUrl
                    ? `Télécharger ${result.downloadName ?? "l'APK"}`
                    : "Ouvrir la nouvelle version"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
