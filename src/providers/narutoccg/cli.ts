#!/usr/bin/env tsx
/**
 * Naruto — one command builds the whole pack, like `foil:lorcana` does.
 *
 * Catalogue: data/naruto/ccg/cards/<set>/<fr|en|jap>/<cardId>/
 * Curated reconstructions / pack back: src/providers/narutoccg/curated/
 *
 *   pnpm naruto:cards
 *   pnpm naruto:cards -- --only index
 *   pnpm naruto:cards -- --offline
 *
 * Curated (back + reconstructed) is always synced at the start of any run
 * (mtime) — not only with `--only reconstruct`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runNarutoChecklistCli } from "./buildCoverageChecklist";
import { runNarutoSourcesCli } from "./buildApacheIndex";
import { runNarutoFixThumbsCli } from "./fixThumbs";
import { ensureNarutoCuratedAssets } from "./installReconstructed";
import { runNarutoKnownCardsCli } from "./knownCards";
import { scrapeNarutoEnCards } from "./scrapeBandaicgCards";
import { scrapeNarutoJpCards } from "./scrapeCarddasJp";
import { scrapeNarutoCards } from "./scrapeCards";

const STEPS = [
  "scrape",
  "reconstruct",
  "index",
  "thumbs",
  "checklist",
  "known",
  "sources",
] as const;
type Step = (typeof STEPS)[number];

const ONLINE: ReadonlySet<Step> = new Set<Step>(["scrape", "checklist"]);
/** Not part of a normal pack build — regenerate curated ledgers on demand. */
const OFF_BY_DEFAULT: ReadonlySet<Step> = new Set<Step>(["sources"]);

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

function unknown(list: string[]): string[] {
  return list.filter((s) => !(STEPS as readonly string[]).includes(s));
}

/** Which steps to run, from --only / --skip / --offline. */
export function selectSteps(argv: readonly string[]): Step[] {
  const only = argListFrom(argv, "--only");
  const skip = new Set(argListFrom(argv, "--skip"));
  const offline = argv.includes("--offline");
  const base = only.length ? STEPS.filter((s) => only.includes(s)) : [...STEPS];
  return base.filter(
    (s) =>
      !skip.has(s) &&
      !(offline && ONLINE.has(s)) &&
      !(only.length === 0 && OFF_BY_DEFAULT.has(s)),
  );
}

async function runScrape(argv: readonly string[]): Promise<void> {
  const shared = {
    force: argv.includes("--force"),
    cdxOnly: argv.includes("--cdx-only"),
    cardsOnly: argv.includes("--cards-only"),
    limit: argValueFrom(argv, "--limit")
      ? Number(argValueFrom(argv, "--limit"))
      : undefined,
    concurrency: argValueFrom(argv, "--concurrency")
      ? Number(argValueFrom(argv, "--concurrency"))
      : undefined,
    delayMs: argValueFrom(argv, "--delay")
      ? Number(argValueFrom(argv, "--delay"))
      : undefined,
  };
  const raw =
    argValueFrom(argv, "--locale") ?? argValueFrom(argv, "--lang") ?? "fr";
  const locales = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const locale of locales) {
    if (locale === "fr") await scrapeNarutoCards(shared);
    else if (locale === "en") await scrapeNarutoEnCards(shared);
    else if (locale === "jap" || locale === "ja" || locale === "jp")
      await scrapeNarutoJpCards(shared);
    else {
      throw new Error(`Unknown --locale ${locale} (expected fr | en | jap).`);
    }
  }
}

/** Programmatic entry (Catalogue refresh / worker) — same steps as CLI. */
export async function runNarutoPackPipeline(
  argv: readonly string[] = process.argv,
): Promise<void> {
  const bad = unknown([
    ...argListFrom(argv, "--only"),
    ...argListFrom(argv, "--skip"),
  ]);
  if (bad.length) {
    throw new Error(
      `Unknown step(s): ${bad.join(", ")}. Expected: ${STEPS.join(" | ")}`,
    );
  }

  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  const steps = selectSteps(argv);
  console.log(`── Naruto pack — étapes : ${steps.join(" → ") || "(aucune)"}`);

  // Always sync curated → data first (mtime), even for `--only index`.
  // Edits under curated/reconstructed/ must not wait for `--only reconstruct`.
  console.log(`── curated sync${dryRun ? " (dry run)" : ""}`);
  await ensureNarutoCuratedAssets({ dryRun, force });

  for (const step of steps) {
    switch (step) {
      case "scrape":
        await runScrape(argv);
        break;
      case "reconstruct":
        // Already handled by curated sync above; keep step for `--only reconstruct`.
        break;
      case "thumbs":
        await runNarutoFixThumbsCli({ dryRun });
        break;
      case "index":
        await scrapeNarutoCards({ indexOnly: true });
        break;
      case "checklist":
        await runNarutoChecklistCli({
          forceFetch: force,
        });
        break;
      case "known":
        runNarutoKnownCardsCli();
        break;
      case "sources":
        runNarutoSourcesCli({ dryRun });
        break;
    }
  }
}

const thisFile = fileURLToPath(import.meta.url);
/** Absolute path to this CLI — admin extract spawns it without quoting provider id. */
export const NARUTO_CCG_CLI_PATH = thisFile;
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === thisFile) {
  runNarutoPackPipeline(process.argv).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
