import { cn } from "@/lib/utils";

type Value = true | false | "na" | "N/A" | undefined;

type Item = {
  v: true | false | "N/A";
  label: string;
};

export function YesNoButtons({
  value,
  onChange,
  allowNA = false,
}: {
  value: Value;
  onChange: (value: Value) => void;
  allowNA?: boolean;
}) {
  const items: Item[] = [
    { v: true, label: "Oui" },
    { v: false, label: "Non" },
  ];
  if (allowNA) items.push({ v: "N/A", label: "N/A" });

  return (
    <div className={cn("grid gap-2", allowNA ? "grid-cols-3" : "grid-cols-2")}>
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
