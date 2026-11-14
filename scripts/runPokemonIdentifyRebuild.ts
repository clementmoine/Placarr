import { runDataPackCardIdentifyIndexes } from "@/providers/shared/cardCatalogue/identifyIndexesStep";

async function main(): Promise<void> {
  await runDataPackCardIdentifyIndexes("pokemon", {
    onLog: (line) => console.log(line),
  });
  console.log("── identify rebuild done");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
