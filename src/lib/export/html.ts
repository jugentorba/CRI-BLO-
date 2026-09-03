import type { CriRecord } from "@/lib/cri/types";
import { getPhoto } from "@/lib/photos/repository";
import { cleanAddressText } from "@/lib/geo/address-format";

// Libellés EXACTS issus du template officiel Orange (onglets PHOTOS OI / MESURES / RDSUR / PHOTOS OC / PLAN).
// Ne JAMAIS modifier sans nouvelle version officielle.
const OFFICIAL_PHOTO_LABELS: Record<string, string> = {
  photo_oi_situation: "Insérer une photo de la chambre / appui / armoire en situation",
  photo_oi_etiquette:
    "Insérer 1 photo de l'étiquette du contenant / support (Câble, PB, BTI, PEP, PA, PE, PEO, PMI, poteau, …)",
  photo_oi_avant: "Insérer 1 photo avant travaux",
  photo_oi_apres: "Insérer 1 photo après travaux",
  photo_mesures_loc1:
    "Courbe de réflectométrie lors de la localisation — sens 1 (toutes infos visibles : date/heure, tableau d'évènements)",
  photo_mesures_loc2:
    "Courbe de réflectométrie lors de la localisation — sens 2 (cas d'affaiblissement)",
  photo_rdsur_avant: "Photo de la zone avant sécurisation",
  photo_rdsur_apres: "Photo de la zone après sécurisation",
  photo_oc_defaut: "Insérer une photo de défaut client OC",
  photo_oc_apres_def: "Insérer 1 photo après réparation du défaut client",
  photo_oc_avant: "Insérer 1 photo avant travaux",
  photo_oc_apres: "Insérer 1 photo après travaux",
  photo_oc_mesure1: "Courbe de réflectométrie SAV OC après réparation — 1",
  photo_oc_mesure2: "Courbe de réflectométrie SAV OC après réparation — 2",
  photo_plan: "Synoptique Geofibre ou Optimum du point de défaut / câble à changer",
};

function esc(v: unknown): string {
  const text = v === "na" || v === "N/A" ? "N/A" : String(v ?? "");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtValue(v: unknown): string {
  if (v === true) return "Oui";
  if (v === false) return "Non";
  if (v === "na" || v === "N/A") return "N/A";
  if (v == null || v === "") return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime()))
      return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }
  return esc(v);
}

export async function buildHtmlExport(cri: CriRecord): Promise<Blob> {
  const values = cri.values ?? {};
  const photos = cri.photos ?? {};
  const photoData: Record<string, { src: string; createdAt: string }> = {};
  for (const slot of Object.keys(photos)) {
    const p = await getPhoto(cri.id, slot);
    if (p) photoData[slot] = { src: await blobToDataUrl(p.blob), createdAt: p.createdAt };
  }

  const v = (id: string) => fmtValue(values[id]);
  const raw = (id: string) => esc(values[id] ?? "");
  const ref = raw("referenceOrange") || esc(cri.reference);
  const commune = cleanAddressText(raw("commune") || esc(cri.address.commune ?? ""));
  const cp = raw("codePostal") || esc(cri.address.postalCode ?? "");
  const voie = raw("nomVoie") || esc(cri.address.street ?? "");
  const numero = raw("numeroVoie") || esc(cri.address.streetNumber ?? "");
  const addressA = cleanAddressText(raw("adresseA"));
  const addressB = cleanAddressText(raw("adresseB"));
  const gpsA = raw("gpsCoordsA");
  const gpsB = raw("gpsCoordsB");

  const photoLabel = (slot: string) => {
    if (OFFICIAL_PHOTO_LABELS[slot]) return OFFICIAL_PHOTO_LABELS[slot];
    const m = /^photo_extra_(\d+)$/.exec(slot);
    return m ? `Photo supplémentaire ${m[1]}` : slot;
  };

  // Photos supplémentaires réellement présentes (aucune limite).
  const extraSlots = Object.keys(photos)
    .filter((s) => /^photo_extra_\d+$/.test(s))
    .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));

  const fmtCaption = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? esc(iso)
      : esc(d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }));
  };

  const photoBlock = (slot: string) => {
    const label = photoLabel(slot);
    const p = photoData[slot];
    return `<div class="photo-block"><div class="photo-label">${esc(label)} :</div><div class="photo-box">${
      p ? `<img src="${p.src}" alt="${esc(label)}"/>` : ""
    }</div><div class="caption">${fmtCaption(p?.createdAt)}</div></div>`;
  };

  // Une page = 2 photos maximum : garantit qu'aucune photo n'est coupée par un saut de page.
  const photoPages = (title: string, slots: string[]) => {
    const chunks: string[][] = [];
    for (let i = 0; i < slots.length; i += 2) chunks.push(slots.slice(i, i + 2));
    return chunks
      .map(
        (chunk, idx) =>
          `<section class="page photo-page">${pageHeader(
            idx === 0 ? title : `${title} (suite)`,
          )}<div class="page-body">${chunk.map(photoBlock).join("")}</div>${pageFooter(ref)}</section>`,
      )
      .join("");
  };

  const pageHeader = (title: string) =>
    `<header class="page-head"><div class="logo">orange<sup>™</sup></div><div class="head-title">${esc(
      title,
    )}</div><div class="head-ref">Réf. ${ref || "—"}</div></header>`;

  const pageFooter = (reference: string) =>
    `<footer class="page-foot"><span>CRI BLO — ${esc(reference || "")}</span><span>${esc(
      commune,
    )}</span></footer>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<title>CRI BLO ${esc(cri.reference)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#e9eaee;margin:0;padding:0;font-size:11px;line-height:1.25;}
  .page{width:794px;height:1123px;margin:0 auto;background:#fff;padding:16px 30px 30px;position:relative;overflow:hidden;break-after:page;}
  .page-head{display:flex;align-items:center;gap:12px;border-bottom:2px solid #ff7900;padding-bottom:6px;margin-bottom:10px;height:44px;}
  .logo{width:52px;height:30px;background:#ff7900;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 52px;}
  .head-title{flex:1;text-align:center;font-size:14px;font-weight:700;}
  .head-ref{flex:0 0 150px;text-align:right;font-size:10px;color:#555;}
  .page-body{height:1013px;overflow:hidden;}
  .page-foot{position:absolute;left:30px;right:30px;bottom:10px;display:flex;justify-content:space-between;font-size:9px;color:#777;border-top:1px solid #ddd;padding-top:4px;}
  .section-title{background:#f2f2f2;border-left:3px solid #ff7900;font-size:12px;font-weight:700;padding:3px 6px;margin:10px 0 6px;}
  /* Grilles alignées : libellé / valeur, 2 colonnes de paires */
  .grid2{display:grid;grid-template-columns:200px 155px 200px 155px;gap:4px 8px;align-items:stretch;}
  .grid1{display:grid;grid-template-columns:200px 1fr;gap:4px 8px;align-items:stretch;}
  .lab{display:flex;align-items:center;font-size:10px;padding-right:4px;}
  .box{border:1px solid #808080;min-height:20px;padding:2px 5px;background:#fff;display:flex;align-items:center;font-size:10px;overflow:hidden;word-break:break-word;}
  .box.wrap{display:block;line-height:1.2;}
  .span3{grid-column:2 / span 3;}
  .addr{display:grid;grid-template-columns:1fr 120px 1fr;gap:8px;margin-top:6px;align-items:start;}
  .addr-col .addr-title{font-size:10px;font-weight:700;margin-bottom:3px;}
  .addr-col .bigbox{border:1px solid #808080;min-height:44px;padding:4px 5px;font-size:10px;word-break:break-word;}
  .addr-col .sub{display:grid;grid-template-columns:1fr 70px;gap:3px 6px;margin-top:4px;align-items:center;}
  .addr-mid{text-align:center;font-size:10px;}
  .addr-mid .box{justify-content:center;}
  .gps{font-size:9px;color:#666;margin-top:3px;}
  .widebox{border:1px solid #808080;min-height:52px;padding:5px 6px;font-size:10px;word-break:break-word;}
  .plan-img{border:1px solid #808080;height:300px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fafafa;}
  .plan-img img{max-width:100%;max-height:100%;object-fit:contain;}
  .photo-block{margin-bottom:10px;}
  .photo-label{font-size:10px;font-weight:700;margin-bottom:4px;min-height:24px;}
  .photo-box{border:1px solid #808080;height:404px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fafafa;}
  .photo-box img{max-width:100%;max-height:100%;object-fit:contain;}
  .caption{border:1px solid #808080;border-top:0;min-height:20px;padding:2px 5px;font-size:9px;color:#555;display:flex;align-items:center;}
  @media print{body{background:#fff}.page{margin:0}}
</style></head><body>

<section class="page">
  ${pageHeader("Compte Rendu d'intervention SAV BLO pour les fournisseurs")}
  <div class="page-body">
    <div class="grid2">
      <div class="lab">Date et heure début intervention :</div><div class="box">${v("interventionStart")}</div>
      <div class="lab">Date et heure de fin :</div><div class="box">${v("interventionEnd")}</div>
      <div class="lab">Entreprise, nom et contact :</div><div class="box span3">${[raw("company"), raw("technicianName")].filter(Boolean).join(", ")}</div>
      <div class="lab">Contact pour l'accès au site :</div><div class="box span3">${raw("siteAccessContact")}</div>
      <div class="lab">Référence intervention Orange :</div><div class="box">${ref}</div>
      <div class="lab">Centre :</div><div class="box">${raw("centre")}</div>
      <div class="lab">Zone :</div><div class="box">${raw("zone")}</div>
      <div class="lab">GHN RIP ou zone AMII (nom si RIP) :</div><div class="box">${raw("ripZone")}</div>
      <div class="lab">Nb liaisons avec GTR :</div><div class="box">${raw("nbLiaisonsGTR")}</div>
      <div class="lab">OI / OC :</div><div class="box">${raw("oiOc")}</div>
      <div class="lab">Client dépanné en provisoire :</div><div class="box">${v("clientProvisoire")}</div>
      <div class="lab">Nom valideur :</div><div class="box">${raw("nomValideur")}</div>
      <div class="lab">Dommage au réseau :</div><div class="box">${v("dommageReseau")}</div>
      <div class="lab">Constat N° :</div><div class="box">${raw("constatNum")}</div>
    </div>

    <div class="section-title">Localisation</div>
    <div class="grid2">
      <div class="lab">Nom de la Commune :</div><div class="box">${commune}</div>
      <div class="lab">Code postal :</div><div class="box">${cp}</div>
      <div class="lab">Nom de la voie :</div><div class="box">${voie}</div>
      <div class="lab">Numéro de la voie :</div><div class="box">${numero}</div>
    </div>
    <div class="addr">
      <div class="addr-col">
        <div class="addr-title">Adresse A :</div>
        <div class="bigbox">${addressA}</div>
        <div class="sub"><div class="lab">N° de chambre ou poteau/plan :</div><div class="box">${raw("chambrePoteauA")}</div>
        <div class="lab">Distance par rapport au défaut (m) :</div><div class="box">${raw("distanceDefautA")}</div></div>
        <div class="gps">${gpsA}</div>
      </div>
      <div class="addr-mid">
        <div class="addr-title">Longueur (m) :</div>
        <div class="box">${raw("longueur")}</div>
      </div>
      <div class="addr-col">
        <div class="addr-title">Adresse B :</div>
        <div class="bigbox">${addressB}</div>
        <div class="sub"><div class="lab">N° de chambre ou poteau/plan :</div><div class="box">${raw("chambrePoteauB")}</div>
        <div class="lab">Distance par rapport au défaut (m) :</div><div class="box">${raw("distanceDefautB")}</div></div>
        <div class="gps">${gpsB}</div>
      </div>
    </div>
    <div class="grid2" style="margin-top:6px">
      <div class="lab">Défaut/réparation localisé au :</div><div class="box">${v("defautLocalise")}</div>
      <div class="lab"></div><div class="box" style="border:0"></div>
      <div class="lab">Référence NRO/PM/PB/CABLE :</div><div class="box span3">${raw("referenceContenant")}</div>
      <div class="lab">Cause principale du défaut :</div><div class="box span3">${v("causePrincipale")}</div>
      <div class="lab">N° du Tronçon :</div><div class="box">${raw("numTroncon")}</div>
      <div class="lab">Type de tronçon :</div><div class="box">${raw("transportDistribution")}</div>
      <div class="lab">Type de câble :</div><div class="box">${raw("typeCable")}</div>
      <div class="lab">Longueur câble :</div><div class="box">${raw("longueurCable")}</div>
    </div>
  </div>
  ${pageFooter(ref)}
</section>

<section class="page">
  ${pageHeader("Réparations, mises à jour et essais")}
  <div class="page-body">
    <div class="section-title">Réparations</div>
    <div class="grid2">
      <div class="lab">NBJRT (nombre de jarretières) :</div><div class="box">${raw("NBJRT")}</div>
      <div class="lab">BE (boîte d'épissure ajoutée) :</div><div class="box">${v("BE")}</div>
      <div class="lab">NBSOUD (nombre de soudures) :</div><div class="box">${raw("NBSOUD")}</div>
      <div class="lab">INGE (ingénierie colonne montante) :</div><div class="box">${raw("INGE")}</div>
      <div class="lab">CAPA (capacité du câble) :</div><div class="box">${raw("CAPA")}</div>
      <div class="lab">PEO :</div><div class="box">${v("PEO")}</div>
      <div class="lab">PB remplacé :</div><div class="box">${v("PBremplace")}</div>
      <div class="lab">NBOC (nombre de clients réparés) :</div><div class="box">${raw("NBOC")}</div>
      <div class="lab">CC (longueur du câble remplacé) :</div><div class="box">${raw("CC")}</div>
      <div class="lab">NBCPL (nombre de coupleurs remplacés) :</div><div class="box">${raw("NBCPL")}</div>
    </div>
    <div class="section-title">Description des travaux (réalisés si DEF, restant à faire si PRO)</div>
    <div class="widebox">${raw("descriptionTravaux")}</div>

    <div class="section-title">Mises à jour SI nécessaires</div>
    <div class="grid2">
      <div class="lab">IPON :</div><div class="box">${v("majIPON")}</div>
      <div class="lab">OPTIMUM :</div><div class="box">${v("majOPTIMUM")}</div>
      <div class="lab">Géofibre :</div><div class="box">${v("majGeofibre")}</div>
      <div class="lab"></div><div class="box" style="border:0"></div>
    </div>

    <div class="section-title">Rétablissement et essais</div>
    <div class="grid2">
      <div class="lab">TEST AGIR pour essais des clients :</div><div class="box">${v("testAGIR")}</div>
      <div class="lab">N° de décharge :</div><div class="box">${raw("numDecharge")}</div>
    </div>

    <div class="section-title">Commentaire : conditions d'accès, problèmes rencontrés, etc.</div>
    <div class="widebox">${raw("commentaires")}</div>
  </div>
  ${pageFooter(ref)}
</section>

<section class="page">
  ${pageHeader("Plan")}
  <div class="page-body">
    <div class="photo-label">Insérer le synoptique Geofibre ou Optimum du point de défaut / câble à changer :</div>
    <div class="plan-img">${photoData.photo_plan ? `<img src="${photoData.photo_plan.src}" alt="Plan"/>` : ""}</div>
  </div>
  ${pageFooter(ref)}
</section>

${photoPages("Photos principales (OI)", ["photo_oi_situation", "photo_oi_etiquette", "photo_oi_avant", "photo_oi_apres"])}
${photoPages("Mesures", ["photo_mesures_loc1", "photo_mesures_loc2"])}
${photoPages("RDSUR", ["photo_rdsur_avant", "photo_rdsur_apres"])}
${photoPages("Photos SAV OC", ["photo_oc_defaut", "photo_oc_apres_def", "photo_oc_avant", "photo_oc_apres", "photo_oc_mesure1", "photo_oc_mesure2"])}
${extraSlots.length ? photoPages("Photos supplémentaires (PHOTOS OI)", extraSlots) : ""}
</body></html>`;
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
