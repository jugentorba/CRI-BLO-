import { useEffect, useState } from "react";
import { Building2, UserCircle2, ArrowRight } from "lucide-react";
import { getProfile, isProfileComplete, saveProfile } from "@/lib/profile/repository";

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getProfile().then((p) => {
      if (!isProfileComplete(p)) setOpen(true);
      else {
        setCompany(p?.company ?? "");
        setLastName(p?.lastName ?? "");
      }
    });
  }, []);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim() || !lastName.trim()) return;
    setBusy(true);
    await saveProfile({ company: company.trim(), lastName: lastName.trim() });
    setBusy(false);
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl bg-card p-6 shadow-[var(--shadow-elevated)]"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
          <UserCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Bienvenue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Renseignez votre profil. Ces informations seront pré-remplies sur chaque CRI BLO.
        </p>

        <div className="mt-5 space-y-3">
          <Field
            icon={Building2}
            label="Entreprise"
            value={company}
            onChange={setCompany}
            placeholder="Ex : Circet, Scopelec, SPIE…"
            autoFocus
          />
          <Field
            icon={UserCircle2}
            label="Nom du technicien"
            value={lastName}
            onChange={setLastName}
            placeholder="Ex : Dupont"
            autoCapitalize="words"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !company.trim() || !lastName.trim()}
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-[var(--shadow-elevated)] transition active:scale-[0.98] disabled:opacity-50"
        >
          Commencer
          <ArrowRight className="h-5 w-5" />
        </button>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Modifiable à tout moment dans Paramètres.
        </p>
      </form>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  autoCapitalize,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoCapitalize?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        className="h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}
