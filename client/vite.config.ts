import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The manifest lets scripts/check-budget.mjs check the chunk split after each build.
    manifest: true,
    // Three.js is large on purpose (landing-only 3D hero, loaded lazily).
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    // In local dev, forward API calls to the Express server.
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
