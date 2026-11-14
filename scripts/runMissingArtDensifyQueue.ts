/**
 * Sequential face densify for the admin « sans image » backlog.
 *
 *   pnpm tsx scripts/runMissingArtDensifyQueue.ts
 *   pnpm tsx scripts/runMissingArtDensifyQueue.ts --from yugioh
 *
 * Pokémon paper-faces is launched separately (long); this queue covers
 * YGO → DB JCC → Carddass → DataCarddass → Shippuden.
 */
import { runYugiohPackPipeline } from "@/providers/yugioh/extract";
import { runDbsJccPackPipeline } from "@/providers/dragonball/dbsjcc/extract";

const STEPS = ["yugioh", "dbs-jcc", "naruto", "naruto-data-carddass", "naruto-shippuden"] as const;
type Step = (typeof STEPS)[number];

async function runNarutoCarddass(argv: string[]): Promise<void> {
  const { runNarutoPackPipeline } = await import(
    "@/providers/naruto/narutocarddass/extract"
  );
  await runNarutoPackPipeline(argv);
}

async function runDataCarddass(argv: string[]): Promise<void> {
  const { runNarutoDataCarddassPackPipeline } = await import(
    "@/providers/naruto/narutodatacarddass/extract"
  );
  await runNarutoDataCarddassPackPipeline(argv);
}

async function runShippuden(argv: string[]): Promise<void> {
  const { runNarutoShippudenPackPipeline } = await import(
    "@/providers/naruto/narutoshippuden/extract"
  );
  await runNarutoShippudenPackPipeline(argv);
}

async function runStep(step: Step): Promise<void> {
  console.log(`\n════ densify ${step} ════`);
  switch (step) {
    case "yugioh":
      await runYugiohPackPipeline(["--only", "faces", "--ygoresources-faces"]);
      return;
    case "dbs-jcc":
      await runDbsJccPackPipeline(["--only", "faces"]);
      return;
    case "naruto":
      // No dedicated `faces` step — IT holes live under scrape (Coleka S6 IT + eBay IT).
      await runNarutoCarddass(["--only", "scrape", "--locale", "s6it"]);
      return;
    case "naruto-data-carddass":
      await runDataCarddass(["--only", "faces", "--crawl-chito"]);
      return;
    case "naruto-shippuden":
      await runShippuden(["--only", "faces"]);
      return;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const fromIdx = argv.indexOf("--from");
  const from = fromIdx >= 0 ? String(argv[fromIdx + 1] ?? "") : "";
  let start = 0;
  if (from) {
    const i = STEPS.indexOf(from as Step);
    if (i < 0) {
      throw new Error(`Unknown --from ${from}; expected ${STEPS.join("|")}`);
    }
    start = i;
  }

  for (const step of STEPS.slice(start)) {
    const t0 = Date.now();
    try {
      await runStep(step);
      console.log(`── ${step} OK in ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (err) {
      console.error(`── ${step} FAILED:`, err);
      process.exitCode = 1;
      // Continue the queue — remaining packs still worth densifying.
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
