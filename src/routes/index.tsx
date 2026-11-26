import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  FilePlus2,
  History,
  Clock,
  WifiOff,
  Cloud,
  CloudOff,
  ChevronRight,
  FileUp,
  CheckCircle2,
  Files,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { countToday, createCri, listCris } from "@/lib/cri/repository";
import { initAddressQueueWatcher } from "@/lib/geo/queue";
import { useOnline } from "@/hooks/use-online";
import { getProfile } from "@/lib/profile/repository";
import { getSettings } from "@/lib/settings/repository";
import { isOneDriveConfigured } from "@/lib/onedrive/config";
import { isGoogleDriveConfigured } from "@/lib/google/config";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { PermissionSetupDialog } from "@/components/PermissionSetupDialog";
import type { CriRecord } from "@/lib/cri/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CRI BLO Assistant — Accueil" },
      {
        name: "description",
        content:
          "Assistant terrain CRI BLO : nouveau compte-rendu, brouillons, historique et synchronisation cloud.",
      },
      { property: "og:title", content: "CRI BLO Assistant — Accueil" },
      {
        property: "og:description",
        content: "Créez, complétez et exportez vos CRI BLO SAV, même hors-ligne.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Accueil,
});

function label(c: CriRecord): string {
  const ref = ((c.values?.referenceOrange as string) || c.reference || "").trim();
  const commune = ((c.values?.commune as string) || c.address?.commune || "").trim();
  return [ref || "Sans référence", commune].filter(Boolean).join(" · ");
}

function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

function Accueil() {
  const navigate = useNavigate();
  const online = useOnline();
  const [today, setToday] = useState(0);
  const [cris, setCris] = useState<CriRecord[]>([]);
  const [cloud, setCloud] = useState<{
    enabled: boolean;
    lastBackupAt?: string;
    error?: string;
  }>({ enabled: false });
  const [creating, setCreating] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);
  const [permsDone, setPermsDone] = useState(true);

  async function load() {
    const [t, all, s] = await Promise.all([countToday(), listCris(), getSettings()]);
    setToday(t);
    setCris(all);
    // « Cloud actif » doit vouloir dire « réellement configuré », pas juste
    // « la case est cochée ».
    const providerReady =
      s.cloudProvider === "onedrive"
        ? isOneDriveConfigured()
        : s.cloudProvider === "google-drive"
          ? isGoogleDriveConfigured()
          : !!s.cloudFolderName;
    setCloud({
      enabled: !!s.cloudSyncEnabled && providerReady,
      lastBackupAt: s.lastCloudBackupAt,
      error: s.lastCloudError,
    });
    setPermsDone(!!s.permissionsOnboardingDone);
  }

  useEffect(() => {
    void load();
    initAddressQueueWatcher(() => void load());
    const onBackup = () => void load();
    window.addEventListener("criblo:auto-backup", onBackup);
    return () => window.removeEventListener("criblo:auto-backup", onBackup);
  }, []);

  const drafts = cris.filter((c) => c.status !== "exported");
  const recent = cris.slice(0, 5);

  async function startNew() {
    setCreating(true);
    const profile = await getProfile();
    const record = await createCri({
      interventionAt: new Date().toISOString(),
      reference: "",
      gps: null,
      address: {},
      addressStatus: "failed",
      technician: { company: profile?.company, lastName: profile?.lastName },
      status: "draft",
      values: {
        interventionStart: new Date().toISOString(),
        company: profile?.company,
        technicianName: profile?.lastName,
      },
      photos: {},
    });
    navigate({ to: "/cri/$id", params: { id: record.id } });
  }

  return (
    <AppShell title="CRI BLO Assistant" subtitle="Prêt pour l'intervention">
      <OnboardingDialog />
      <PermissionSetupDialog
        open={permsOpen}
        onClose={() => {
          setPermsOpen(false);
          void load();
        }}
      />

      {!permsDone && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/5 p-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-foreground">Autorisations</div>
            <div className="text-[10px] leading-tight text-muted-foreground">
              Caméra, localisation, fichiers — demandées seulement quand vous les utilisez.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPermsOpen(true)}
            className="h-8 shrink-0 rounded-lg border border-primary/40 bg-background px-2 text-[10px] font-bold text-primary active:scale-95"
          >
            Configurer
          </button>
        </div>
      )}

      {/* État : réseau + cloud, très compact */}
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold">
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 " +
            (online ? "bg-success/10 text-success" : "bg-warning/15 text-warning")
          }
        >
          {online ? <Cloud className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {online ? "En ligne" : "Hors-ligne"}
        </span>
        <Link
          to="/parametres"
          title={
            cloud.error
              ? `Sauvegarde cloud : ${cloud.error}`
              : cloud.enabled
                ? "Sauvegarde cloud configurée"
                : "Configurer la sauvegarde cloud"
          }
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 active:scale-95 " +
            (cloud.error
              ? "bg-warning/15 text-warning"
              : cloud.enabled
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground")
          }
        >
          {cloud.enabled && !cloud.error ? (
            <Cloud className="h-3 w-3" />
          ) : (
            <CloudOff className="h-3 w-3" />
          )}
          {cloud.error
            ? "Cloud : à vérifier"
            : cloud.enabled
              ? cloud.lastBackupAt
                ? `Cloud · ${timeAgo(cloud.lastBackupAt)}`
                : "Cloud actif"
              : "Cloud inactif"}
        </Link>
        <span className="ml-auto text-muted-foreground">Aujourd'hui : {today}</span>
      </div>

      <button
        type="button"
        onClick={startNew}
        disabled={creating}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-[var(--shadow-elevated)] transition active:scale-[0.98] disabled:opacity-70"
      >
        <FilePlus2 className="h-3.5 w-3.5" />
        Nouveau CRI BLO
      </button>

      {drafts.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-warning">
            <Clock className="h-3 w-3" />
            Brouillons ({drafts.length})
          </h2>
          <div className="space-y-1">
            {drafts.slice(0, 4).map((c) => (
              <CriRow key={c.id} cri={c} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-4">
        <h2 className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <History className="h-3 w-3" />
          Récents
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            Aucun CRI BLO pour le moment.
          </p>
        ) : (
          <div className="space-y-1">
            {recent.map((c) => (
              <CriRow key={c.id} cri={c} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-1.5">
        <QuickLink to="/importer" icon={FileUp} title="Importer un CRI BLO" />
        <QuickLink to="/documents" icon={Files} title="Autres documents" />
      </section>


      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        Orange France · Outil terrain
      </p>
    </AppShell>
  );
}

function CriRow({ cri }: { cri: CriRecord }) {
  const exported = cri.status === "exported";
  return (
    <Link
      to="/cri/$id"
      params={{ id: cri.id }}
      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-2 transition active:scale-[0.99] hover:border-primary/40"
    >
      {exported ? (
        <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
      ) : (
        <Clock className="h-3 w-3 shrink-0 text-warning" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold text-foreground">{label(cri)}</div>
        <div className="text-[10px] text-muted-foreground">
          {exported ? "Exporté" : "Brouillon"} · {when(cri.interventionAt || cri.createdAt)}
        </div>
      </div>
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function QuickLink({
  to,
  icon: Icon,
  title,
}: {
  to: "/importer" | "/documents";
  icon: typeof History;
  title: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-card px-1 py-2 text-center text-[10px] font-semibold leading-tight text-foreground transition active:scale-[0.98] hover:border-primary/40"
    >
      <Icon className="h-3.5 w-3.5 text-primary" />
      {title}
    </Link>
  );
}
