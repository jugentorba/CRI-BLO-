import { cn } from "@/lib/utils";

type Value = true | false | "na" | undefined;

export function YesNoButtons({
  value,
  onChange,
  allowNA = false,
}: {
  value: Value;
  onChange: (v: Value) => void;
  allowNA?: boolean;
}) {
  const items: { v: Value; label: string }[] = [
    { v: true, label: "Oui" },
    { v: false, label: "Non" },
  ];
  if (allowNA) items.push({ v: "na", label: "N/A" });
  return (
    <div className={cn("grid gap-2", allowNA ? "grid-cols-3" : "grid-cols-2")}>
      {items.map((it) => {
        const active = value === it.v;
        return (
          <button
            key={String(it.v)}
            type="button"
            onClick={() => onChange(active ? undefined : it.v)}
            className={cn(
              "h-12 rounded-xl border text-sm font-bold transition active:scale-95",
              active
                ? it.v === true
                  ? "border-success bg-success text-success-foreground"
                  : it.v === false
                    ? "border-destructive bg-destructive text-destructive-foreground"
                    : "border-muted-foreground bg-muted-foreground text-background"
                : "border-border bg-card text-foreground hover:border-primary/40",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
