/**
 * One-shot live crawl + install for DeckCardMania dbsjcc wiring.
 * Not part of the permanent scripts surface — run via `pnpm exec tsx`.
 */
import { harvestDbsJccDeckcardmania } from "../harvest/deckcardmania";
import { installDbsJccDeckcardmania } from "../install/deckcardmania";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { DBS_JCC_PACK_ID } from "../pack";

async function main(): Promise<void> {
  const harvest = await harvestDbsJccDeckcardmania({ delayMs: 250 });
  console.log("harvest", harvest);

  const index = createLocalPrintsIndex(DBS_JCC_PACK_ID);
  const install = await installDbsJccDeckcardmania(index, {
    downloadFaces: true,
  });
  console.log("install", JSON.stringify(install, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
