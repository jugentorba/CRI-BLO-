import { cn } from "@/lib/utils";

type Value = true | false | "na" | "N/A" | undefined;

type Item = {
  v: true | false | "N/A";
  label: string;
};

export function YesNoButtons({
  value,
  onChange,
}: {
  value: Value;
  onChange: (value: Value) => void;
  /** Kept for source compatibility; CRI-BLO now exposes N/A on every Yes/No field. */
  allowNA?: boolean;
}) {
  const items: Item[] = [
    { v: true, label: "Oui" },
    { v: false, label: "Non" },
    { v: "N/A", label: "N/A" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        // `na` remains readable for records created by older CRI-BLO versions,
        // while every new selection is stored as the exact literal `N/A`.
        const active =
          item.v === "N/A" ? value === "N/A" || value === "na" : value === item.v;
        return (
          <button
            key={String(item.v)}
            type="button"
            onClick={() => onChange(active ? undefined : item.v)}
            className={cn(
              "h-12 rounded-xl border text-sm font-bold transition active:scale-95",
              active
                ? item.v === true
                  ? "border-success bg-success text-success-foreground"
                  : item.v === false
                    ? "border-destructive bg-destructive text-destructive-foreground"
                    : "border-muted-foreground bg-muted-foreground text-background"
                : "border-border bg-card text-foreground hover:border-primary/40",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
