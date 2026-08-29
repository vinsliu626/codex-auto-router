import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/web",
    emptyOutDir: false,
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
