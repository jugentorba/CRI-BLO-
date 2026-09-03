import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Sélectionner…",
}: {
  value?: string;
  options: string[];
  onChange: (v: string | undefined) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selectableOptions = useMemo(
    () => (options.includes("N/A") ? options : ["N/A", ...options]),
    [options],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return selectableOptions;
    const q = query.trim().toLowerCase();
    return selectableOptions.filter((o) => o.toLowerCase().includes(q));
  }, [selectableOptions, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-full items-center justify-between rounded-xl border border-border bg-background px-3 text-base text-foreground transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              className="rounded p-1 hover:bg-muted"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </div>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-elevated)]">
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="h-9 flex-1 bg-transparent text-base outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">Aucun résultat</li>
            )}
            {filtered.map((o) => {
              const active = o === value;
              return (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex h-9 w-full items-center justify-between px-3 text-left text-sm transition hover:bg-muted",
                      active && "bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    <span>{o}</span>
                    {active && <Check className="h-3 w-3" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
