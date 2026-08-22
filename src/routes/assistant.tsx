import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bot,
  Loader2,
  Copy,
  Check,
  WifiOff,
  ArrowRightLeft,
  History,
  Trash2,
  Plus,
  User,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { askAssistant } from "@/lib/ai/assistant.functions";
import { translateNotes } from "@/lib/ai/glossary";
import {
  appendExchange,
  clearChats,
  deleteChat,
  getChat,
  listChats,
  type AiChat,
} from "@/lib/ai/chats";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { getSettings } from "@/lib/settings/repository";
import { callIndependentAi } from "@/lib/ai/independent";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant IA télécom — CRI BLO Assistant" },
      {
        name: "description",
        content:
          "Assistant de rédaction IA avec historique : transformez une note en français, anglais ou albanais en texte professionnel télécom.",
      },
      { property: "og:title", content: "Assistant IA télécom" },
      {
        property: "og:description",
        content: "Rédaction et traduction professionnelles (français, anglais, albanais) pour le terrain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Assistant,
});

type Lang = "fr" | "en" | "sq";
type InLang = Lang | "auto";
type Tone = "professional" | "simple" | "email" | "explain" | "translate";

const IN_LANGS: { id: InLang; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "fr", label: "🇫🇷 FR" },
  { id: "en", label: "🇬🇧 EN" },
  { id: "sq", label: "🇦🇱 AL" },
];
const OUT_LANGS: { id: Lang; label: string }[] = [
  { id: "fr", label: "🇫🇷 FR" },
  { id: "en", label: "🇬🇧 EN" },
  { id: "sq", label: "🇦🇱 AL" },
];
const TONES: { id: Tone; label: string }[] = [
  { id: "professional", label: "Professionnel" },
  { id: "simple", label: "Simple" },
  { id: "translate", label: "Traduction" },
  { id: "email", label: "E-mail" },
  { id: "explain", label: "Explication" },
];

function Assistant() {
  const online = useOnline();
  const [text, setText] = useState("");
  const [inputLang, setInputLang] = useState<InLang>("auto");
  const [outputLang, setOutputLang] = useState<Lang>("fr");
  const [tone, setTone] = useState<Tone>("professional");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [chats, setChats] = useState<AiChat[]>([]);
  const [chat, setChat] = useState<AiChat | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  async function loadChats() {
    setChats(await listChats());
  }
  useEffect(() => {
    void loadChats();
  }, []);

  async function run() {
    const clean = text.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    let output = "";
    try {
      if (!online) {
        if (outputLang !== "fr") {
          setError("Hors-ligne : seule la mise en forme en français est disponible.");
        }
        output = translateNotes(clean);
      } else {
        const context = chat
          ? `${chat.messages
              .slice(-4)
              .map((m) => `${m.role === "user" ? "Note" : "Réponse"} : ${m.text}`)
              .join("\n")}\n\nNouvelle demande : ${clean}`
          : clean;
        const settings = await getSettings();
        if (settings.aiEndpoint?.trim()) {
          output = await callIndependentAi(
            { endpoint: settings.aiEndpoint, apiKey: settings.aiApiKey ?? "", model: settings.aiModel ?? "gpt-4o-mini" },
            `Réponds en ${outputLang}. Ton: ${tone}.\n${context.slice(0, 6000)}`,
          );
        } else {
          const res = await askAssistant({
            data: { text: context.slice(0, 6000), inputLang, outputLang, tone },
          });
          if (res.ok) output = res.text;
          else {
            setError(res.message);
            output = outputLang === "fr" ? translateNotes(clean) : "";
          }
        }
      }
    } catch {
      setError("Assistant indisponible — texte mis en forme hors-ligne.");
      output = outputLang === "fr" ? translateNotes(clean) : "";
    } finally {
      setBusy(false);
    }
    if (!output) return;
    const saved = await appendExchange(chat?.id ?? null, clean, output);
    setChat(saved);
    setText("");
    void loadChats();
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* presse-papier indisponible */
    }
  }

  return (
    <AppShell title="Assistant IA" subtitle="Rédaction & traduction télécom">
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setChat(null);
            setText("");
            setError(null);
            setShowHistory(false);
          }}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2 text-[10px] font-bold text-primary-foreground active:scale-95"
        >
          <Plus className="h-3 w-3" />
          Nouvelle conversation
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold active:scale-95",
            showHistory ? "border-primary text-primary" : "border-border bg-card text-foreground",
          )}
        >
          <History className="h-3 w-3" />
          Historique ({chats.length})
        </button>
        {chat && (
          <span className="ml-auto truncate text-[10px] font-semibold text-muted-foreground">
            {chat.title}
          </span>
        )}
      </div>

      {showHistory && (
        <div className="mb-2 space-y-1 rounded-xl border border-border bg-card p-2">
          {chats.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Aucune conversation enregistrée.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={async () => {
                  await clearChats();
                  setChat(null);
                  void loadChats();
                }}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-destructive/40 px-2 text-[10px] font-bold text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Tout supprimer
              </button>
              {chats.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      setChat((await getChat(c.id)) ?? null);
                      setShowHistory(false);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[11px] font-bold text-foreground">{c.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {c.messages.length / 2} échange{c.messages.length > 2 ? "s" : ""} ·{" "}
                      {new Date(c.updatedAt).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Supprimer la conversation"
                    onClick={async () => {
                      await deleteChat(c.id);
                      if (chat?.id === c.id) setChat(null);
                      void loadChats();
                    }}
                    className="rounded-lg p-1 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {!online && (
        <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-[11px] font-semibold text-warning">
          <WifiOff className="h-3 w-3" />
          Hors-ligne : mise en forme locale en français uniquement.
        </p>
      )}

      {chat && (
        <div className="space-y-1.5">
          {chat.messages.map((m, i) => (
            <div
              key={`${m.at}-${i}`}
              className={cn(
                "rounded-xl border p-2",
                m.role === "user" ? "border-border/60 bg-muted/40" : "border-border bg-card",
              )}
            >
              <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {m.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                {m.role === "user" ? "Ma note" : "Assistant"}
                {m.role === "assistant" && (
                  <button
                    type="button"
                    onClick={() => void copy(m.text, `${m.at}-${i}`)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
                  >
                    {copied === `${m.at}-${i}` ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copied === `${m.at}-${i}` ? "Copié" : "Copier"}
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{m.text}</p>
            </div>
          ))}
        </div>
      )}

      <Row label="Langue d'entrée">
        {IN_LANGS.map((l) => (
          <Chip key={l.id} active={inputLang === l.id} onClick={() => setInputLang(l.id)}>
            {l.label}
          </Chip>
        ))}
      </Row>

      <Row label="Langue de sortie" icon>
        {OUT_LANGS.map((l) => (
          <Chip key={l.id} active={outputLang === l.id} onClick={() => setOutputLang(l.id)}>
            {l.label}
          </Chip>
        ))}
      </Row>

      <Row label="Objectif">
        {TONES.map((t) => (
          <Chip key={t.id} active={tone === t.id} onClick={() => setTone(t.id)}>
            {t.label}
          </Chip>
        ))}
      </Row>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={
          chat
            ? "Continuer la conversation (précision, reformulation…)"
            : "Écrivez votre note (français, anglais ou albanais)…"
        }
        className="mt-3 w-full resize-y rounded-xl border border-border bg-card p-2.5 text-xs text-foreground outline-none focus:border-primary"
      />

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || !text.trim()}
        className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
        {busy ? "Rédaction…" : chat ? "Continuer" : "Générer le texte"}
      </button>

      {error && (
        <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
          {error}
        </p>
      )}
    </AppShell>
  );
}

function Row({
  label,
  children,
  icon = false,
}: {
  label: string;
  children: React.ReactNode;
  icon?: boolean;
}) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon && <ArrowRightLeft className="h-3 w-3" />}
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-95",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}
