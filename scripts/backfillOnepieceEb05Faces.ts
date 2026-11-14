/**
 * Backfill missing EB-05 Bandai faces (titles already seeded).
 * Usage: pnpm exec tsx scripts/backfillOnepieceEb05Faces.ts
 */
import { ONEPIECE_PACK_ID } from "@/providers/onepiece/pack";
import { installOnepieceBandaiFaces } from "@/providers/onepiece/punkRecords";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

async function main() {
  const index = createLocalPrintsIndex(ONEPIECE_PACK_ID);
  const result = await installOnepieceBandaiFaces(index, {
    sets: ["eb05"],
    delayMs: 20,
  });
  console.log("EB05 faces", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
