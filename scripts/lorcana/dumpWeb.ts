#!/usr/bin/env tsx
/**
 * CLI shim — logic lives in `@/providers/lorcanatcg/dumpWeb`.
 *
 *   tsx scripts/lorcana/dumpWeb.ts --repo .
 */
import path from "node:path";

import { dumpLorcanaWeb } from "@/providers/lorcanatcg/dumpWeb";
import { repoRoot } from "../lib/foilPaths";

function parseRepoArg(argv: string[]): string {
  const i = argv.indexOf("--repo");
  if (i >= 0 && argv[i + 1]) return path.resolve(argv[i + 1]!);
  return repoRoot();
}

dumpLorcanaWeb({ root: parseRepoArg(process.argv.slice(2)) }).catch((err) => {
  console.error(err);
  process.exit(1);
});
