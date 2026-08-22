# Criblo — feature update

This build preserves the working APK Forge Vite SPA architecture and adds:
- independent OpenAI-compatible AI endpoint configuration
- modern browser tabs, private mode, bookmarks, history, downloads and local password vault with reveal
- generic PDF/DOCX/XLSX document detection and editing workspace
- remembered document save dialog behavior
- cross-device OneDrive device snapshot sync/restore
- native-style timestamp camera with date/time/location overlay and device-supported zoom levels (including 0.5x/0.6x when exposed by the device)
- improved GPS acquisition/error handling
- N/A quick-fill buttons for ordinary text fields
- multiple supplementary photo capture integration retained
- timestamp watermark excludes technician name

Notes:
- Pure PWA/WebView cannot guarantee Android MediaStore gallery insertion or native GPS permission control without a native bridge. The camera uses getUserMedia and the gallery option uses the browser/WebView download mechanism.
- PDF editing currently recreates the editable text into a new PDF; it does not preserve every original PDF graphic/layout object.
- DOCX editing preserves the DOCX container but rewrites the document body text.
- mobile date/time picker for intervention start/end: French calendar, 24-hour clock face, orange header, direct date/time switching and OK/Cancel confirmation
