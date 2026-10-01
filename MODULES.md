# Architecture modulaire CRI-BLO

Une seule base React/Vite/Capacitor alimente la PWA ainsi que les applications Android et iOS. Le module CRI BLO reste isolé des modules « autres documents », assistant et navigateur, sauf lorsqu'une évolution est explicitement destinée au formulaire CRI BLO.

## Module CRI BLO

- `src/routes/cri.$id.tsx`, `src/routes/historique.tsx`
- `src/lib/cri/*` (schéma, visibilité, dépôt, types)
- `src/lib/export/*` (Excel, PDF, ZIP, nommage, dossier)
- `src/lib/photos/*`, `src/lib/attachments/*`
- `src/lib/geo/*` (GPS, géocodage, cache, file d'attente)
- `src/lib/onedrive/*` (synchronisation cloud)
- stores IndexedDB `cris`, `photos`, `attachments`

Toute évolution de ces fichiers doit être explicitement destinée au CRI BLO.

## Module « Autres documents »

- détection : `src/lib/docs/registry.ts`, `src/lib/docs/detect.ts`
- historique séparé : store IndexedDB `otherDocs` (`src/lib/docs/repository.ts`)
- écran : `src/routes/documents.tsx`

Un document non reconnu comme CRI BLO n'écrit jamais dans le store `cris`.

## Module Assistant IA

- écran : `src/routes/assistant.tsx`
- orchestration : `src/lib/ai/assistant.functions.ts`
- client Gemini : `src/lib/ai/gemini.ts`
- historique : `src/lib/ai/chats.ts`
- repli hors-ligne : `translateNotes` de `src/lib/ai/glossary.ts`

L'assistant en ligne utilise uniquement la configuration Gemini personnelle enregistrée localement dans les paramètres. Aucun endpoint OpenAI-compatible n'est utilisé par le flux principal.

## Module Navigateur

- écran et état web : `src/routes/navigateur.tsx`, `src/lib/browser/*`
- plugin natif propriétaire : `plugins/criblo-native-browser`
- Android : WebView natif
- iOS : WKWebView natif + pont de compatibilité long-press pour cartes interactives

La PWA conserve un fallback web; Android/iOS chargent les pages live dans le navigateur natif CRI-BLO.

## Import

`src/routes/importer.tsx` détecte d'abord le type :

- CRI BLO → analyse et création dans le module CRI BLO.
- autre type / inconnu → détection affichée, choix laissé à l'utilisateur sans écrire automatiquement dans l'historique CRI BLO.

## Native / CI

Les projets Android et iOS générés sont reconstruits par Capacitor dans GitHub Actions. Les éléments natifs durables sont conservés sous forme de plugins/scripts source, puis validés par :

- build PWA + lint
- APK Android debug
- build iOS Simulator
