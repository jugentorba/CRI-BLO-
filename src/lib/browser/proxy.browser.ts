// Proxy serveur du navigateur intégré : récupère une page distante et la rend
// affichable dans une iframe (contourne X-Frame-Options / CSP frame-ancestors).
// Module 100 % indépendant du module CRI BLO.

export type ProxyResult =
  | {
      ok: true;
      kind: "html";
      finalUrl: string;
      title: string;
      html: string;
    }
  | {
      ok: true;
      kind: "file";
      finalUrl: string;
      fileName: string;
      mimeType: string;
      base64: string;
    }
  | { ok: false; message: string };

const MAX_BYTES = 8 * 1024 * 1024;

const UA =
  "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36";

/** Script injecté : les clics et formulaires remontent au parent (navigation). */
const BRIDGE = `
<script>
(function(){
  function send(url, dl){ try{ parent.postMessage({ __briblo_nav: String(url), download: !!dl }, "*"); }catch(e){} }
  document.addEventListener("click", function(e){
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if(!a) return;
    var href = a.getAttribute("href") || "";
    if(!href || href.charAt(0) === "#" || /^javascript:/i.test(href)) return;
    e.preventDefault(); e.stopPropagation();
    send(a.href, a.hasAttribute("download"));
  }, true);
  document.addEventListener("submit", function(e){
    var f = e.target; if(!f || f.tagName !== "FORM") return;
    var method = (f.getAttribute("method") || "get").toLowerCase();
    if(method !== "get") return;
    e.preventDefault(); e.stopPropagation();
    try{
      var u = new URL(f.action || location.href, location.href);
      var d = new FormData(f);
      var p = new URLSearchParams();
      d.forEach(function(v,k){ if(typeof v === "string") p.append(k, v); });
      u.search = p.toString();
      send(u.toString(), false);
    }catch(err){}
  }, true);
})();
</script>
`;

function fileNameFrom(url: string, disposition: string | null, mime: string): string {
  const fromHeader = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  if (fromHeader) return decodeURIComponent(fromHeader.trim());
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return decodeURIComponent(last);
  } catch {
    /* ignore */
  }
  const ext = mime.includes("pdf") ? "pdf" : mime.includes("sheet") ? "xlsx" : "bin";
  return `telechargement.${ext}`;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function prepareHtml(raw: string, finalUrl: string): { html: string; title: string } {
  let html = raw
    // CSP / frame-busting meta refusant l'affichage intégré
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "")
    .replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, "")
    .replace(/<base[^>]*>/gi, "")
    // service workers inutiles / bloquants dans une iframe sandbox
    .replace(/integrity=("|')[^"']*\1/gi, "");

  const title = raw.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1]?.trim() ?? finalUrl;
  const head = `<base href="${finalUrl.replace(/"/g, "&quot;")}" target="_self">`;

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  } else {
    html = `<head>${head}</head>${html}`;
  }

  html = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${BRIDGE}</body>`)
    : html + BRIDGE;

  return { html, title };
}

export async function proxyPage(url: string): Promise<ProxyResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: "Adresse invalide." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, message: "Protocole non supporté." };
  }

  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
  } catch {
    return { ok: false, message: "Site inaccessible (vérifiez l'adresse ou la connexion)." };
  }
  if (!res.ok && res.status !== 203) {
    return { ok: false, message: `Le site a répondu ${res.status}.` };
  }

  const finalUrl = res.url || parsed.toString();
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const disposition = res.headers.get("content-disposition");
  const isHtml = mimeType.includes("html") || mimeType.includes("xml") || mimeType === "";
  const isAttachment = !!disposition?.toLowerCase().includes("attachment");

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return { ok: false, message: "Contenu trop volumineux (max 8 Mo)." };
  }

  if (isHtml && !isAttachment) {
    const raw = new TextDecoder("utf-8").decode(buffer);
    const { html, title } = prepareHtml(raw, finalUrl);
    return { ok: true, kind: "html", finalUrl, title, html };
  }

  return {
    ok: true,
    kind: "file",
    finalUrl,
    fileName: fileNameFrom(finalUrl, disposition, mimeType || "application/octet-stream"),
    mimeType: mimeType || "application/octet-stream",
    base64: toBase64(buffer),
  };
}
