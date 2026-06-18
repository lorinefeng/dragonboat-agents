import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.VITE_DRAGONBOAT_API_URL ?? process.env.DRAGONBOAT_API_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: apiTarget,
        ws: true
      }
    }
  }
});
