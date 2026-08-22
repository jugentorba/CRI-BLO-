import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Loader2, CloudOff, Cloud, RefreshCw, Check } from "lucide-react";
import { improveComment } from "@/lib/ai/comment.functions";
import { composeOfflineComment, type CommentStyle, type CommentContext } from "@/lib/ai/glossary";
import { rememberPattern, topPatterns } from "@/lib/ai/patterns";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

const STYLES: { id: CommentStyle; label: string }[] = [
  { id: "simple", label: "Simple" },
  { id: "professional", label: "Professionnel" },
  { id: "detailed", label: "Détaillé" },
];

export function CommentAssistant({
  notes,
  context,
  onApply,
  onClose,
}: {
  notes: string;
  context?: CommentContext;
  onApply: (text: string) => void;
  onClose: () => void;
}) {
  const online = useOnline();
  const [style, setStyle] = useState<CommentStyle>("professional");
  const [useOffline, setUseOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [source, setSource] = useState<"ia" | "local" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastKey = useRef<string>("");

  async function generate(nextStyle: CommentStyle = style, forceOffline = useOffline) {
    const key = `${nextStyle}:${forceOffline}`;
    lastKey.current = key;
    setError(null);
    setLoading(true);
    try {
      const offlineText = composeOfflineComment(notes, nextStyle, context ?? {});
      if (forceOffline || !online) {
        setResult(offlineText);
        setSource("local");
        return;
      }
      const patterns = await topPatterns(5);
      const ctxLines = Object.entries(context ?? {})
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join("\n");
      const res = await run({
        data: { notes, style: nextStyle, context: ctxLines || undefined, patterns },
      });
      if (lastKey.current !== key) return;
      if (res.ok) {
        setResult(res.text);
        setSource("ia");
      } else {
        setResult(offlineText);
        setSource("local");
        setError(`${res.message} — rédaction hors-ligne utilisée.`);
      }
    } catch {
      setResult(composeOfflineComment(notes, nextStyle, context ?? {}));
      setSource("local");
      setError("Assistant en ligne injoignable — rédaction hors-ligne utilisée.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(mode: "replace" | "append") {
    const text = result.trim();
    if (!text) return;
    void rememberPattern(text);
    onApply(mode === "replace" ? text : notes.trim() ? `${notes.trim()}\n${text}` : text);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/50">
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <div className="flex-1 text-sm font-bold text-foreground">Assistant commentaire</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-1">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setStyle(s.id);
                void generate(s.id);
              }}
              className={cn(
                "h-7 rounded-md border px-2 text-xs font-semibold transition active:scale-95",
                style === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const next = !useOffline;
              setUseOffline(next);
              void generate(style, next);
            }}
            className={cn(
              "ml-auto inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-semibold",
              useOffline || !online
                ? "border-warning bg-warning/10 text-warning"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {useOffline || !online ? <CloudOff className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
            {useOffline || !online ? "Hors-ligne" : "En ligne"}
          </button>
        </div>

        {error && <p className="mb-2 text-[11px] font-semibold text-warning">{error}</p>}

        <textarea
          value={loading ? "" : result}
          onChange={(e) => setResult(e.target.value)}
          rows={6}
          placeholder={loading ? "Rédaction en cours…" : "Aucune proposition"}
          className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary"
        />

        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Régénérer
          </button>
          <span className="text-[10px] text-muted-foreground">
            {source === "ia" ? "IA en ligne" : source === "local" ? "Moteur local" : ""}
          </span>
          <button
            type="button"
            onClick={() => apply("append")}
            disabled={loading || !result.trim()}
            className="ml-auto inline-flex h-8 items-center rounded-md border border-primary/40 bg-card px-2 text-xs font-bold text-primary disabled:opacity-50"
          >
            Ajouter
          </button>
          <button
            type="button"
            onClick={() => apply("replace")}
            disabled={loading || !result.trim()}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            Remplacer
          </button>
        </div>
      </div>
    </div>
  );
}
