// Schéma officiel du CRI BLO Orange.
// Source : template Excel "FICHE SAV BLO" + onglets PLAN, PHOTOS OI, MESURES, RDSUR, PHOTOS OC.
// Ne JAMAIS inventer de champs : modifier uniquement si Orange publie une nouvelle version.

export type FieldType =
  | "text"
  | "textLong" // textarea + dictée + exemple
  | "number"
  | "numberNA" // N/A ou valeur numérique libre
  | "yesno" // Oui / Non (+ N/A optionnel)
  | "yesnona"
  | "select"
  | "choice" // options en boutons directs (1 tap)
  | "datetime"
  | "gpsCapture" // bouton capture GPS (sans champs adresse fusionnés)
  | "photo";

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[]; // pour select / choice
  freeTextLabel?: string; // pour choice : champ libre complémentaire (ex. nom du RIP)
  autoFrom?: "profile.company" | "profile.lastName" | "now" | "gps";
  example?: string; // texte pour le bouton "Exemple"
  hint?: string; // affiché uniquement si vraiment nécessaire
  scope?: "A" | "B" | "defaut"; // pour gpsCapture : limite la capture à cette sous-section
}

export interface SectionDef {
  id: string;
  title: string;
  fields: FieldDef[];
}

export const CRI_SECTIONS: SectionDef[] = [
  {
    id: "general",
    title: "Informations générales",
    fields: [
      { id: "interventionStart", label: "Date et heure début intervention", type: "datetime", autoFrom: "now", required: true },
      { id: "interventionEnd", label: "Date et heure de fin", type: "datetime", required: true },
      { id: "company", label: "Entreprise", type: "text", autoFrom: "profile.company", required: true },
      { id: "technicianName", label: "Nom et contact", type: "text", autoFrom: "profile.lastName", required: true },
      { id: "siteAccessContact", label: "Contact pour l'accès au site", type: "text" },
      { id: "referenceOrange", label: "Référence intervention Orange", type: "text", required: true },
      { id: "centre", label: "Centre", type: "text" },
      { id: "zone", label: "Zone", type: "text" },
      {
        id: "ripZone",
        label: "RIP ou zone AMII (nom si RIP)",
        type: "choice",
        options: ["RIP", "AMI", "N/A"],
        freeTextLabel: "Nom (si RIP)",
      },
      { id: "oiOc", label: "OI/OC ?", type: "choice", options: ["OI", "OC", "N/A"] },
      { id: "nbLiaisonsGTR", label: "Nb liaisons avec GTR", type: "numberNA" },
      { id: "clientProvisoire", label: "Client dépanné en provisoire", type: "yesno" },
      { id: "nomValideur", label: "Nom valideur", type: "text" },
      { id: "dommageReseau", label: "Dommage au réseau", type: "yesno" },
      { id: "constatNum", label: "Constat N°", type: "text" },
    ],
  },
  {
    id: "pointA",
    title: "Point A (extrémité A du câble)",
    fields: [
      { id: "gpsBtnA", label: "Capturer position + adresse – Point A", type: "gpsCapture", scope: "A" },
      { id: "gpsCoordsA", label: "Coordonnées GPS", type: "text", hint: "Rempli automatiquement par le bouton GPS" },
      { id: "adresseA", label: "Adresse", type: "text", hint: "Rempli automatiquement par le bouton GPS" },
      { id: "chambrePoteauA", label: "N° de chambre / poteau", type: "text" },
      { id: "distanceDefautA", label: "Distance par rapport au défaut (m)", type: "numberNA" },
    ],
  },
  {
    id: "pointB",
    title: "Point B (extrémité B du câble)",
    fields: [
      { id: "gpsBtnB", label: "Capturer position + adresse – Point B", type: "gpsCapture", scope: "B" },
      { id: "gpsCoordsB", label: "Coordonnées GPS", type: "text", hint: "Rempli automatiquement par le bouton GPS" },
      { id: "adresseB", label: "Adresse", type: "text", hint: "Rempli automatiquement par le bouton GPS" },
      { id: "chambrePoteauB", label: "N° de chambre / poteau", type: "text" },
      { id: "distanceDefautB", label: "Distance par rapport au défaut (m)", type: "numberNA" },
    ],
  },
  {
    id: "defaut",
    title: "Localisation du défaut",
    fields: [
      { id: "gpsBtnDefaut", label: "Capturer position + adresse – Défaut", type: "gpsCapture", scope: "defaut", required: true },
      { id: "gpsCoordsDefaut", label: "Coordonnées GPS", type: "text", hint: "Rempli automatiquement par le bouton GPS" },
      // Champs officiels Excel (A12 / G12 / A13 / A14 / C15) — alimentés par la capture GPS du défaut
      { id: "commune", label: "Nom de la Commune", type: "text", required: true },
      { id: "codePostal", label: "Code postal", type: "text" },
      { id: "nomVoie", label: "Nom de la voie (Avenue/Rue/…)", type: "text" },
      { id: "numeroVoie", label: "Numéro de la voie", type: "text" },
      { id: "longueur", label: "Longueur (m)", type: "numberNA" },
    ],
  },
  {
    id: "defautDetails",
    title: "Caractéristiques du défaut",
    fields: [
      {
        id: "defautLocalise",
        label: "Défaut/réparation localisé au",
        type: "select",
        options: ["NRO", "PEP", "PM", "BTI", "PB", "APPUI", "CABLE", "Colonne montante", "D3", "PTO", "Autre"],
      },
      { id: "defautLocaliseAutre", label: "Précision si Autre", type: "text" },
      { id: "referenceContenant", label: "Référence (NRO/PB/CABLE/IMB …)", type: "text" },
      {
        id: "causePrincipale",
        label: "Cause principale du défaut",
        type: "select",
        options: ["Vandalisme", "Travaux", "Vétusté", "Malfaçon", "Incendie", "Cause tiers", "Rongeurs", "Autre"],
      },
      { id: "causePrincipaleAutre", label: "Précision si Autre", type: "text" },
      { id: "numTroncon", label: "N° du Tronçon", type: "text" },
      { id: "transportDistribution", label: "Type de tronçon", type: "select", options: ["Transport", "Distribution"] },
      { id: "typeCable", label: "Type de câble (ex : 24FO L1092 Modulo 6)", type: "text" },
      { id: "longueurCable", label: "Longueur câble (m)", type: "numberNA" },
    ],
  },

  {
    id: "reparation",
    title: "Réparation",
    fields: [
      { id: "NBJRT", label: "NBJRT (Nombre de jarretières)", type: "numberNA" },
      { id: "BE", label: "BE (boîte d'épissure ajoutée)", type: "numberNA" },
      { id: "NBSOUD", label: "NBSOUD (nombre de soudures)", type: "numberNA" },
      { id: "INGE", label: "INGE (ingénierie colonne montante MONO/QUADRI)", type: "choice", options: ["MONO", "QUADRI", "N/A"] },
      { id: "CAPA", label: "CAPA (capacité du câble)", type: "numberNA" },
      { id: "PEO", label: "PEO", type: "numberNA" },
      { id: "PBremplace", label: "PB remplacé", type: "numberNA" },
      { id: "CC", label: "CC (longueur du câble remplacé) (m)", type: "numberNA" },
      { id: "NBCPL", label: "NBCPL (nombre de coupleurs remplacés)", type: "numberNA" },
      { id: "NBOC", label: "NBOC (nombre de clients)", type: "numberNA" },
      {
        id: "descriptionTravaux",
        label: "Description des travaux réalisés",
        type: "textLong",
        required: true,
        example:
          "Réfection d'épissures sur PB123. Remplacement de 12 m de câble 24FO. Changement de 2 coupleurs. Test OTDR 1310/1550 nm conforme.",
      },
    ],
  },
  {
    id: "majsi",
    title: "Mises à jour SI nécessaires",
    fields: [
      { id: "majIPON", label: "IPON", type: "yesnona" },
      { id: "majOPTIMUM", label: "OPTIMUM", type: "yesnona" },
      { id: "majGeofibre", label: "Géofibre", type: "yesnona" },
    ],
  },
  {
    id: "retablissement",
    title: "Rétablissement et essais",
    fields: [
      { id: "testAGIR", label: "TEST AGIR pour essais des clients", type: "yesno" },
      { id: "numDecharge", label: "N° de décharge", type: "text" },
      {
        id: "commentaires",
        label: "Commentaire (conditions d'accès, problèmes rencontrés…)",
        type: "textLong",
        example:
          "Accès chambre sous voirie, circulation à interrompre 15 min. Présence d'eau, pompage effectué avant intervention.",
      },
    ],
  },
  {
    id: "photosOI",
    title: "📷 Photos principales (OI)",
    fields: [
      {
        id: "photo_oi_situation",
        label: "Chambre / appui / armoire en situation",
        type: "photo",
        hint: "Vue d'ensemble du contenant dans son environnement.",
      },
      {
        id: "photo_oi_etiquette",
        label: "Étiquette du contenant / support",
        type: "photo",
        hint: "Câble, PB, BTI, PEP, PA, PE, PEO, PMI, poteau, … — étiquette lisible.",
      },
      { id: "photo_oi_avant", label: "Avant travaux", type: "photo", hint: "État du contenant/câble avant intervention." },
      { id: "photo_oi_apres", label: "Après travaux", type: "photo", hint: "État après réparation et fermeture." },
    ],
  },
  {
    id: "mesures",
    title: "📷 Photos mesures (2 max)",
    fields: [
      {
        id: "photo_mesures_loc1",
        label: "Localisation — courbe sens 1",
        type: "photo",
        hint: "Photo/SOR : date, heure, tableau d'évènements lisibles.",
      },
      {
        id: "photo_mesures_loc2",
        label: "Localisation — courbe sens 2",
        type: "photo",
        hint: "Sens inverse (cas d'affaiblissement).",
      },
    ],
  },
  {
    id: "rdsur",
    title: "RDSUR (si facturation)",
    fields: [
      { id: "rdsurFacture", label: "Facturation RDSUR", type: "yesnona" },
      { id: "photo_rdsur_avant", label: "Zone avant sécurisation", type: "photo" },
      { id: "photo_rdsur_apres", label: "Zone après sécurisation", type: "photo" },
    ],
  },
  {
    id: "photosOC",
    title: "📷 Photos SAV OC",
    fields: [
      { id: "photo_oc_defaut", label: "Défaut client OC", type: "photo", hint: "Photo du défaut côté client (OC)." },
      {
        id: "photo_oc_apres_def",
        label: "Après réparation du défaut client",
        type: "photo",
      },
      { id: "photo_oc_avant", label: "Avant travaux", type: "photo" },
      { id: "photo_oc_apres", label: "Après travaux", type: "photo" },
      { id: "photo_oc_mesure1", label: "Mesure SAV OC — courbe 1", type: "photo", hint: "Courbe réflectométrie après réparation (1)." },
      { id: "photo_oc_mesure2", label: "Mesure SAV OC — courbe 2", type: "photo", hint: "Courbe réflectométrie après réparation (2)." },
    ],
  },
  {
    id: "plan",
    title: "Plan",
    fields: [
      {
        id: "photo_plan",
        label: "Synoptique Geofibre / Optimum",
        type: "photo",
        hint: "Synoptique du point de défaut / câble à changer.",
      },
    ],
  },
  {
    id: "photosExtras",
    title: "📷 Photos supplémentaires (PHOTOS OI)",
    fields: [
      { id: "photo_extra_1", label: "Photo supplémentaire 1", type: "photo" },
    ],
  },
];

export function allFields(): FieldDef[] {
  return CRI_SECTIONS.flatMap((s) => s.fields);
}

export function requiredFields(): FieldDef[] {
  return allFields().filter((f) => f.required);
}
