/**
 * Naruto Ultra Challenge pack extract — Catalogue Sync / worker (in-process).
 *
 * STEPS (`--only` / `--skip` / `--offline`) : `seed` · `faces` · `products`.
 */
import { selectCatalogueSteps } from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { buildUltraChallengeFromLedgers } from "./pipeline/ledgers";
import {
  harvestAnimeCollectionFaces,
  harvestColekaAlbum,
  harvestColekaUltraFaces,
  installAnimeCollectionFaces,
  installColekaUltraFaces,
} from "./sources/faces";
import { harvestColekaUltraPrices } from "./harvest/colekaPrices";
import { ingestUltraSealedProducts } from "./sealed";
import { NARUTO_ULTRA_PACK_ID, narutoUltraCuratedDir } from "./pack";

export const NARUTO_ULTRA_STEPS = ["seed", "faces", "products"] as const;
export type NarutoUltraStep = (typeof NARUTO_ULTRA_STEPS)[number];
const NARUTO_ULTRA_ONLINE = new Set<NarutoUltraStep>(["faces"]);

export function selectNarutoUltraSteps(
  argv: readonly string[],
): NarutoUltraStep[] {
  return selectCatalogueSteps(argv, NARUTO_ULTRA_STEPS, {
    online: NARUTO_ULTRA_ONLINE,
  });
}

export async function runNarutoUltraPackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const force = argv.includes("--force");
  const offline = argv.includes("--offline");
  const steps = selectNarutoUltraSteps(argv);
  console.log(
    `── Naruto Ultra Challenge — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  if (steps.includes("faces") && !offline) {
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
    try {
      const colekaPrices = await harvestColekaUltraPrices();
      console.log(
        `── Coleka deals prices — ${colekaPrices.ledger.withPrintKey} printKey (cote ${colekaPrices.ledger.withQuotation})`,
      );
    } catch (err) {
      console.warn(
        `── Coleka deals prices — ${err instanceof Error ? err.message : err}`,
      );
    }
    const acFaces = await harvestAnimeCollectionFaces({ force });
    console.log(
      `── AnimeCollection faces — ${acFaces.ok} h400, ${acFaces.skip} déjà là, ${acFaces.fail} manqué${acFaces.fail === 1 ? "" : "s"}`,
    );
  }

  return runLocalTcgPipeline({
    packId: NARUTO_ULTRA_PACK_ID,
    curatedDir: narutoUltraCuratedDir(),
    label: "Naruto Ultra Challenge",
    seed: (index) => {
      let prints = 0;
      let titles = 0;
      if (steps.includes("seed")) {
        const built = buildUltraChallengeFromLedgers({ index });
        prints = built.prints;
        titles = built.titles;
        if (built.skipped.length) {
          console.log(
            `── Ultra Challenge — ${built.skipped.length} écartée(s) : ${built.skipped.join(", ")}`,
          );
        }
      }
      if (steps.includes("faces")) {
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
      }
      return { prints, titles };
    },
    seedProducts: steps.includes("products")
      ? () => ingestUltraSealedProducts()
      : undefined,
  });
}
