import { useEffect, useState } from "react";
import { type Lang, type Translations, TRANSLATIONS, detectSystemLang } from "./translations";
import { getSettings, saveSettings } from "@/lib/settings/repository";

let cachedLang: Lang | null = null;

function getInitialLang(): Lang {
  // Fast synchronous read from cache
  if (cachedLang) return cachedLang;
  return detectSystemLang();
}

/** React hook that returns the current translations and a setter. */
export function useI18n(): { t: Translations; lang: Lang; setLang: (l: Lang) => Promise<void> } {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  useEffect(() => {
    void getSettings().then((s) => {
      const l = (s.language as Lang) ?? detectSystemLang();
      cachedLang = l;
      setLangState(l);
    });

    function onSettings(e: Event) {
      const s = (e as CustomEvent).detail;
      if (s?.language) {
        cachedLang = s.language as Lang;
        setLangState(s.language as Lang);
      }
    }
    window.addEventListener("criblo:settings", onSettings);
    return () => window.removeEventListener("criblo:settings", onSettings);
  }, []);

  async function setLang(l: Lang) {
    cachedLang = l;
    setLangState(l);
    await saveSettings({ language: l as "fr" | "en" | "sq" });
  }

  return { t: TRANSLATIONS[lang], lang, setLang };
}

/** Standalone function to get current translations synchronously (uses cached value). */
export function getT(): Translations {
  return TRANSLATIONS[cachedLang ?? detectSystemLang()];
}
