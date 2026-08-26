import { z } from "zod";
import { proxyPage } from "@/lib/browser/proxy.browser";
import { hasNativeCriBrowser, openNativeCriBrowser } from "@/lib/browser/native";

const schema = z.object({ url: z.string().min(4).max(2000) });

function nativeClosedPage(url: string, title: string): string {
  const safeUrl = url.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
  const safeTitle = title.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);

  return `<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;color:#222"><h3 style="margin:0 0 8px">${safeTitle || "Navigation terminée"}</h3><p style="font-size:13px;word-break:break-all">${safeUrl}</p><p style="font-size:12px;color:#666">La page a été ouverte dans le navigateur natif CRI-BLO. Utilisez la barre d’adresse ou Recharge pour la rouvrir.</p></body></html>`;
}

export async function openRemotePage(input: { data: z.infer<typeof schema> }) {
  const { url } = schema.parse(input.data);

  if (hasNativeCriBrowser()) {
    try {
      const result = await openNativeCriBrowser(url, { longPressCompatibility: true });
      const finalUrl = result.url || url;
      const title = result.title || new URL(finalUrl).host;
      return {
        ok: true as const,
        kind: "html" as const,
        finalUrl,
        title,
        html: nativeClosedPage(finalUrl, title),
      };
    } catch (error) {
      return {
        ok: false as const,
        message:
          error instanceof Error
            ? error.message
            : "Impossible d'ouvrir le navigateur natif CRI-BLO.",
      };
    }
  }

  return proxyPage(url);
}
