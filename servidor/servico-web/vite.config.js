import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Lê web/.env (VITE_SYNC_TOKEN) e injeta como constante global no build,
  // substituindo __VITE_SYNC_TOKEN__ pelo valor literal (sem depender de
  // import.meta, que exige contexto de módulo ES).
  const env = loadEnv(mode, process.cwd(), "");

  return {
  // módulo de serviço do servidor LS Fire: fica em /servico/ (o Pricer fica em /); o login é do servidor
  base: "/servico/",
  define: {
    __VITE_SYNC_TOKEN__: JSON.stringify(""),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,        // o próprio app registra /sw.js
      filename: "sw.js",
      includeAssets: ["icon-192.png", "icon-512.png", "favicon.ico"],
      manifest: {
        name: "LS Fire — Serviço de campo",
        short_name: "LS Serviço",
        description: "Inspeção, testes e manutenção de sistemas de bombeamento contra incêndio (NFPA 25 / NFPA 20).",
        theme_color: "#FF6600",
        background_color: "#FFFFFF",
        display: "standalone",
        orientation: "portrait",
        start_url: "/servico/",
        scope: "/servico/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
        navigateFallback: "/servico/index.html",
        navigateFallbackDenylist: [/^\/(?!servico\/)/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly"   // sync nunca é cacheado
          }
        ]
      }
    })
  ],
  build: { outDir: "../public/servico", emptyOutDir: true, chunkSizeWarningLimit: 4000 }
  };
});
