/**
 * Naruto Card Game (Bandai 2027) — Catalogue Sync.
 * STEPS : `seed` (galerie SAMPLE) · `products` (display FR…).
 */
import { selectCatalogueSteps } from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { installNarutoCardgameWelcomeGallery } from "./install/fromWelcomeGallery";
import { NARUTO_CARDGAME_PACK_ID, narutoCardgameCuratedDir } from "./pack";
import { ingestNarutoCardgameSealedProducts } from "./sealed";

export const NARUTO_CARDGAME_STEPS = ["seed", "products"] as const;
export type NarutoCardgameStep = (typeof NARUTO_CARDGAME_STEPS)[number];

/** CDN Bandai pour les faces gallery. */
const NARUTO_CARDGAME_ONLINE = new Set<NarutoCardgameStep>(["seed"]);

export function selectNarutoCardgameSteps(
  argv: readonly string[],
): NarutoCardgameStep[] {
  return selectCatalogueSteps(argv, NARUTO_CARDGAME_STEPS, {
    online: NARUTO_CARDGAME_ONLINE,
  });
}

export async function runNarutoCardgamePackPipeline(
  argv: readonly string[] = [],
): Promise<{ cards: number; products: number }> {
  const steps = selectNarutoCardgameSteps(argv);
  console.log(
    `── Naruto Card Game — étapes : ${steps.join(" → ") || "(curated only)"}`,
  );

  return runLocalTcgPipeline({
    packId: NARUTO_CARDGAME_PACK_ID,
    curatedDir: narutoCardgameCuratedDir(),
    label: "Naruto Card Game",
    seed: async (index) => {
      if (!steps.includes("seed")) return { prints: 0, titles: 0 };
      const installed = await installNarutoCardgameWelcomeGallery(index, {
        downloadFaces: true,
      });
      console.log(
        `── Naruto Card Game gallery — ${installed.prints} prints, ${installed.titles} titres, ${installed.faces} faces`,
      );
      return { prints: installed.prints, titles: installed.titles };
    },
    seedProducts: steps.includes("products")
      ? () => {
          const sealed = ingestNarutoCardgameSealedProducts();
          console.log(
            `── Naruto Card Game sealed — ${sealed.written} SKU (skip ${sealed.skipped})`,
          );
          return sealed;
        }
      : undefined,
    writeLocaleSpecificFacesFromIndex: {
      catalogueLocales: ["en", "ja"],
      note: "Bandai welcome gallery — EN + JP SAMPLE faces",
    },
  });
}
