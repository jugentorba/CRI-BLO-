import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { History, Search, MapPin, Clock, WifiOff, Trash2, FileText, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { deleteCri, listCris } from "@/lib/cri/repository";
import { deleteAllPhotosForCri } from "@/lib/photos/repository";
import { initAddressQueueWatcher } from "@/lib/geo/queue";
import type { CriRecord } from "@/lib/cri/types";
import { cn } from "@/lib/utils";
import { listOtherDocs } from "@/lib/docs/repository";

export const Route = createFileRoute("/historique")({
  head: () => ({
    meta: [
      { title: "Historique — CRI BLO Assistant" },
      { name: "description", content: "Historique des CRI BLO." },
    ],
  }),
  component: Historique,
});

type Tab = "choose" | "cri" | "other" | "drafts" | "exported" | "all";


function normalizeCri(c: CriRecord): CriRecord {
  return {
    ...c,
    address: c.address ?? {},
    photos: c.photos ?? {},
    values: c.values ?? {},
  };
}

function Historique() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CriRecord[]>([]);
  const [tab, setTab] = useState<Tab>("choose");
  const [otherCount, setOtherCount] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [list, others] = await Promise.all([listCris(), listOtherDocs()]);
      setItems(list.map(normalizeCri));
      setOtherCount(others.length);
    } catch (e) {
      console.error("[historique] load failed", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    try {
      initAddressQueueWatcher(() => void load());
    } catch (e) {
      console.error("[historique] watcher init failed", e);
    }
  }, []);

  const filtered = useMemo(() => {
    return items
      .filter((c) => {
        if (tab === "drafts") return c.status !== "exported";
        if (tab === "exported") return c.status === "exported";
        return true;
      })
      .filter((c) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          (c.reference || "").toLowerCase().includes(q) ||
          (c.address?.commune ?? "").toLowerCase().includes(q)
        );
      });
  }, [items, tab, query]);

  const draftCount = items.filter((c) => c.status !== "exported").length;
  const exportedCount = items.filter((c) => c.status === "exported").length;

  if (tab === "choose") {
    return (
      <AppShell title="Historique" subtitle="Choisissez le module" showBack>
        <div className="space-y-3">
          <button type="button" onClick={() => setTab("cri")} className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><History className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1"><span className="block text-base font-bold">CRI BLO</span><span className="block text-xs text-muted-foreground">{items.length} document{items.length === 1 ? "" : "s"} · brouillons et exportés</span></span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => setTab("other")} className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileText className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1"><span className="block text-base font-bold">Autres documents</span><span className="block text-xs text-muted-foreground">{otherCount} document{otherCount === 1 ? "" : "s"} · historique indépendant</span></span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </AppShell>
    );
  }

  if (tab === "other") {
    return <OtherHistory onBack={() => setTab("choose")} />;
  }

  return (
    <AppShell title="Historique · CRI BLO" subtitle={`${items.length} CRI`} showBack>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (référence, commune…)"
          className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm shadow-[var(--shadow-card)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <TabBtn active={tab === "drafts"} onClick={() => setTab("drafts")}>Brouillons ({draftCount})</TabBtn>
        <TabBtn active={tab === "exported"} onClick={() => setTab("exported")}>Exportés ({exportedCount})</TabBtn>
        <TabBtn active={tab === "all"} onClick={() => setTab("all")}>Tous</TabBtn>
      </div>

      {loading ? (
        <div className="mt-10 text-center text-sm text-muted-foreground">Chargement…</div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="font-bold">Erreur de chargement de l'historique</div>
          <div className="mt-1 break-words">{error}</div>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground"
          >
            Réessayer
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map((cri) => (
            <CriCard
              key={cri.id}
              cri={cri}
              onOpen={() => navigate({ to: "/cri/$id", params: { id: cri.id } })}
              onDelete={async () => {
                if (!confirm("Supprimer ce CRI ?")) return;
                try {
                  await deleteAllPhotosForCri(cri.id);
                } catch (e) {
                  console.error("[historique] delete photos failed", e);
                }
                await deleteCri(cri.id);
                await load();
              }}
            />
          ))}
        </ul>
      )}
    </AppShell>
  );
}


function OtherHistory({ onBack }: { onBack: () => void }) {
  const [docs, setDocs] = useState<Awaited<ReturnType<typeof listOtherDocs>>>([]);
  useEffect(() => { void listOtherDocs().then(setDocs); }, []);
  return (
    <AppShell title="Historique · Autres documents" subtitle={`${docs.length} document${docs.length === 1 ? "" : "s"}`}>
      <button type="button" onClick={onBack} className="mb-3 text-xs font-bold text-primary">← Choisir un autre historique</button>
      {docs.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Aucun autre document enregistré.</div> : (
        <ul className="space-y-3">
          {docs.map((d) => (
            <li key={d.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="truncate text-sm font-bold text-foreground">{d.fileName}</div>
              <div className="mt-1 text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString("fr-FR")} · {d.kind.toUpperCase()}</div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 rounded-xl text-xs font-bold transition active:scale-95",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CriCard({ cri, onOpen, onDelete }: { cri: CriRecord; onOpen: () => void; onDelete: () => void }) {
  const date = new Date(cri.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const address = cri.address ?? {};
  const addr =
    [address.streetNumber, address.street].filter(Boolean).join(" ") +
    (address.commune ? ` · ${address.postalCode ?? ""} ${address.commune}` : "");
  const photoCount = Object.keys(cri.photos ?? {}).length;
  return (
    <li className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold text-foreground">{cri.reference || "(sans référence)"}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {date}
            </div>
          </div>
          <StatusPill cri={cri} />
        </div>
        <div className="mt-3 flex items-start gap-2 text-sm text-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 break-words">
            {addr.trim() || <span className="italic text-muted-foreground">Adresse à compléter</span>}
          </span>
        </div>
        {photoCount > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">{photoCount} photo{photoCount > 1 ? "s" : ""}</div>
        )}
      </button>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </button>
      </div>
    </li>
  );
}

function StatusPill({ cri }: { cri: CriRecord }) {
  if (cri.status === "exported") {
    return (
      <span className="inline-flex shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-success">
        Exporté
      </span>
    );
  }
  if (cri.addressStatus === "pending") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-bold uppercase text-warning">
        <WifiOff className="h-3 w-3" /> En attente
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      Brouillon
    </span>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <History className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-bold text-foreground">Aucun CRI</h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        Démarrez depuis l'accueil.
      </p>
    </div>
  );
}
