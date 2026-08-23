import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, UserCircle2, FolderOpen, Save, Camera, ImageIcon, Zap, Sun, Moon, Monitor, Globe, LogOut, User, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getProfile, saveProfile } from "@/lib/profile/repository";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings/repository";
import { isFolderPickerSupported, pickExportFolder } from "@/lib/export/folder";
import { OneDriveSection } from "@/components/OneDriveSection";
import { uploadDeviceSnapshot, restoreDeviceSnapshot } from "@/lib/onedrive/sync";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { Lang } from "@/lib/i18n/translations";
import { signInGoogle, signInMicrosoft, signOut, getStoredUser, type CloudUser } from "@/lib/sync/auth";

export const Route = createFileRoute("/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres — CRI BLO Assistant" },
      { name: "description", content: "Profil, photos, dossier export." },
    ],
  }),
  component: Parametres,
});

function Parametres() {
  const { t, lang, setLang } = useI18n();
  const [company, setCompany] = useState("");
  const [lastName, setLastName] = useState("");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => {
    void getProfile().then((p) => {
      setCompany(p?.company ?? "");
      setLastName(p?.lastName ?? "");
    });
    void getSettings().then(setSettings);
    setCloudUser(getStoredUser());
  }, []);

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    await saveProfile({ company: company.trim(), lastName: lastName.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function patchSettings(patch: Partial<AppSettings>) {
    const next = await saveSettings(patch);
    setSettings(next);
  }

  async function chooseFolder() {
    if (!isFolderPickerSupported()) {
      alert(t.settings_folder_unsupported);
      return;
    }
    setFolderBusy(true);
    try {
      const h = await pickExportFolder();
      if (h) setSettings(await getSettings());
    } catch {
      /* annulé */
    } finally {
      setFolderBusy(false);
    }
  }

  async function handleSignIn(provider: "google" | "microsoft") {
    setCloudBusy(true);
    setSyncMessage(null);
    try {
      const user = provider === "google" ? await signInGoogle() : await signInMicrosoft();
      setCloudUser(user);
      await patchSettings({ cloudSyncEnabled: true });
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : t.error);
    } finally {
      setCloudBusy(false);
    }
  }

  function handleSignOut() {
    signOut();
    setCloudUser(null);
    void patchSettings({ cloudSyncEnabled: false });
  }

  if (!settings) return <AppShell title={t.settings_title} showBack><div /></AppShell>;

  return (
    <AppShell title={t.settings_title} subtitle={t.settings_subtitle} showBack>
      <form onSubmit={saveAll} className="space-y-6">
        {/* Language */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t.settings_language}</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Globe className="h-4 w-4 text-primary" /> {t.settings_language_desc}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "fr" as Lang, label: "Français" },
                { v: "en" as Lang, label: "English" },
                { v: "sq" as Lang, label: "Shqip" },
              ]).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => void setLang(v)}
                  className={
                    "flex h-10 items-center justify-center rounded-lg border text-xs font-semibold transition active:scale-95 " +
                    (lang === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:border-primary/40")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Profile */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t.settings_profile}</h2>
          <div className="space-y-3">
            <Field icon={Building2} label={t.settings_company} value={company} onChange={setCompany} placeholder="Ex : Circet" />
            <Field icon={UserCircle2} label={t.settings_technician} value={lastName} onChange={setLastName} placeholder="Ex : Dupont" autoCapitalize="words" />
          </div>
          <button
            type="submit"
            className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition active:scale-[0.98]"
          >
            <Save className="h-3 w-3" /> {saved ? t.settings_saved : t.settings_save_profile}
          </button>
        </section>

        {/* Input */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Saisie</h2>
          <Toggle icon={Zap} label={t.settings_autosave} description={t.settings_autosave_desc} checked={settings.autoSave} onChange={(v) => patchSettings({ autoSave: v })} />
        </section>

        {/* Photos */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t.settings_photos}</h2>
          <Toggle icon={ImageIcon} label={t.settings_gallery} description={t.settings_gallery_desc} checked={settings.saveToGallery} onChange={(v) => patchSettings({ saveToGallery: v })} />
          <Toggle icon={Camera} label={t.settings_watermark} description={t.settings_watermark_desc} checked={settings.watermark} onChange={(v) => patchSettings({ watermark: v })} />
        </section>

        {/* Export / folder */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t.settings_export}</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderOpen className="h-4 w-4 text-primary" /> {t.settings_folder_criblo}
            </div>
            <div className="text-xs text-muted-foreground">
              {settings.exportFolderName
                ? `${t.settings_folder_current} ${settings.exportFolderName}`
                : isFolderPickerSupported()
                  ? t.settings_folder_none
                  : t.settings_folder_unsupported}
            </div>
            <button
              type="button"
              disabled={folderBusy}
              onClick={chooseFolder}
              className="mt-3 h-11 w-full rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition active:scale-95 disabled:opacity-50"
            >
              {settings.exportFolderName ? t.settings_change_folder : t.settings_choose_folder}
            </button>
          </div>
        </section>

        {/* Cloud sync – Google / Microsoft / Guest */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t.settings_cloud_sync}</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)] space-y-3">
            <p className="text-xs text-muted-foreground">{t.settings_cloud_sync_desc}</p>

            {cloudUser ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <User className="h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-foreground">{t.settings_signed_in_as}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{cloudUser.email} ({cloudUser.provider})</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={syncBusy} onClick={async () => {
                    setSyncBusy(true); setSyncMessage(null);
                    try { const r = await uploadDeviceSnapshot(); setSyncMessage(`✓ ${Math.round(r.size / 1024)} Ko`); await patchSettings({ cloudSyncEnabled: true, lastSyncAt: r.at }); }
                    catch (e) { setSyncMessage(e instanceof Error ? e.message : "Erreur"); }
                    finally { setSyncBusy(false); }
                  }} className="h-10 rounded-xl bg-primary text-xs font-bold text-primary-foreground disabled:opacity-50">{syncBusy ? "…" : t.settings_save_cloud}</button>
                  <button type="button" disabled={syncBusy} onClick={async () => {
                    if (!confirm(t.settings_clear_cache_confirm)) return;
                    setSyncBusy(true); setSyncMessage(null);
                    try { const r = await restoreDeviceSnapshot(); setSyncMessage(`✓ ${Math.round(r.size / 1024)} Ko`); }
                    catch (e) { setSyncMessage(e instanceof Error ? e.message : "Erreur"); }
                    finally { setSyncBusy(false); }
                  }} className="h-10 rounded-xl border border-border bg-background text-xs font-bold disabled:opacity-50">{t.settings_restore_cloud}</button>
                </div>
                {settings.lastSyncAt && <div className="text-[10px] text-muted-foreground">{t.settings_last_sync} {new Date(settings.lastSyncAt).toLocaleString()}</div>}
                {syncMessage && <div className="rounded-lg bg-primary/5 p-2 text-[10px] text-muted-foreground">{syncMessage}</div>}
                <button type="button" onClick={handleSignOut} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-xs font-semibold text-foreground">
                  <LogOut className="h-3 w-3" /> {t.settings_sign_out}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Guest mode indicator */}
                <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-3">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-foreground">{t.settings_guest_mode}</div>
                    <div className="text-[11px] text-muted-foreground">{t.settings_guest_desc}</div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={cloudBusy}
                  onClick={() => void handleSignIn("google")}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition hover:border-primary/40 active:scale-95 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {t.settings_sign_in_google}
                </button>
                <button
                  type="button"
                  disabled={cloudBusy}
                  onClick={() => void handleSignIn("microsoft")}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition hover:border-primary/40 active:scale-95 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 23 23" aria-hidden="true">
                    <path fill="#f35325" d="M1 1h10v10H1z"/>
                    <path fill="#81bc06" d="M12 1h10v10H12z"/>
                    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                    <path fill="#ffba08" d="M12 12h10v10H12z"/>
                  </svg>
                  {t.settings_sign_in_microsoft}
                </button>
                {syncMessage && <div className="rounded-lg bg-destructive/10 p-2 text-[10px] text-destructive">{syncMessage}</div>}
              </div>
            )}
          </div>
        </section>

        <OneDriveSection settings={settings} onSettings={setSettings} />

        {/* AI */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t.settings_ai}</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)] space-y-2">
            <p className="text-xs text-muted-foreground">{t.settings_ai_desc}</p>
            <input value={settings.aiEndpoint ?? ""} onChange={e => patchSettings({ aiEndpoint: e.target.value })} placeholder="https://your-endpoint/v1/chat/completions" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" />
            <input value={settings.aiModel ?? "gpt-4o-mini"} onChange={e => patchSettings({ aiModel: e.target.value })} placeholder="Model" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" />
            <input type="password" value={settings.aiApiKey ?? ""} onChange={e => patchSettings({ aiApiKey: e.target.value })} placeholder="API key (stored locally)" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" />
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t.settings_appearance}</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "system", label: t.settings_theme_system, Icon: Monitor },
                { v: "light", label: t.settings_theme_light, Icon: Sun },
                { v: "dark", label: t.settings_theme_dark, Icon: Moon },
              ] as const).map(({ v, label, Icon }) => {
                const active = settings.theme === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => patchSettings({ theme: v })}
                    className={
                      "flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border text-xs font-semibold transition active:scale-95 " +
                      (active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/40")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Version */}
        <p className="mt-2 text-center text-xs text-muted-foreground">CRI BLO Assistant · v2 · Orange</p>
      </form>
    </AppShell>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)]">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

function Toggle({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: typeof Zap;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-3 flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)]">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        className={
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition " +
          (checked ? "bg-primary" : "bg-muted")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition " +
            (checked ? "translate-x-6" : "translate-x-1")
          }
        />
      </span>
    </label>
  );
}
