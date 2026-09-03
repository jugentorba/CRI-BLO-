import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { fr } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type PickerMode = "date" | "time";

interface DateTimePickerProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  label?: string;
  datePlaceholder?: string;
  timePlaceholder?: string;
}

export function DateTimePicker({
  value,
  onChange,
  label,
  datePlaceholder = "JJ/MM/AAAA",
  timePlaceholder = "HH:MM",
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>("date");
  const [draft, setDraft] = useState<Date>(() => parseDate(value) ?? new Date());
  const isNA = value === "N/A" || value === "na";

  useEffect(() => {
    if (!open) return;
    setDraft(parseDate(value) ?? new Date());
  }, [open, value]);

  const displayDate = useMemo(() => {
    if (isNA) return "N/A";
    const date = parseDate(value);
    if (!date) return datePlaceholder;
    return formatDate(date);
  }, [value, datePlaceholder, isNA]);

  const displayTime = useMemo(() => {
    if (isNA) return "N/A";
    const date = parseDate(value);
    if (!date) return timePlaceholder;
    return formatTime(date);
  }, [value, timePlaceholder, isNA]);

  function commit() {
    onChange(draft.toISOString());
    setOpen(false);
  }

  return (
    <div className="space-y-1.5">
      {label && <div className="text-xs font-semibold text-foreground">{label}</div>}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            setMode("date");
            setOpen(true);
          }}
          className={cn(
            "h-12 rounded-xl border bg-card px-3 text-left transition active:scale-[0.99]",
            value ? "border-border" : "border-border/70 text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm font-semibold">{displayDate}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("time");
            setOpen(true);
          }}
          className={cn(
            "h-12 rounded-xl border bg-card px-3 text-left transition active:scale-[0.99]",
            value ? "border-border" : "border-border/70 text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm font-semibold">{displayTime}</span>
          </span>
        </button>
      </div>

      <button
        type="button"
        aria-pressed={isNA}
        onClick={() => onChange(isNA ? undefined : "N/A")}
        className={cn(
          "h-9 w-full rounded-lg border text-xs font-bold transition active:scale-[0.99]",
          isNA
            ? "border-muted-foreground bg-muted-foreground text-background"
            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary",
        )}
      >
        N/A
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-[calc(100vw-28px)] max-w-[390px] overflow-hidden rounded-2xl border-0 p-0 shadow-2xl"
          aria-describedby={undefined}
        >
          <div className="bg-primary px-5 pb-4 pt-4 text-primary-foreground">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
              {mode === "date" ? "Date d’intervention" : "Heure d’intervention"}
            </div>
            <div className="mt-1 text-4xl font-light tracking-tight">{formatTime(draft)}</div>
            <div className="mt-1 text-base font-semibold capitalize opacity-95">
              {formatHeaderDate(draft)}
            </div>
          </div>

          <div className="bg-background">
            <div className="grid grid-cols-2 border-b border-border">
              <PickerTab active={mode === "date"} onClick={() => setMode("date")} icon={<CalendarDays className="h-4 w-4" />}>
                DATE
              </PickerTab>
              <PickerTab active={mode === "time"} onClick={() => setMode("time")} icon={<Clock3 className="h-4 w-4" />}>
                HEURE
              </PickerTab>
            </div>

            {mode === "date" ? (
              <div className="flex justify-center px-2 py-3">
                <Calendar
                  mode="single"
                  locale={fr}
                  selected={draft}
                  onSelect={(next) => {
                    if (next) {
                      const nextDate = new Date(draft);
                      nextDate.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
                      setDraft(nextDate);
                    }
                  }}
                  weekStartsOn={1}
                  showOutsideDays
                  captionLayout="label"
                  className="[--cell-size:2.65rem] p-2"
                  classNames={{
                    month_caption: "flex h-(--cell-size) items-center justify-center px-10",
                    caption_label: "text-base font-bold capitalize",
                    weekday: "flex-1 select-none text-center text-xs font-semibold text-muted-foreground",
                    day: "relative h-(--cell-size) w-(--cell-size) p-0 text-center text-sm",
                  }}
                />
              </div>
            ) : (
              <ClockPicker value={draft} onChange={setDraft} />
            )}

            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-xl px-4 text-sm font-bold text-muted-foreground transition hover:bg-muted active:scale-95"
              >
                ANNULER
              </button>
              <button
                type="button"
                onClick={commit}
                className="h-10 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition active:scale-95"
              >
                OK
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PickerTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-11 items-center justify-center gap-2 text-xs font-bold tracking-wide transition",
        active ? "border-b-2 border-primary text-primary" : "text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ClockPicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const [part, setPart] = useState<"hour" | "minute">("hour");
  const hour = value.getHours();
  const minute = value.getMinutes();

  function chooseHour(nextHour: number) {
    const next = new Date(value);
    next.setHours(nextHour);
    onChange(next);
    setPart("minute");
  }

  function chooseMinute(nextMinute: number) {
    const next = new Date(value);
    next.setMinutes(nextMinute);
    onChange(next);
  }

  const hourOuter = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const hourInner = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <div className="px-4 py-4">
      <div className="mx-auto mb-3 flex w-fit items-center gap-1 rounded-full bg-muted p-1">
        <button
          type="button"
          onClick={() => setPart("hour")}
          className={cn("rounded-full px-4 py-1.5 text-sm font-bold", part === "hour" ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
        >
          {String(hour).padStart(2, "0")}
        </button>
        <span className="text-muted-foreground">:</span>
        <button
          type="button"
          onClick={() => setPart("minute")}
          className={cn("rounded-full px-4 py-1.5 text-sm font-bold", part === "minute" ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
        >
          {String(minute).padStart(2, "0")}
        </button>
      </div>

      <div className="relative mx-auto h-[280px] w-[280px] rounded-full bg-muted/70">
        {part === "hour"
          ? [...hourOuter.map((n, i) => ({ n, i, inner: false })), ...hourInner.map((n, i) => ({ n, i, inner: true }))].map(({ n, i, inner }) => {
              const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
              const radius = inner ? 86 : 116;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              const active = hour === n;
              return (
                <ClockButton
                  key={`${inner ? "i" : "o"}-${n}`}
                  label={String(n).padStart(2, "0")}
                  active={active}
                  style={{ left: `calc(50% + ${x}px - 18px)`, top: `calc(50% + ${y}px - 18px)` }}
                  onClick={() => chooseHour(n)}
                  inner={inner}
                />
              );
            })
          : minutes.map((n, i) => {
              const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
              const radius = 116;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              return (
                <ClockButton
                  key={n}
                  label={String(n).padStart(2, "0")}
                  active={minute === n}
                  style={{ left: `calc(50% + ${x}px - 18px)`, top: `calc(50% + ${y}px - 18px)` }}
                  onClick={() => chooseMinute(n)}
                />
              );
            })}
        <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
      </div>

      {part === "minute" && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button type="button" onClick={() => chooseMinute(Math.max(0, minute - 5))} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Minutes précédentes"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xs font-semibold text-muted-foreground">Choisir les minutes</span>
          <button type="button" onClick={() => chooseMinute(Math.min(55, minute + 5))} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Minutes suivantes"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

function ClockButton({
  label,
  active,
  style,
  onClick,
  inner = false,
}: {
  label: string;
  active: boolean;
  style: CSSProperties;
  onClick: () => void;
  inner?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={cn(
        "absolute z-10 flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition active:scale-90",
        active ? "bg-primary text-primary-foreground shadow-md" : inner ? "text-muted-foreground hover:bg-background" : "text-foreground hover:bg-background",
      )}
    >
      {label}
    </button>
  );
}

function parseDate(value?: string): Date | undefined {
  if (!value || value === "N/A" || value === "na") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatHeaderDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(date);
}
