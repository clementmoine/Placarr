/**
 * Second-pass densify for ledger holes left after the main missing-art queue.
 *
 *   pnpm tsx scripts/runResidualMissingFaces.ts
 *   pnpm tsx scripts/runResidualMissingFaces.ts --from naruto-carddass-jap
 */
import { runYugiohPackPipeline } from "@/providers/yugioh/extract";

const STEPS = [
  "naruto-carddass-s6it",
  "naruto-carddass-jap",
  "naruto-data-carddass",
  "naruto-shippuden",
  "yugioh",
] as const;
type Step = (typeof STEPS)[number];

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

  const runners: Record<Step, () => Promise<void>> = {
    "naruto-carddass-s6it": async () => {
      const { runNarutoPackPipeline } = await import(
        "@/providers/naruto/narutocarddass/extract"
      );
      await runNarutoPackPipeline(["--only", "scrape", "--locale", "s6it"]);
    },
    "naruto-carddass-jap": async () => {
      const { runNarutoPackPipeline } = await import(
        "@/providers/naruto/narutocarddass/extract"
      );
      await runNarutoPackPipeline(["--only", "scrape", "--locale", "jap"]);
    },
    "naruto-data-carddass": async () => {
      const { runNarutoDataCarddassPackPipeline } = await import(
        "@/providers/naruto/narutodatacarddass/extract"
      );
      await runNarutoDataCarddassPackPipeline([
        "--only",
        "faces",
        "--crawl-chito",
      ]);
    },
    "naruto-shippuden": async () => {
      const { runNarutoShippudenPackPipeline } = await import(
        "@/providers/naruto/narutoshippuden/extract"
      );
      await runNarutoShippudenPackPipeline(["--only", "faces"]);
    },
    yugioh: async () => {
      await runYugiohPackPipeline(["--only", "faces", "--ygoresources-faces"]);
    },
  };

  for (const name of STEPS.slice(start)) {
    const t0 = Date.now();
    console.log(`\n════ residual ${name} ════`);
    try {
      await runners[name]();
      console.log(`── ${name} OK in ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (err) {
      console.error(`── ${name} FAILED:`, err);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
