import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about.html"),
        uses: resolve(__dirname, "uses.html")
      }
    }
  }
});
