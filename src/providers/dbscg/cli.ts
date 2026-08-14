#!/usr/bin/env tsx
/**
 * Dragon Ball Super Card Game (Masters) — Bandai FR+EN cardlists + TCG Arena dump.
 *
 *   pnpm dbs:cards
 *   pnpm dbs:cards -- --only arena
 *   pnpm dbs:cards -- --skip faces
 *   pnpm dbs:cards -- --offline          # range le clone déjà là, pas de HTTP
 *   pnpm dbs:cards -- --langs fr         # une locale (défaut: fr,en)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchDbsCgFaces } from "./fetchFaces";
import { ensureArenaClone, installArenaFaces } from "./installArena";
import { ensureDbsCgCuratedAssets } from "./installCurated";
import type { DbsCardlistLocaleId } from "./parseCardlist";
import { scrapeDbsCgCardlist } from "./scrapeCardlist";

const STEPS = ["scrape", "arena", "faces"] as const;
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

/** `--langs fr,en` (default both). Unknown tokens are dropped. */
export function dbsCgScrapeLangs(
  argv: readonly string[],
): DbsCardlistLocaleId[] {
  const picked = argListFrom(argv, "--langs").filter(
    (value): value is DbsCardlistLocaleId => value === "fr" || value === "en",
  );
  return picked.length ? picked : ["fr", "en"];
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

/** Print cap for `--only arena`. A full run ranges the whole dump. */
export function dbsCgArenaLimit(
  argv: readonly string[],
  steps: readonly string[],
): number | undefined {
  if (steps.length !== 1 || steps[0] !== "arena") return undefined;
  return optionalNumber(argv, "--limit");
}

export async function runDbsCgPackPipeline(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const offline = argv.includes("--offline");
  const langs = dbsCgScrapeLangs(argv);
  const steps = selectDbsCgSteps(argv);
  console.log(
    `── DBS Masters — étapes : ${steps.join(" → ") || "(curated only)"} [${langs.join(",")}]`,
  );

  console.log(`── curated sync${dryRun ? " (dry run)" : ""}`);
  await ensureDbsCgCuratedAssets({ dryRun, force });

  for (const step of steps) {
    if (step === "scrape") {
      await scrapeDbsCgCardlist({
        force,
        langs,
        limit: optionalNumber(argv, "--limit"),
        delayMs: optionalNumber(argv, "--delay"),
      });
    }
    if (step === "arena") {
      const ready = ensureArenaClone({ offline });
      if (!ready) {
        console.warn("── arena : rien à ranger");
      } else {
        await installArenaFaces({
          force,
          limit: dbsCgArenaLimit(argv, steps),
        });
      }
    }
    if (step === "faces") {
      await fetchDbsCgFaces({
        force,
        langs,
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
