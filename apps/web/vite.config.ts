import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// API_PORT lets a second dev stack run beside the default one.
const SERVER_PORT = Number(process.env.API_PORT ?? 8787);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5183,
    strictPort: true,
    // The API and its event stream live on the Bun server. The proxy keeps the browser's Host header
    // (changeOrigin off): the server refuses a sign-in whose Origin and Host differ.
    proxy: { "/api": { target: `http://localhost:${SERVER_PORT}`, changeOrigin: false } },
  },
});
