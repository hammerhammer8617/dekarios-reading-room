import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2020",
    outDir: "dist-reading-end",
    emptyOutDir: true,
    rollupOptions: {
      input: "reading-end.html"
    }
  }
});
