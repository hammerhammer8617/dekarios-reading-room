import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const mammothBrowserBuild = new URL(
  "./node_modules/mammoth/mammoth.browser.js",
  import.meta.url
).pathname;

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      mammoth: mammothBrowserBuild
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  },
  build: {
    target: "es2020"
  }
});
