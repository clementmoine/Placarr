/**
 * One-shot: seed DON!! from don-cardlist extract + backfill EB-05 Bandai faces.
 * Usage: pnpm exec tsx scripts/seedOnepieceDonAndEb05.ts
 */
import {
  installOnepieceDonCardlistFaces,
  seedOnepieceDonFromCardlist,
} from "@/providers/onepiece/donCardlist";
import { ONEPIECE_PACK_ID } from "@/providers/onepiece/pack";
import { installOnepieceBandaiFaces } from "@/providers/onepiece/punkRecords";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

async function main() {
  const index = createLocalPrintsIndex(ONEPIECE_PACK_ID);
  const seeded = seedOnepieceDonFromCardlist(index);
  console.log("DON seed", seeded);
  const donFaces = await installOnepieceDonCardlistFaces(index, {
    force: false,
  });
  console.log("DON faces", donFaces);
  console.log("EB05 faces…");
  const eb05 = await installOnepieceBandaiFaces(index, {
    sets: ["eb05"],
    delayMs: 30,
  });
  console.log("EB05 faces", eb05);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
