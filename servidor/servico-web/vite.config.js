import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// LSF_ALVO=claude: versão de visualização que roda dentro do Pricer publicado no claude.ai (caminhos relativos,
// sem PWA/offline, e a ponte que guarda os dados no banco do claude.ai pelo Pricer)
const PONTE = `(function(){if(window.top===window)return;var n=0,p={};function rpc(op,args){return new Promise(function(ok,fa){var id=++n;p[id]={ok:ok,fa:fa};window.parent.postMessage({lsfRpc:id,op:op,args:args||{}},"*");setTimeout(function(){if(p[id]){delete p[id];fa(new Error("O Pricer não respondeu"));}},30000);});}
window.addEventListener("message",function(e){if(e.source!==window.parent)return;var d=e.data;if(d&&d.lsfRes&&p[d.lsfRes]){var q=p[d.lsfRes];delete p[d.lsfRes];d.erro?q.fa(new Error(d.erro)):q.ok(d.valor);}});
window.__LSF_CLAUDE=true;window.__lsfRpc=rpc;
window.storage={get:function(k){return rpc("get",{k:k}).then(function(v){return v==null?null:{value:v};});},set:function(k,v){return rpc("set",{k:k,v:v}).then(function(){return{ok:true};});},delete:function(){return Promise.resolve({ok:true});}};
window.offlineSync={syncNow:function(){return Promise.resolve({ok:true});},getQueue:function(){return Promise.resolve([]);},getStatus:function(){return Promise.resolve({online:navigator.onLine,pending:0,lastSync:new Date().toISOString()});}};
var f0=window.fetch.bind(window);var R=function(o,st){return new Response(JSON.stringify(o),{status:st||200,headers:{"Content-Type":"application/json"}});};
window.fetch=function(u,o){u=String(u).split("?")[0];if(u.slice(-7)==="/api/me")return rpc("me").then(function(m){return m?R(m):R({error:"sem acesso"},401);});
if(u.slice(-20)==="/api/allocate-number")return rpc("num",JSON.parse((o&&o.body)||"{}")).then(function(x){return R({numero:x});});
if(u.slice(-11)==="/api/logout"||u.slice(-9)==="/api/sync")return Promise.resolve(R({ok:true}));return f0(u,o);};})();`;

export default defineConfig(({ mode }) => {
  const claude = process.env.LSF_ALVO === "claude";
  if (claude) return {
    base: "./",
    define: { __VITE_SYNC_TOKEN__: JSON.stringify("") },
    plugins: [react(), { name: "ponte-claude", transformIndexHtml: (h) => h.replace("<head>", () => "<head><script>" + PONTE + "</script>") }],
    build: { outDir: "../../pricer/servico-claude", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  };
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
