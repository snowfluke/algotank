import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// API_PORT lets a second dev stack run beside the default one.
const SERVER_PORT = Number(process.env.API_PORT ?? 8787);

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // The offline build (src/offline/target.ts) is served from any folder of a game portal, so its links are relative.
  ...(mode === "offline" ? { base: "./", build: { outDir: "dist-offline" } } : {}),
  server: {
    port: 5183,
    strictPort: true,
    // The API and its event stream live on the Bun server. The proxy keeps the browser's Host header
    // (changeOrigin off): the server refuses a sign-in whose Origin and Host differ.
    proxy: { "/api": { target: `http://localhost:${SERVER_PORT}`, changeOrigin: false } },
  },
}));
