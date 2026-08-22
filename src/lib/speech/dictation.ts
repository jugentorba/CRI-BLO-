// Web Speech API wrapper (FR-FR) — fonctionne sur Chrome Android, Edge, Safari iOS récent.

type SpeechRecognitionType = typeof window extends { SpeechRecognition: infer T } ? T : unknown;

export function isDictationSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface DictationHandle {
  stop: () => void;
}

export function startDictation(opts: {
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}): DictationHandle | null {
  if (!isDictationSupported()) {
    opts.onError?.("Dictée vocale non disponible sur ce navigateur.");
    return null;
  }
  const Ctor = ((window as unknown as Record<string, SpeechRecognitionType>).SpeechRecognition ??
    (window as unknown as Record<string, SpeechRecognitionType>).webkitSpeechRecognition) as new () => {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>; resultIndex: number }) => void;
    onend: () => void;
    onerror: (e: { error: string }) => void;
    start: () => void;
    stop: () => void;
  };
  const rec = new Ctor();
  rec.lang = "fr-FR";
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (e) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (final) opts.onResult(final, true);
    else if (interim) opts.onResult(interim, false);
  };
  rec.onend = () => opts.onEnd?.();
  rec.onerror = (e) => opts.onError?.(e.error);
  try {
    rec.start();
  } catch (e) {
    opts.onError?.(String(e));
    return null;
  }
  return { stop: () => rec.stop() };
}
