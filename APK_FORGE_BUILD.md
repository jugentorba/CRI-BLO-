# APK Forge build notes

This project is a plain Vite React SPA intended to run inside an Android WebView.
It does not require a server runtime or TanStack Start server entry point.

- Web output: `dist/`
- Vite base: `./`
- Entry: `src/main.tsx`
- The router is loaded after the root element is rendered so module-load failures
  can be displayed as a startup diagnostic instead of a blank screen.
- The production build copies `dist/` to `dist-apkforge/` for APK Forge variants.
