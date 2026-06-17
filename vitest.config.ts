import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    // Les tests "golden-master" (fixtures rejouées) peuvent être plus longs ;
    // l'enregistrement live (RECORD=1) encore plus.
    testTimeout: process.env.RECORD ? 90000 : 15000,
  },
});
