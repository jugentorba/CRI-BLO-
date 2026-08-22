import { useEffect } from "react";
import { getSettings, type AppSettings, type DisplayDensity, type ThemeMode } from "@/lib/settings/repository";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0d0d0f" : "#FF7900");
}

function densityFactor(d: DisplayDensity): number {
  switch (d) {
    case "compact":
      return 0.9;
    case "very-compact":
      return 0.82;
    default:
      return 1;
  }
}

function applyDensity(density: DisplayDensity, scale: number) {
  const clamped = Math.max(70, Math.min(130, scale || 100));
  const px = 16 * densityFactor(density) * (clamped / 100);
  document.documentElement.style.fontSize = `${px}px`;
}

function applyAll(s: AppSettings) {
  applyTheme(s.theme);
  applyDensity(s.density, s.scale);
}

/** Mount once near the top of the app to keep <html> in sync with stored settings. */
export function useThemeSync() {
  useEffect(() => {
    let cancelled = false;
    void getSettings().then((s) => {
      if (!cancelled) applyAll(s);
    });

    const onSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail as AppSettings | undefined;
      if (detail) applyAll(detail);
    };
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => void getSettings().then((s) => applyTheme(s.theme));
    window.addEventListener("criblo:settings", onSettings as EventListener);
    mql.addEventListener("change", onSystem);

    return () => {
      cancelled = true;
      window.removeEventListener("criblo:settings", onSettings as EventListener);
      mql.removeEventListener("change", onSystem);
    };
  }, []);
}
