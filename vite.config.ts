import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    port: 5173,
    host: true,
  },
  plugins: [cloudflare()],
});