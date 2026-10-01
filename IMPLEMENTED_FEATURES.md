# CRI-BLO — implemented feature state

The application uses one React/Vite/Capacitor codebase for PWA, Android and iOS.

Implemented on `criblo-master-spec-v1`:

- direct personal Gemini assistant integration with locally entered API key; default model is Gemini 3.7 Flash and the old custom/OpenAI-compatible endpoint path is retired
- assistant conversation history plus offline French formatting fallback
- native CRI-BLO browser on Android and iOS; iOS uses WKWebView with persistent session data, internal popup/navigation handling and a long-press compatibility bridge for interactive maps such as GeoReseaux, including embedded frames
- PWA browser fallback with tabs, bookmarks, history and local browser data
- generic PDF/DOCX/XLSX document detection and editing workspace
- remembered document save behavior
- OneDrive device snapshot sync/restore with queued upload deduplication
- timestamp evidence camera flow preserving the original photo plus capture date/time, GPS/accuracy/address metadata and a separately stamped export version
- improved GPS acquisition, reverse geocoding, address caching and offline/pending resolution behavior
- N/A support across editable CRI fields except address/GPS-derived fields; legacy `na` values are normalized to literal `N/A` in exports
- unlimited supplementary OI photo slots with flat, collision-safe ZIP export
- Orange XLSX/PDF/ZIP export mapping including comments and photo placement
- public-npm `package-lock.json` and reproducible `npm ci` builds
- GitHub Actions validation for PWA/lint, Android debug APK and iOS simulator compilation

Native projects are generated deterministically by Capacitor during CI rather than stored as permanent generated directories in the repository. CRI-BLO-owned native behavior lives in source-controlled plugins and patch scripts.

Still requiring real-device acceptance before merge:

- iPhone GeoReseaux live-site long-press behavior
- Android/iPhone camera, runtime permissions, GPS/address capture and offline behavior
- final export review using real field data and photos on device
