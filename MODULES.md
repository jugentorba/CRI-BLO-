# Architecture modulaire de la PWA

Une seule PWA, plusieurs modules indépendants. Le module CRI BLO est **protégé** :
aucune nouvelle fonctionnalité ne doit modifier ses fichiers.

## Module CRI BLO (stable — ne pas modifier)

- `src/routes/cri.$id.tsx`, `src/routes/historique.tsx`
- `src/lib/cri/*` (schéma, visibilité, dépôt, types)
- `src/lib/export/*` (Excel, PDF, ZIP, nommage, dossier)
- `src/lib/photos/*`, `src/lib/attachments/*`
- `src/lib/geo/*` (GPS, géocodage, cache, file d'attente)
- `src/lib/onedrive/*` (synchronisation cloud)
- Store IndexedDB `cris` (+ `photos`, `attachments`) — historique CRI BLO uniquement.

Toute évolution demandée sur ces fichiers doit être explicitement destinée au CRI BLO.

### Contrat gelé — classeur officiel Orange

Le classeur CRI BLO **ne change jamais**. Sont figés :

- `public/cri_blo_template.xlsx` (empreinte SHA-256 vérifiée) ;
- les cellules écrites (`FIELD_CELLS` : 47 cellules) ;
- les ancrages photos (`PHOTO_ANCHORS` : 15 emplacements) ;
- le contenu du ZIP : **un** document officiel + les pièces jointes ajoutées par
  le technicien, rien d'autre ;
- le nom des fichiers (`CRI_BLO_Commune_Dossier.ext`).

Règle simple : **de nouvelles valeurs dans les cellules existantes, jamais de
nouvelle cellule, feuille, image ou fichier.**

Vérification (aussi exécutée par la CI avant chaque version signée) :

```bash
node scripts/test-frozen-export.mjs
```

Le test échoue dès qu'un de ces éléments bouge. Ne jamais régénérer l'empreinte
(`--write`) pour faire passer une modification non validée.

## Module « Autres documents »

- Détection de type : `src/lib/docs/registry.ts`, `src/lib/docs/detect.ts`
- Historique séparé : store IndexedDB `otherDocs` (`src/lib/docs/repository.ts`)
- Écran : `src/routes/documents.tsx`

Un document non reconnu comme CRI BLO n'écrit jamais dans le store `cris`.

## Module Assistant IA

- Écran : `src/routes/assistant.tsx`
- Serveur : `src/lib/ai/assistant.functions.ts` + `src/lib/ai/assistant.server.ts`
- Repli hors-ligne : `translateNotes` de `src/lib/ai/glossary.ts` (lecture seule)

Indépendant du formulaire CRI BLO : l'assistant intégré au CRI
(`src/components/cri/CommentAssistant.tsx`, `src/lib/ai/comment.functions.ts`) reste inchangé.

## Import

`src/routes/importer.tsx` détecte d'abord le type :

- CRI BLO → analyse et création dans le module CRI BLO (comportement existant).
- Autre type / inconnu → détection affichée, choix laissé à l'utilisateur
  (conserver dans son propre historique, ou forcer l'analyse CRI BLO).
