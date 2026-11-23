import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Relative asset URLs for Android WebView/APK Forge.
  // GitHub Pages publishes under a subpath and overrides this with VITE_BASE.
  base: process.env.VITE_BASE || "./",
  plugins: [tsconfigPaths(), tailwindcss(), react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
