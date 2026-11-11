/**
 * Second-pass densify for ledger holes left after the main missing-art queue.
 *
 *   pnpm tsx scripts/runResidualMissingFaces.ts
 */
import { runYugiohPackPipeline } from "@/providers/yugioh/extract";

async function main(): Promise<void> {
  const steps: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: "naruto-carddass-s6it",
      run: async () => {
        const { runNarutoPackPipeline } = await import(
          "@/providers/naruto/narutocarddass/extract"
        );
        await runNarutoPackPipeline(["--only", "scrape", "--locale", "s6it"]);
      },
    },
    {
      name: "naruto-carddass-jap",
      run: async () => {
        const { runNarutoPackPipeline } = await import(
          "@/providers/naruto/narutocarddass/extract"
        );
        await runNarutoPackPipeline(["--only", "scrape", "--locale", "jap"]);
      },
    },
    {
      name: "naruto-data-carddass",
      run: async () => {
        const { runNarutoDataCarddassPackPipeline } = await import(
          "@/providers/naruto/narutodatacarddass/extract"
        );
        await runNarutoDataCarddassPackPipeline([
          "--only",
          "faces",
          "--crawl-chito",
        ]);
      },
    },
    {
      name: "naruto-shippuden",
      run: async () => {
        const { runNarutoShippudenPackPipeline } = await import(
          "@/providers/naruto/narutoshippuden/extract"
        );
        await runNarutoShippudenPackPipeline(["--only", "faces"]);
      },
    },
    {
      name: "yugioh",
      run: async () => {
        await runYugiohPackPipeline(["--only", "faces", "--ygoresources-faces"]);
      },
    },
  ];

  for (const step of steps) {
    const t0 = Date.now();
    console.log(`\n════ residual ${step.name} ════`);
    try {
      await step.run();
      console.log(
        `── ${step.name} OK in ${Math.round((Date.now() - t0) / 1000)}s`,
      );
    } catch (err) {
      console.error(`── ${step.name} FAILED:`, err);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
