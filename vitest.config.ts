import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@",
        replacement: resolve(process.cwd(), "src"),
      },
      {
        find: "server-only",
        replacement: resolve(
          process.cwd(),
          "tests/helpers/server-only-stub.ts",
        ),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    // Cap workers so parallel Prisma/pg pools don't exhaust Postgres
    // max_connections (see src/lib/db/prisma.ts PRISMA_PG_POOL_MAX).
    maxWorkers: 4,
    // Les tests "golden-master" (fixtures rejouées) peuvent être plus longs ;
    // l'enregistrement live (RECORD=1) encore plus.
    testTimeout: process.env.RECORD ? 90000 : 15000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/types/**",
        "src/**/types.ts",
        "src/messages/**",
      ],
      reporter: ["text-summary", "text"],
    },
  },
});
