import { existsSync } from "node:fs";
import path from "node:path";

import {
  harvestColekaMcdoBranch,
  readColekaMcdoFrLedger,
} from "../src/providers/tcgdex/coleka/scrapeColekaPokemonFaces";
import { fillTcgplayerMcdo2023 } from "../src/providers/tcgdex/faces/fillTcgplayer";
import { rebuildPokemonCardsIndex } from "../src/providers/pokemontcglive/rebuildCardsIndex";

async function main() {
  const fr = readColekaMcdoFrLedger().branches.find((b) => b.id === "m23fr");
  if (!fr) throw new Error("no m23fr");
  const coleka = await harvestColekaMcdoBranch(fr, {});
  console.log("coleka", coleka);
  const tcgp = await fillTcgplayerMcdo2023({});
  console.log("tcgplayer", tcgp);
  const idx = rebuildPokemonCardsIndex();
  console.log("index cards", idx.cards);
  for (const id of ["004", "005", "007", "008"]) {
    const frArt = path.join(
      "data/pokemon/cards/2023sv/fr",
      id,
      "art.coleka.webp",
    );
    const enArt = path.join(
      "data/pokemon/cards/2023sv/en",
      id,
      "art.tcgplayer.jpg",
    );
    console.log(id, "fr", existsSync(frArt), "en", existsSync(enArt));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
