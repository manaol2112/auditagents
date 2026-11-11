import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Production output is served by the Fastify workspace server (src/server.ts), which adds the CSP and security headers.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,              // never ship source maps: they disclose source and comments
    assetsInlineLimit: 0,          // no data: URIs; every asset is a same-origin file the CSP allows
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
  },
  server: {
    host: "127.0.0.1",             // loopback only: the dev server must not be reachable from the network
    port: 5173,
    strictPort: true,
    fs: { strict: true },
    proxy: { "/api": { target: "http://127.0.0.1:8765", changeOrigin: false } },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
