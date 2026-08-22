import { useEffect, useRef, useState } from "react";
import { Camera, Check, FileUp, MapPin, ShieldCheck } from "lucide-react";
import { getSettings, saveSettings } from "@/lib/settings/repository";

export function PermissionSetupDialog() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<"unknown" | "granted" | "denied">("unknown");
  const [camera, setCamera] = useState<"unknown" | "granted" | "denied">("unknown");
  const [files, setFiles] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getSettings().then((s) => setOpen(!s.permissionsOnboardingDone));
  }, []);

  async function requestLocation() {
    if (!navigator.geolocation) return setLocation("denied");
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

  async function finish() {
    await saveSettings({ permissionsOnboardingDone: true });
    setOpen(false);
  }

  if (!open) return null;
  const done = location !== "unknown" && camera !== "unknown" && files;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl bg-card p-5 shadow-[var(--shadow-elevated)]">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div>
        <h2 className="text-xl font-bold text-foreground">Autorisations CRI BLO</h2>
        <p className="mt-1 text-sm text-muted-foreground">Autorisez les fonctions nécessaires à la première utilisation. Vous pourrez modifier ces autorisations dans les réglages du téléphone.</p>
        <div className="mt-4 space-y-2">
          <PermissionRow icon={MapPin} title="Localisation" status={location} onClick={() => void requestLocation()} />
          <PermissionRow icon={Camera} title="Caméra" status={camera} onClick={() => void requestCamera()} />
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left">
            <FileUp className="h-5 w-5 text-primary" /><span className="flex-1"><span className="block text-sm font-bold">Photos et fichiers</span><span className="block text-[11px] text-muted-foreground">Ouvre le sélecteur sécurisé du téléphone.</span></span>{files && <Check className="h-5 w-5 text-success" />}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={() => setFiles(true)} />
        </div>
        <button type="button" onClick={() => void finish()} disabled={!done} className="mt-4 h-12 w-full rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">Continuer</button>
        {!done && <button type="button" onClick={() => void finish()} className="mt-2 w-full text-xs font-semibold text-muted-foreground">Continuer plus tard</button>}
      </div>
    </div>
  );
}

function PermissionRow({ icon: Icon, title, status, onClick }: { icon: typeof MapPin; title: string; status: "unknown" | "granted" | "denied"; onClick: () => void }) {
  const label = status === "granted" ? "Autorisé" : status === "denied" ? "Refusé — réessayer" : "Autoriser";
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left"><Icon className="h-5 w-5 text-primary" /><span className="flex-1"><span className="block text-sm font-bold">{title}</span><span className="block text-[11px] text-muted-foreground">{label}</span></span>{status === "granted" && <Check className="h-5 w-5 text-success" />}</button>;
}
