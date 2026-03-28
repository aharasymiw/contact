import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "client");

export default defineConfig({
  root: rootDirectory,
  appType: "spa",
  plugins: [tailwindcss()],
  build: {
    outDir: path.resolve(rootDirectory, "../dist/client"),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
