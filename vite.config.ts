import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  root: "client",
  define: {
    // developer tools (debug overlay, simulation clock, video calibration) are compiled out of
    // public builds unless VITE_ENABLE_DEV_TOOLS=true is set explicitly
    __DEV_TOOLS__: JSON.stringify(
      mode !== "production" || process.env.VITE_ENABLE_DEV_TOOLS === "true",
    ),
  },
  plugins: [react()],
  resolve: {
    alias: { "@shared": path.resolve(__dirname, "shared") },
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    // never inline font slices into CSS (Japanese fonts are split into many small files)
    assetsInlineLimit: 0,
  },
  test: {
    root: __dirname,
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
  },
}));
