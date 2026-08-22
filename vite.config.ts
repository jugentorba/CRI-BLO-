import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Relative asset URLs for Android WebView/APK Forge.
  base: "./",
  plugins: [tsconfigPaths(), tailwindcss(), react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
