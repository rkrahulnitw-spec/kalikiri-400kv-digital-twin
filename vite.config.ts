/// <reference types="node" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const base = process.env["VITE_BASE_PATH"] ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          ui:    ["lucide-react"]
        }
      }
    }
  }
});
