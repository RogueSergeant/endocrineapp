import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Cross-origin isolation lets onnxruntime-web use WASM threads. Production
// gets the same headers from public/_headers on Cloudflare.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// Shown in Settings so a phone can tell which deploy it is running: the
// package version never changes between deploys.
function buildId(): string {
  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim() !== "";
    return `${sha}${dirty ? "+" : ""} · ${date} UTC`;
  } catch {
    return `${date} UTC`;
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "dev"),
    __APP_BUILD__: JSON.stringify(buildId()),
  },
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // ppu-paddle-ocr imports the default onnxruntime-web build, which
      // pulls in the WebGPU (JSEP) binary at ~28 MB: over Cloudflare's
      // 25 MiB per-asset limit and a heavy download on a phone. The
      // WASM-only build is ~14 MB (~3.6 MB compressed) and is all we use.
      {
        find: /^onnxruntime-web$/,
        replacement: fileURLToPath(
          new URL("./node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs", import.meta.url),
        ),
      },
    ],
  },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["onnxruntime-web", "ppu-paddle-ocr"] },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Registered in src/lib/appUpdate.ts, which also reloads onto updates.
      injectRegister: false,
      manifest: {
        name: "ED Scanner",
        short_name: "ED Scanner",
        description:
          "Scan cosmetic ingredient lists for endocrine disruptors. Runs entirely on your phone.",
        theme_color: "#0F766E",
        background_color: "#FAFAF9",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // Precache the app shell and substance data. The OCR models and WASM
        // runtime are left out: the OCR worker downloads them in resumable
        // chunks and caches them itself (src/lib/ocr/chunkedDownload.ts).
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
