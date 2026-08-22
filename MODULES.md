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
