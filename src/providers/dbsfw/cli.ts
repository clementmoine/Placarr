#!/usr/bin/env tsx
/**
 * Dragon Ball Super Card Game Fusion World — Bandai fw/en cardlist → local index.
 *
 *   pnpm dbs:fw
 *   pnpm dbs:fw -- --limit 2
 *   pnpm dbs:fw -- --offline
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDbsFwCuratedAssets } from "./installCurated";
import { scrapeDbsFwCardlist } from "./scrapeCardlist";

const STEPS = ["scrape"] as const;
type Step = (typeof STEPS)[number];

function argValueFrom(
  argv: readonly string[],
  name: string,
): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function argListFrom(argv: readonly string[], name: string): string[] {
  return (argValueFrom(argv, name) ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function selectDbsFwSteps(argv: readonly string[]): Step[] {
  const only = argListFrom(argv, "--only");
  const skip = new Set(argListFrom(argv, "--skip"));
  const offline = argv.includes("--offline");
  const base = only.length
    ? STEPS.filter((step) => only.includes(step))
    : [...STEPS];
  return base.filter(
    (step) => !skip.has(step) && !(offline && step === "scrape"),
  );
}

export async function runDbsFwPackPipeline(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const steps = selectDbsFwSteps(argv);
  console.log(
    `── DBS Fusion World — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  console.log(`── curated sync${dryRun ? " (dry run)" : ""}`);
  await ensureDbsFwCuratedAssets({ dryRun, force });

  for (const step of steps) {
    if (step === "scrape") {
      await scrapeDbsFwCardlist({
        force,
        limit: argValueFrom(argv, "--limit")
          ? Number(argValueFrom(argv, "--limit"))
          : undefined,
        delayMs: argValueFrom(argv, "--delay")
          ? Number(argValueFrom(argv, "--delay"))
          : undefined,
      });
    }
  }
}

const thisFile = fileURLToPath(import.meta.url);
export const DBS_FW_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runDbsFwPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
