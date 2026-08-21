#!/usr/bin/env tsx
/**
 * Naruto 疾風伝 — relance la passe du pack.
 *
 *   pnpm naruto:shippuden
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { refreshNarutoShippudenCatalog } from "./pipeline";

export async function runNarutoShippudenPackPipeline(): Promise<void> {
  await refreshNarutoShippudenCatalog();
}

const thisFile = fileURLToPath(import.meta.url);
export const NARUTO_SHIPPUDEN_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runNarutoShippudenPackPipeline().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
