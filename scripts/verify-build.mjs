import { build } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

await build({
  configFile: false,
  root: process.cwd(),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["favicon.ico", "lovable-uploads/*.png"],
      manifest: {
        name: "Aleph Order Tracker",
        short_name: "Aleph Orders",
        description: "Aleph Engineering and Supplies - Order Management System",
        theme_color: "#7c3aed",
        background_color: "#f8fafc",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") }, dedupe: ["react", "react-dom"] },
  build: { outDir: "dist", emptyOutDir: true },
});
