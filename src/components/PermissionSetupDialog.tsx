import { useEffect, useRef, useState } from "react";
import { Camera, Check, ExternalLink, FileUp, MapPin, ShieldCheck, X } from "lucide-react";
import { getSettings, saveSettings } from "@/lib/settings/repository";

/** Emitted by the Settings page to re-open this dialog. */
const REOPEN_EVENT = "criblo:open-permissions";

export function openPermissionsDialog() {
  window.dispatchEvent(new CustomEvent(REOPEN_EVENT));
}

export function PermissionSetupDialog() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<"unknown" | "granted" | "denied">("unknown");
  const [camera, setCamera] = useState<"unknown" | "granted" | "denied">("unknown");
  const [files, setFiles] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getSettings().then((s) => {
      if (!s.permissionsOnboardingDone) setOpen(true);
    });

    // Re-check live permission state when the dialog is opened from Settings
    async function checkCurrentState() {
      if (navigator.permissions) {
        const [loc, cam] = await Promise.allSettled([
          navigator.permissions.query({ name: "geolocation" as PermissionName }),
          navigator.permissions.query({ name: "camera" as PermissionName }),
        ]);
        if (loc.status === "fulfilled") {
          setLocation(loc.value.state === "granted" ? "granted" : loc.value.state === "denied" ? "denied" : "unknown");
        }
        if (cam.status === "fulfilled") {
          setCamera(cam.value.state === "granted" ? "granted" : cam.value.state === "denied" ? "denied" : "unknown");
        }
      }
    }

    function handleReopen() {
      void checkCurrentState();
      setFiles(false);
      setOpen(true);
    }

    window.addEventListener(REOPEN_EVENT, handleReopen);
    return () => window.removeEventListener(REOPEN_EVENT, handleReopen);
  }, []);

  async function requestLocation() {
    if (!navigator.geolocation) { setLocation("denied"); return; }
    navigator.geolocation.getCurrentPosition(
      () => setLocation("granted"),
      () => setLocation("denied"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function requestCamera() {
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ video: true, audio: false });
      stream?.getTracks().forEach((t) => t.stop());
      setCamera("granted");
    } catch {
      setCamera("denied");
    }
  }

  function openPhoneSettings() {
    // Deep-link attempt for Android/iOS — falls back to no-op on desktop
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) {
      window.location.href = "intent://settings#Intent;scheme=android-app;end";
    } else if (/iphone|ipad/i.test(ua)) {
      window.location.href = "app-settings:";
    } else {
      alert("Ouvrez les Réglages de votre appareil et autorisez l'accès à la caméra et la localisation pour CRI BLO.");
    }
  }

  async function finish() {
    await saveSettings({ permissionsOnboardingDone: true });
    setOpen(false);
  }

  if (!open) return null;

  const allGranted = location === "granted" && camera === "granted" && files;
  const anyDenied = location === "denied" || camera === "denied";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl bg-card p-5 shadow-[var(--shadow-elevated)]">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <button type="button" onClick={() => void finish()} className="rounded-full p-1 text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="text-xl font-bold text-foreground">Autorisations CRI BLO</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Autorisez les fonctions nécessaires. Si un accès est refusé, ouvrez les Réglages de votre téléphone pour le réactiver manuellement.
        </p>

        <div className="mt-4 space-y-2">
          <PermissionRow icon={MapPin} title="Localisation GPS" status={location} onClick={() => void requestLocation()} />
          <PermissionRow icon={Camera} title="Caméra" status={camera} onClick={() => void requestCamera()} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left"
          >
            <FileUp className="h-5 w-5 text-primary" />
            <span className="flex-1">
              <span className="block text-sm font-bold">Photos et fichiers</span>
              <span className="block text-[11px] text-muted-foreground">
                {files ? "Accès accordé" : "Ouvre le sélecteur sécurisé du téléphone."}
              </span>
            </span>
            {files && <Check className="h-5 w-5 text-green-500" />}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={() => setFiles(true)} />
        </div>

        {anyDenied && (
          <button
            type="button"
            onClick={openPhoneSettings}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 py-2.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ouvrir les Réglages du téléphone
          </button>
        )}

        <button
          type="button"
          onClick={() => void finish()}
          className={
            "mt-4 h-12 w-full rounded-2xl text-sm font-bold text-primary-foreground transition " +
            (allGranted ? "bg-primary" : "bg-primary/60")
          }
        >
          {allGranted ? "Continuer" : "Continuer plus tard"}
        </button>
      </div>
    </div>
  );
}

function PermissionRow({
  icon: Icon,
  title,
  status,
  onClick,
}: {
  icon: typeof MapPin;
  title: string;
  status: "unknown" | "granted" | "denied";
  onClick: () => void;
}) {
  const label =
    status === "granted"
      ? "Autorisé ✓"
      : status === "denied"
        ? "Refusé — appuyez pour réessayer"
        : "Appuyez pour autoriser";

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98] " +
        (status === "denied"
          ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
          : status === "granted"
            ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
            : "border-border bg-background")
      }
    >
      <Icon
        className={
          "h-5 w-5 " +
          (status === "denied" ? "text-red-500" : status === "granted" ? "text-green-500" : "text-primary")
        }
      />
      <span className="flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{label}</span>
      </span>
      {status === "granted" && <Check className="h-5 w-5 text-green-500" />}
    </button>
  );
}
