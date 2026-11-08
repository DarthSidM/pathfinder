import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  publicDir: false,

  build: {
    outDir: "dist",
    emptyOutDir: false,

    lib: {
      entry: resolve(__dirname, "src/content/index.js"),
      name: "JobAssistantContent",
      formats: ["iife"],
      fileName: () => "content.js"
    },

    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});