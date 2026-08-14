#!/usr/bin/env tsx
/**
 * Dragon Ball Super Card Game (Masters) — Bandai cardlist + Deckplanet faces.
 *
 *   pnpm dbs:cards
 *   pnpm dbs:cards -- --limit 2
 *   pnpm dbs:cards -- --only faces
 *   pnpm dbs:cards -- --skip faces
 *   pnpm dbs:cards -- --offline
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchDbsCgFaces } from "./fetchFaces";
import { ensureDbsCgCuratedAssets } from "./installCurated";
import { scrapeDbsCgCardlist } from "./scrapeCardlist";

const STEPS = ["scrape", "faces"] as const;
type Step = (typeof STEPS)[number];
const ONLINE = new Set<Step>(["scrape", "faces"]);

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

export function selectDbsCgSteps(argv: readonly string[]): Step[] {
  const only = argListFrom(argv, "--only");
  const skip = new Set(argListFrom(argv, "--skip"));
  const offline = argv.includes("--offline");
  const base = only.length
    ? STEPS.filter((step) => only.includes(step))
    : [...STEPS];
  return base.filter(
    (step) => !skip.has(step) && !(offline && ONLINE.has(step)),
  );
}

function optionalNumber(
  argv: readonly string[],
  name: string,
): number | undefined {
  const raw = argValueFrom(argv, name);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `--limit` on a full run caps Bandai series, not individual faces.
 * Print cap only applies to `--only faces`.
 */
export function dbsCgFaceDownloadLimit(
  argv: readonly string[],
  steps: readonly string[],
): number | undefined {
  if (steps.includes("scrape")) return undefined;
  return optionalNumber(argv, "--limit");
}

export async function runDbsCgPackPipeline(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const steps = selectDbsCgSteps(argv);
  console.log(
    `── DBS Masters — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  console.log(`── curated sync${dryRun ? " (dry run)" : ""}`);
  await ensureDbsCgCuratedAssets({ dryRun, force });

  for (const step of steps) {
    if (step === "scrape") {
      await scrapeDbsCgCardlist({
        force,
        limit: optionalNumber(argv, "--limit"),
        delayMs: optionalNumber(argv, "--delay"),
      });
    }
    if (step === "faces") {
      await fetchDbsCgFaces({
        force,
        limit: dbsCgFaceDownloadLimit(argv, steps),
        delayMs: optionalNumber(argv, "--delay"),
        concurrency: optionalNumber(argv, "--concurrency"),
      });
    }
  }
}

const thisFile = fileURLToPath(import.meta.url);
export const DBS_CG_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runDbsCgPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
