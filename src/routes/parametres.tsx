import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, UserCircle2, FolderOpen, Save, Camera, ImageIcon, Languages, Zap, Sun, Moon, Monitor, Rows3, LayoutGrid, Minimize2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getProfile, saveProfile } from "@/lib/profile/repository";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings/repository";
import { isFolderPickerSupported, pickExportFolder } from "@/lib/export/folder";
import { OneDriveSection } from "@/components/OneDriveSection";
import { uploadDeviceSnapshot, restoreDeviceSnapshot } from "@/lib/onedrive/sync";
import { openPermissionsDialog } from "@/components/PermissionSetupDialog";

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
  const [company, setCompany] = useState("");
  const [lastName, setLastName] = useState("");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    void getProfile().then((p) => {
      setCompany(p?.company ?? "");
      setLastName(p?.lastName ?? "");
    });
    void getSettings().then(setSettings);
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
      alert("Votre navigateur ne supporte pas le choix de dossier. Les exports seront téléchargés.");
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

  if (!settings) return <AppShell title="Paramètres" showBack><div /></AppShell>;

  return (
    <AppShell title="Paramètres" subtitle="Profil et préférences" showBack>
      <form onSubmit={saveAll} className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Profil technicien</h2>
          <div className="space-y-3">
            <Field icon={Building2} label="Entreprise" value={company} onChange={setCompany} placeholder="Ex : Circet" />
            <Field icon={UserCircle2} label="Nom du technicien" value={lastName} onChange={setLastName} placeholder="Ex : Dupont" autoCapitalize="words" />
          </div>
          <button
            type="submit"
            className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition active:scale-[0.98]"
          >
            <Save className="h-3 w-3" /> {saved ? "Enregistré" : "Enregistrer le profil"}
          </button>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Autorisations</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" /> Caméra, Localisation &amp; Fichiers
            </div>
            <p className="text-xs text-muted-foreground">
              Vérifiez et accordez les autorisations requises par l'application. Si une autorisation a été refusée, vous pouvez l'activer directement depuis les Réglages du téléphone.
            </p>
            <button
              type="button"
              onClick={openPermissionsDialog}
              className="mt-3 h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground transition active:scale-95"
            >
              Gérer les autorisations
            </button>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Saisie</h2>
          <Toggle
            icon={Zap}
            label="Auto Save"
            description="Sauvegarder automatiquement pendant l'édition."
            checked={settings.autoSave}
            onChange={(v) => patchSettings({ autoSave: v })}
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Photos</h2>
          <Toggle
            icon={ImageIcon}
            label="Sauvegarder dans la galerie"
            description="Télécharger chaque photo dans la galerie du téléphone."
            checked={settings.saveToGallery}
            onChange={(v) => patchSettings({ saveToGallery: v })}
          />
          <Toggle
            icon={Camera}
            label="Watermark"
            description="Apposer date, heure et adresse complète sur chaque photo."
            checked={settings.watermark}
            onChange={(v) => patchSettings({ watermark: v })}
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Export</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderOpen className="h-4 w-4 text-primary" /> Dossier CRI BLO
            </div>
            <div className="text-xs text-muted-foreground">
              {settings.exportFolderName
                ? `Actuel : ${settings.exportFolderName}`
                : isFolderPickerSupported()
                  ? "Aucun dossier CRI BLO choisi. Il sera demandé au premier export puis réutilisé automatiquement."
                  : "Non supporté — fichiers téléchargés dans Téléchargements."}
            </div>
            <button
              type="button"
              disabled={folderBusy}
              onClick={chooseFolder}
              className="mt-3 h-11 w-full rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition active:scale-95 disabled:opacity-50"
            >
              {settings.exportFolderName ? "Changer le dossier CRI BLO" : "Choisir le dossier CRI BLO"}
            </button>
          </div>
        </section>

        <OneDriveSection settings={settings} onSettings={setSettings} />

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Synchronisation multi-appareils</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
            <p className="text-xs text-muted-foreground">Sauvegardez vos données Criblo dans votre OneDrive puis restaurez-les sur votre téléphone ou tablette connectés au même compte.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={syncBusy} onClick={async () => {
                setSyncBusy(true); setSyncMessage(null);
                try { const r = await uploadDeviceSnapshot(); setSyncMessage(`Synchronisé ${Math.round(r.size / 1024)} Ko.`); await patchSettings({ cloudSyncEnabled: true, lastSyncAt: r.at }); }
                catch (e) { setSyncMessage(e instanceof Error ? e.message : "Synchronisation impossible."); }
                finally { setSyncBusy(false); }
              }} className="h-10 rounded-xl bg-primary text-xs font-bold text-primary-foreground disabled:opacity-50">{syncBusy ? "…" : "Sauvegarder dans le cloud"}</button>
              <button type="button" disabled={syncBusy} onClick={async () => {
                if (!confirm("Restaurer les données cloud sur cet appareil ? Les données locales portant les mêmes identifiants seront remplacées.")) return;
                setSyncBusy(true); setSyncMessage(null);
                try { const r = await restoreDeviceSnapshot(); setSyncMessage(`Restauration terminée (${Math.round(r.size / 1024)} Ko). Rechargez l'application.`); }
                catch (e) { setSyncMessage(e instanceof Error ? e.message : "Restauration impossible."); }
                finally { setSyncBusy(false); }
              }} className="h-10 rounded-xl border border-border bg-background text-xs font-bold disabled:opacity-50">Restaurer du cloud</button>
            </div>
            {settings.lastSyncAt && <div className="mt-2 text-[10px] text-muted-foreground">Dernière synchro : {new Date(settings.lastSyncAt).toLocaleString("fr-FR")}</div>}
            {syncMessage && <div className="mt-2 rounded-lg bg-primary/5 p-2 text-[10px] text-muted-foreground">{syncMessage}</div>}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">IA indépendante</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)] space-y-2">
            <p className="text-xs text-muted-foreground">Utilisez votre propre endpoint compatible OpenAI. Si aucun endpoint n'est configuré, l'Assistant conserve son fonctionnement existant.</p>
            <input value={settings.aiEndpoint ?? ""} onChange={e => patchSettings({ aiEndpoint: e.target.value })} placeholder="https://votre-endpoint/v1/chat/completions" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" />
            <input value={settings.aiModel ?? "gpt-4o-mini"} onChange={e => patchSettings({ aiModel: e.target.value })} placeholder="Modèle" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" />
            <input type="password" value={settings.aiApiKey ?? ""} onChange={e => patchSettings({ aiApiKey: e.target.value })} placeholder="Clé API (stockée localement)" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Apparence</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "system", label: "Système", Icon: Monitor },
                { v: "light", label: "Clair", Icon: Sun },
                { v: "dark", label: "Sombre", Icon: Moon },
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

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Densité d'affichage</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "comfortable", label: "Confortable", Icon: LayoutGrid },
                { v: "compact", label: "Compacte", Icon: Rows3 },
                { v: "very-compact", label: "Très compacte", Icon: Minimize2 },
              ] as const).map(({ v, label, Icon }) => {
                const active = settings.density === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => patchSettings({ density: v })}
                    className={
                      "flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px] font-semibold transition active:scale-95 " +
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
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-foreground">
                <span>Échelle personnalisée</span>
                <span className="tabular-nums text-primary">{settings.scale}%</span>
              </div>
              <input
                type="range"
                min={80}
                max={130}
                step={5}
                value={settings.scale}
                onChange={(e) => patchSettings({ scale: Number(e.target.value) })}
                className="w-full accent-[color:var(--color-primary)]"
              />
              <div className="mt-1 flex justify-between text-[10px] uppercase text-muted-foreground">
                <span>80%</span>
                <span>100%</span>
                <span>130%</span>
              </div>
              <button
                type="button"
                onClick={() => patchSettings({ scale: 100 })}
                className="mt-2 h-9 w-full rounded-lg border border-border bg-background text-xs font-semibold text-foreground transition active:scale-95"
              >
                Réinitialiser à 100%
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Langue</h2>
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Languages className="h-4 w-4 text-primary" /> Langue de l'application
            </div>
            <select
              value={settings.language}
              onChange={(e) => patchSettings({ language: e.target.value as "fr" | "en" })}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="fr">Français</option>
              <option value="en">English (à venir)</option>
            </select>
          </div>
        </section>
      </form>

      <p className="mt-8 text-center text-xs text-muted-foreground">CRI BLO Assistant · Orange France</p>
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
