import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Sparkles, Wand2 } from "lucide-react";
import { isDictationSupported, startDictation, type DictationHandle } from "@/lib/speech/dictation";
import { CommentAssistant } from "@/components/cri/CommentAssistant";
import type { CommentContext } from "@/lib/ai/glossary";
import { cn } from "@/lib/utils";

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 800) + "px";
}

export function DictationTextarea({
  value,
  onChange,
  example,
  placeholder,
  rows = 3,
  assist = false,
  assistContext,
}: {
  value: string;
  onChange: (v: string) => void;
  example?: string;
  placeholder?: string;
  rows?: number;
  /** Affiche le bouton « IA » de reformulation professionnelle. */
  assist?: boolean;
  assistContext?: CommentContext;
}) {
  const [listening, setListening] = useState(false);
  const [assisting, setAssisting] = useState(false);
  const handleRef = useRef<DictationHandle | null>(null);
  const baseRef = useRef<string>(value);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const supported = isDictationSupported();

  useEffect(() => {
    return () => handleRef.current?.stop();
  }, []);

  useEffect(() => {
    autoResize(taRef.current);
  }, [value]);

  function toggleMic() {
    if (listening) {
      handleRef.current?.stop();
      setListening(false);
      return;
    }
    baseRef.current = value;
    const h = startDictation({
      onResult: (t, isFinal) => {
        if (isFinal) {
          const next = (baseRef.current + (baseRef.current.endsWith(" ") || !baseRef.current ? "" : " ") + t).trim();
          baseRef.current = next;
          onChange(next);
        } else {
          onChange((baseRef.current + " " + t).trim());
        }
      },
      onEnd: () => setListening(false),
      onError: () => setListening(false),
    });
    if (h) {
      handleRef.current = h;
      setListening(true);
    }
  }

  return (
    <div className="space-y-1.5">
      <textarea
        ref={(el) => {
          taRef.current = el;
          autoResize(el);
        }}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          autoResize(e.currentTarget);
        }}
        rows={rows}
        placeholder={placeholder}
        style={{ fieldSizing: "content" } as React.CSSProperties}
        className="w-full resize-none overflow-hidden rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
      <div className="flex flex-wrap gap-1.5">
        {supported && (
          <button
            type="button"
            onClick={toggleMic}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-semibold transition active:scale-95",
              listening
                ? "border-destructive bg-destructive text-destructive-foreground animate-pulse"
                : "border-border bg-card text-foreground hover:border-primary/40",
            )}
          >
            {listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            {listening ? "Stop" : "Dictée"}
          </button>
        )}
        {assist && (
          <button
            type="button"
            onClick={() => setAssisting(true)}
            disabled={!value.trim()}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 text-xs font-bold text-primary transition active:scale-95 disabled:opacity-50"
          >
            <Wand2 className="h-3 w-3" />
            IA
          </button>
        )}
        {example && (
          <button
            type="button"
            onClick={() => onChange(value ? value + "\n" + example : example)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground transition active:scale-95 hover:border-primary/40"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            Exemple
          </button>
        )}
      </div>
      {assisting && (
        <CommentAssistant
          notes={value}
          context={assistContext}
          onApply={onChange}
          onClose={() => setAssisting(false)}
        />
      )}
    </div>
  );
}
