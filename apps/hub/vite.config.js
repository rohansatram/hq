import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "pages",
  publicDir: resolve(__dirname, "public"),
  server: {
    port: 3000
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "pages/index.html"),
        about: resolve(__dirname, "pages/about.html"),
        uses: resolve(__dirname, "pages/uses.html"),
        til: resolve(__dirname, "pages/til.html"),
        admin: resolve(__dirname, "pages/admin.html")
      }
    }
  }
});
