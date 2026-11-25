import { Capacitor, CapacitorHttp } from "@capacitor/core";

// Proxy natif/web du navigateur intégré : récupère une page distante et la rend
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


function headerValue(headers: Record<string, string>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

function nativeDataToArrayBuffer(data: unknown): ArrayBuffer {
  if (typeof data === "string") return base64ToArrayBuffer(data);
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  return new TextEncoder().encode(JSON.stringify(data ?? "")).buffer;
}

/**
 * Neutralise le menu natif de iOS sur les zones interactives (liens, images,
 * canvas/svg des cartes) pour que l'appui long arrive jusqu'à notre script.
 * Le reste du texte (sélection/copie) reste intact.
 */
const CONTEXT_CSS = `<style>a,img,canvas,svg{-webkit-touch-callout:none}</style>`;

/**
 * Script injecté dans la page distante :
 * - navigation (clics, formulaires) ;
 * - menu contextuel unifié : clic droit (souris), appui long natif (Android),
 *   appui long simulé (iOS, qui n'émet jamais `contextmenu`).
 *
 * L'événement est d'abord renvoyé à la page (les cartes télécom ouvrent alors
 * leur propre fenêtre « identifier »), puis le parent n'affiche son menu que si
 * la page ne l'a pas pris en charge.
 */
const BRIDGE = `
<script>
(function(){
  // Source du script : réutilisée pour équiper les cadres de même origine.
  var SELF = (document.currentScript && document.currentScript.textContent) || "";
  function closest(el, sel){ try { return el && el.closest ? el.closest(sel) : null; } catch(e){ return null; } }
  function send(url, dl){ try{ parent.postMessage({ __briblo_nav: String(url), download: !!dl }, "*"); }catch(e){} }

  // Handshake : l'application sait ainsi si le pont est actif sur cette page.
  try { parent.postMessage({ __briblo_ready: true }, "*"); } catch(e){}

  var lastMenuAt = 0;
  var swallowClickUntil = 0;
  var pressTimer = null, startX = 0, startY = 0, startEl = null, moved = false, startAt = 0;
  // 450 ms : plus court que la reconnaissance d'appui long d'Android (~500 ms),
  // qui annulait notre minuterie avant qu'elle ne se déclenche.
  var LONG_PRESS_MS = 450, MOVE_TOLERANCE = 12;
  var synthetic = false;

  function describe(el){
    var a = closest(el, "a");
    var img = closest(el, "img");
    var src = img ? (img.currentSrc || img.getAttribute("src") || "") : "";
    try { if (src) src = new URL(src, location.href).toString(); } catch(e){}
    var href = "";
    try { if (a) href = a.href || ""; } catch(e){}
    return {
      href: href,
      download: a ? a.hasAttribute("download") : false,
      text: a ? (a.textContent || "").trim().slice(0, 160) : "",
      image: src,
      alt: img ? (img.getAttribute("alt") || "") : ""
    };
  }

  function openMenu(kind, x, y, el){
    var now = Date.now();
    if (now - lastMenuAt < 700) return;
    lastMenuAt = now;
    var info = describe(el);
    info.kind = kind;
    info.x = Math.round(x || 0);
    info.y = Math.round(y || 0);
    try { parent.postMessage({ __briblo_ctx: info }, "*"); } catch(e){}
  }

  function cancelPress(){ if(pressTimer){ clearTimeout(pressTimer); pressTimer = null; } }

  // Clic droit (Mac/Windows) ou appui long déjà géré par le moteur (Android).
  document.addEventListener("contextmenu", function(e){
    if(synthetic) return;
    var handledByPage = e.defaultPrevented;
    e.preventDefault();
    swallowClickUntil = Date.now() + 900;
    openMenu(handledByPage ? "page" : "app", e.clientX, e.clientY, e.target);
  }, false);

  function fireLongPress(){
    if(moved) return;
    if(Date.now() - lastMenuAt < 700) return;
    var el = document.elementFromPoint(startX, startY) || startEl;
    var ev;
    try {
      ev = new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, view: window,
        clientX: startX, clientY: startY, button: 2, buttons: 2
      });
    } catch(err) {
      ev = document.createEvent("MouseEvents");
      ev.initMouseEvent("contextmenu", true, true, window, 1,
        startX, startY, startX, startY, false, false, false, false, 2, null);
    }
    var notHandled = true;
    synthetic = true;
    try { notHandled = el.dispatchEvent(ev); } catch(err2){} finally { synthetic = false; }
    swallowClickUntil = Date.now() + 900;
    try { if(navigator.vibrate) navigator.vibrate(12); } catch(err3){}
    openMenu(notHandled ? "app" : "page", startX, startY, el);
  }

  // Appui long simulé — indispensable sur iOS.
  document.addEventListener("touchstart", function(e){
    if(e.touches.length !== 1){ cancelPress(); return; }
    var t = e.touches[0];
    startX = t.clientX; startY = t.clientY; startEl = e.target; moved = false;
    startAt = Date.now();
    cancelPress();
    pressTimer = setTimeout(function(){
      pressTimer = null;
      fireLongPress();
    }, LONG_PRESS_MS);
  }, { passive: true, capture: true });

  document.addEventListener("touchmove", function(e){
    if(!pressTimer) return;
    var t = e.touches[0]; if(!t) return;
    if(Math.abs(t.clientX - startX) > MOVE_TOLERANCE || Math.abs(t.clientY - startY) > MOVE_TOLERANCE){
      moved = true; cancelPress();
    }
  }, { passive: true, capture: true });

  document.addEventListener("touchend", cancelPress, true);
  // iOS annule le toucher quand il prend la main pour sa propre sélection :
  // si l'appui a déjà duré assez longtemps, on ouvre quand même le menu.
  document.addEventListener("touchcancel", function(){
    if(pressTimer && !moved && Date.now() - startAt >= 380){
      pressTimer = null;
      fireLongPress();
    }
    cancelPress();
  }, true);
  window.addEventListener("blur", cancelPress);

  // Relaie les messages des cadres imbriqués vers l'application.
  window.addEventListener("message", function(e){
    var d = e.data;
    if(!d || typeof d !== "object") return;
    if(!(d.__briblo_ctx || d.__briblo_nav || d.__briblo_ready)) return;
    if(window.parent && window.parent !== window){
      try { window.parent.postMessage(d, "*"); } catch(err){}
    }
  });

  // Équipe les cadres de même origine (certaines cartes s'y trouvent).
  function knitFrames(){
    if(!SELF) return;
    var frames;
    try { frames = document.querySelectorAll("iframe, frame"); } catch(e){ return; }
    for(var i = 0; i < frames.length; i++){
      try {
        var doc = frames[i].contentDocument;
        if(!doc || doc.__bribloBridge) continue;
        doc.__bribloBridge = true;
        var script = doc.createElement("script");
        script.textContent = SELF;
        (doc.body || doc.documentElement).appendChild(script);
      } catch(e) {
        // cadre d'une autre origine : inaccessible, on ignore
      }
    }
  }
  try {
    new MutationObserver(function(){ knitFrames(); })
      .observe(document.documentElement, { childList: true, subtree: true });
  } catch(e){}
  setTimeout(knitFrames, 900);

  // Navigation
  document.addEventListener("click", function(e){
    if(Date.now() < swallowClickUntil){ e.preventDefault(); e.stopPropagation(); return; }
    var a = closest(e.target, "a");
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
  const head = `<base href="${finalUrl.replace(/"/g, "&quot;")}" target="_self">${CONTEXT_CSS}`;

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

  let status: number;
  let finalUrl: string;
  let mimeType = "";
  let disposition: string | null = null;
  let buffer: ArrayBuffer;

  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url: parsed.toString(),
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
        responseType: "arraybuffer",
        connectTimeout: 15000,
        readTimeout: 60000,
      });
      status = res.status;
      finalUrl = res.url || parsed.toString();
      mimeType = headerValue(res.headers, "content-type")?.split(";")[0]?.trim() ?? "";
      disposition = headerValue(res.headers, "content-disposition");
      buffer = nativeDataToArrayBuffer(res.data);
    } else {
      const res = await fetch(parsed.toString(), {
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      status = res.status;
      finalUrl = res.url || parsed.toString();
      mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      disposition = res.headers.get("content-disposition");
      buffer = await res.arrayBuffer();
    }
  } catch {
    return { ok: false, message: "Site inaccessible (vérifiez l'adresse ou la connexion)." };
  }

  if ((status < 200 || status >= 300) && status !== 203) {
    return { ok: false, message: `Le site a répondu ${status}.` };
  }

  const isHtml = mimeType.includes("html") || mimeType.includes("xml") || mimeType === "";
  const isAttachment = !!disposition?.toLowerCase().includes("attachment");
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
