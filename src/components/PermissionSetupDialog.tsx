import { useEffect, useRef, useState } from "react";
import { Camera, Check, FileUp, MapPin, ShieldCheck } from "lucide-react";
import { getSettings, saveSettings } from "@/lib/settings/repository";
import { useI18n } from "@/lib/i18n/use-i18n";

export function PermissionSetupDialog() {
  const { t } = useI18n();
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
      stream?.getTracks().forEach((tk) => tk.stop());
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
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-foreground">{t.perms_title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.perms_subtitle}</p>
        <div className="mt-4 space-y-2">
          <PermissionRow
            icon={MapPin}
            title={t.perms_location}
            description={t.perms_location_desc}
            status={location}
            grantedLabel={t.perms_granted}
            deniedLabel={t.perms_denied}
            allowLabel={t.perms_allow}
            onClick={() => void requestLocation()}
          />
          <PermissionRow
            icon={Camera}
            title={t.perms_camera}
            description={t.perms_camera_desc}
            status={camera}
            grantedLabel={t.perms_granted}
            deniedLabel={t.perms_denied}
            allowLabel={t.perms_allow}
            onClick={() => void requestCamera()}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left"
          >
            <FileUp className="h-5 w-5 text-primary" />
            <span className="flex-1">
              <span className="block text-sm font-bold">{t.perms_files}</span>
              <span className="block text-[11px] text-muted-foreground">{t.perms_files_desc}</span>
            </span>
            {files && <Check className="h-5 w-5 text-success" />}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={() => setFiles(true)} />
        </div>
        <button
          type="button"
          onClick={() => void finish()}
          disabled={!done}
          className="mt-4 h-12 w-full rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {t.perms_continue}
        </button>
        {!done && (
          <button
            type="button"
            onClick={() => void finish()}
            className="mt-2 w-full text-xs font-semibold text-muted-foreground"
          >
            {t.perms_skip}
          </button>
        )}
      </div>
    </div>
  );
}

function PermissionRow({
  icon: Icon,
  title,
  description,
  status,
  grantedLabel,
  deniedLabel,
  allowLabel,
  onClick,
}: {
  icon: typeof MapPin;
  title: string;
  description: string;
  status: "unknown" | "granted" | "denied";
  grantedLabel: string;
  deniedLabel: string;
  allowLabel: string;
  onClick: () => void;
}) {
  const label = status === "granted" ? grantedLabel : status === "denied" ? deniedLabel : allowLabel;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left"
    >
      <Icon className="h-5 w-5 text-primary" />
      <span className="flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{description}</span>
        <span className={`block text-[11px] font-semibold ${status === "granted" ? "text-success" : status === "denied" ? "text-destructive" : "text-primary"}`}>
          {label}
        </span>
      </span>
      {status === "granted" && <Check className="h-5 w-5 text-success" />}
    </button>
  );
}

