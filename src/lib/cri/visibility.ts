// Règles de visibilité conditionnelle pour le formulaire CRI BLO.
// Les champs officiels ne sont JAMAIS supprimés : ils sont simplement masqués
// quand ils ne s'appliquent pas, et exclus de la validation tant qu'ils sont masqués.

type V = Record<string, unknown>;
type Photos = Record<string, string> | undefined;

const RULES: Record<string, (v: V, p: Photos) => boolean> = {
  // Précisions "Autre"
  defautLocaliseAutre: (v) => v.defautLocalise === "Autre",
  causePrincipaleAutre: (v) => v.causePrincipale === "Autre",

  // Informations générales
  nomValideur: (v) => v.clientProvisoire === true,
  constatNum: (v) => v.dommageReseau === true,

  // Rétablissement
  numDecharge: (v) => v.testAGIR === true,

  // RDSUR — photos uniquement si facturation = Oui
  photo_rdsur_avant: (v) => v.rdsurFacture === true,
  photo_rdsur_apres: (v) => v.rdsurFacture === true,

};

function extraPhotoIndex(fieldId: string): number | null {
  const match = /^photo_extra_(\d+)$/.exec(fieldId);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isExtraPhotoVisible(fieldId: string, photos: Photos): boolean | null {
  const n = extraPhotoIndex(fieldId);
  if (!n) return null;
  if (n === 1) return true;
  if (photos?.[`photo_extra_${n}`] || photos?.[`photo_extra_${n - 1}`]) return true;
  return Object.keys(photos ?? {}).some((slot) => {
    const other = extraPhotoIndex(slot);
    return !!other && other > n;
  });
}

export function isFieldVisible(fieldId: string, values: V, photos?: Photos): boolean {
  const extraVisible = isExtraPhotoVisible(fieldId, photos);
  if (extraVisible !== null) return extraVisible;
  const rule = RULES[fieldId];
  return rule ? rule(values, photos) : true;
}

/** Une section est masquée si tous ses champs sont masqués. */
export function isSectionVisible(fieldIds: string[], values: V, photos?: Photos): boolean {
  return fieldIds.some((id) => isFieldVisible(id, values, photos));
}
