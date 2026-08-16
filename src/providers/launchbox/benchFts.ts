#!/usr/bin/env tsx
/**
 * Measure LaunchBox local FTS candidate collection against a prebuilt index.
 * Does not download or rebuild — run `pnpm launchbox:build-index` first.
 *
 * Usage: `pnpm launchbox:bench-fts`
 */
import {
  collectLaunchBoxCandidateIds,
  countLaunchBoxFtsMatchPlans,
  LAUNCHBOX_FTS_MATCH_PLAN_BUDGET,
} from "@/providers/launchbox/resolver";
import {
  ensureLaunchBoxIndex,
  getLaunchBoxIndexPath,
} from "@/providers/launchbox/indexStore";

const SAMPLE_QUERIES = [
  "GoldenEye: Rogue Agent",
  "Mario Kart",
  "The Legend of Zelda",
  "Final Fantasy VII",
  "Tom Clancy's Rainbow Six 3",
  "Alan Wake II Deluxe Edition",
  "Super Mario Bros.",
  "Metal Gear Solid",
  "Resident Evil 4",
  "Pokémon Red",
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index]!;
}

async function main() {
  const db = await ensureLaunchBoxIndex();
  if (!db) {
    console.error(
      `No LaunchBox index at ${getLaunchBoxIndexPath()}. Run \`pnpm launchbox:build-index\` first.`,
    );
    process.exit(1);
  }

  const gameCount = (
    db.prepare("SELECT COUNT(*) AS count FROM games").get() as
      { count?: number } | undefined
  )?.count;

  console.log(
    `LaunchBox FTS bench — index ${getLaunchBoxIndexPath()} (${typeof gameCount === "number" ? gameCount : "?"} games)`,
  );
  console.log(
    `Match-plan budget: ≤${LAUNCHBOX_FTS_MATCH_PLAN_BUDGET} plans/title`,
  );
  console.log("");

  const durationsMs: number[] = [];
  let maxPlans = 0;
  let maxCandidates = 0;

  for (const query of SAMPLE_QUERIES) {
    const plans = countLaunchBoxFtsMatchPlans(query);
    maxPlans = Math.max(maxPlans, plans);

    const start = performance.now();
    const candidates = collectLaunchBoxCandidateIds(db, query);
    const ms = performance.now() - start;
    durationsMs.push(ms);
    maxCandidates = Math.max(maxCandidates, candidates.length);

    console.log(
      `${ms.toFixed(1).padStart(7)} ms | plans=${String(plans).padStart(2)} | hits=${String(candidates.length).padStart(4)} | ${query}`,
    );
  }

  const sorted = [...durationsMs].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);

  console.log("");
  console.log(
    `p50=${p50.toFixed(1)} ms  p95=${p95.toFixed(1)} ms  maxPlans=${maxPlans}  maxCandidates=${maxCandidates}`,
  );

  // Soft keep/remove signal for docs — not a CI fail on slow machines.
  if (p95 > 100) {
    console.warn(
      "WARN: p95 > 100ms — investigate FTS plan size or index health before relying on LaunchBox at scan.",
    );
  } else {
    console.log(
      "OK: p95 ≤ 100ms on this machine (keep LaunchBox local index).",
    );
  }

  if (maxPlans > LAUNCHBOX_FTS_MATCH_PLAN_BUDGET) {
    console.warn(
      `WARN: max match plans ${maxPlans} > budget ${LAUNCHBOX_FTS_MATCH_PLAN_BUDGET}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
