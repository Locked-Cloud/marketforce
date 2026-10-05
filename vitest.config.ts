import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Mirrors vite.config.ts resolve.alias ("@" → ./src) so colocated tests can
// import modules the same way app code does. Tests are pure node — the
// challenge twins are in-memory API modules, no DOM needed (which is also
// why the suite runs without jsdom).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
