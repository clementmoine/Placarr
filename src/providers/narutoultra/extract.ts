/**
 * Naruto Ultra Challenge pack extract — Catalogue Sync / worker (in-process).
 */
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import {
  harvestAnimeCollectionFaces,
  installAnimeCollectionFaces,
} from "./animecollectionFaces";
import { buildUltraChallengeFromLedgers } from "./buildFromLedgers";
import { harvestColekaAlbum } from "./colekaAlbum";
import {
  harvestColekaUltraFaces,
  installColekaUltraFaces,
} from "./colekaUltraFaces";
import { ingestUltraSealedProducts } from "./sealedProducts";
import { NARUTO_ULTRA_PACK_ID, narutoUltraCuratedDir } from "./pack";

export async function runNarutoUltraPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const harvested = await harvestColekaAlbum({ force });
  console.log(
    `── Coleka album — ${harvested.ok} visuel, ${harvested.skip} déjà là, ${harvested.fail} manqué${harvested.fail === 1 ? "" : "s"}`,
  );
  const colekaFaces = await harvestColekaUltraFaces({ force });
  console.log(
    `── Coleka faces — ${colekaFaces.pages} page(s), ${colekaFaces.cards} carte(s) : ${colekaFaces.ok} WebP, ${colekaFaces.skip} déjà là, ${colekaFaces.fail} manqué${colekaFaces.fail === 1 ? "" : "s"}`,
  );
  if (colekaFaces.rejected.length) {
    console.log(
      `── Coleka faces — ${colekaFaces.rejected.length} fiche(s) refusée(s)`,
    );
  }
  const acFaces = await harvestAnimeCollectionFaces({ force });
  console.log(
    `── AnimeCollection faces — ${acFaces.ok} h400, ${acFaces.skip} déjà là, ${acFaces.fail} manqué${acFaces.fail === 1 ? "" : "s"}`,
  );
  return runLocalTcgPipeline({
    packId: NARUTO_ULTRA_PACK_ID,
    curatedDir: narutoUltraCuratedDir(),
    label: "Naruto Ultra Challenge",
    seed: (index) => {
      const built = buildUltraChallengeFromLedgers({ index });
      if (built.skipped.length) {
        console.log(
          `── Ultra Challenge — ${built.skipped.length} écartée(s) : ${built.skipped.join(", ")}`,
        );
      }
      // AC d'abord (secours), Coleka ensuite pour les vraies photos.
      // Les gabarits Coleka (slug répété, 436×600) sont purgés puis re-couverts
      // par AC uniquement — sans réécrire les art.coleka déjà posés.
      const ac = installAnimeCollectionFaces(index);
      const coleka = installColekaUltraFaces(index);
      if (coleka.purgedPlaceholders.length) {
        installAnimeCollectionFaces(index, {
          onlyNumbers: coleka.purgedPlaceholders,
        });
      }
      console.log(
        `── Faces — Coleka ${coleka.faces}, AnimeCollection ${ac.faces}${coleka.purgedPlaceholders.length ? `, gabarit(s) Coleka→AC ${coleka.purgedPlaceholders.length}` : ""}`,
      );
      return { prints: built.prints, titles: built.titles };
    },
    seedProducts: () => ingestUltraSealedProducts(),
  });
}
