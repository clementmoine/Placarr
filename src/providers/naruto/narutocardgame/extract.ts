/**
 * Naruto Card Game (Bandai 2027) — Catalogue Sync.
 * STEPS : `seed` · `market` (FR+JA) · `tcghub` · `guide` · `sim` · `fest` · `products`.
 */
import { selectCatalogueSteps } from "@/providers/shared/cardCatalogue/catalogueSteps";
import { runLocalTcgPipeline } from "@/providers/shared/cardCatalogue/localTcgLinePipeline";

import { installNarutoCardgameWelcomeGallery } from "./install/fromWelcomeGallery";
import { NARUTO_CARDGAME_PACK_ID, narutoCardgameCuratedDir } from "./pack";
import { ingestNarutoCardgameSealedProducts } from "./sealed";
import {
  ensureBandaiFestPremiumPackshot,
  installBandaiFestPremiumVol00,
} from "./sources/bandaiFestPremium";
import {
  harvestNarutoCardGuide,
  installNarutoCardGuide,
} from "./sources/narutocardguide";
import {
  harvestNarutoMarketCards,
  installNarutoMarketCards,
} from "./sources/narutomarket";
import {
  harvestNarutoMarketSim,
  installNarutoMarketSim,
} from "./sources/narutomarketSim";
import {
  harvestNarutoTcgCards,
  installNarutoTcgCards,
} from "./sources/narutotcgcards";

export const NARUTO_CARDGAME_STEPS = [
  "seed",
  "market",
  "tcghub",
  "guide",
  "sim",
  "fest",
  "products",
] as const;
export type NarutoCardgameStep = (typeof NARUTO_CARDGAME_STEPS)[number];

/** CDN Bandai + narutomarket + narutotcgcards + narutocardguide + sim + Fest. */
const NARUTO_CARDGAME_ONLINE = new Set<NarutoCardgameStep>([
  "seed",
  "market",
  "tcghub",
  "guide",
  "sim",
  "fest",
]);

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
      let prints = 0;
      let titles = 0;

      if (steps.includes("seed")) {
        const installed = await installNarutoCardgameWelcomeGallery(index, {
          downloadFaces: true,
        });
        console.log(
          `── Naruto Card Game gallery — ${installed.prints} prints, ${installed.titles} titres, ${installed.faces} faces`,
        );
        prints += installed.prints;
        titles += installed.titles;
      }

      if (steps.includes("market")) {
        for (const locale of ["fr", "ja"] as const) {
          const harvested = await harvestNarutoMarketCards({ locale });
          console.log(
            `── narutomarket[${locale}] — listing ${harvested.listed}, détails ${harvested.details}, fetch ${harvested.fetched}`,
          );
          const market = await installNarutoMarketCards(index, {
            downloadFaces: true,
            locale,
          });
          console.log(
            `── narutomarket[${locale}] — ${market.prints} prints, ${market.titles} titres, ${market.faces} faces (skip artwork ${market.skippedArtwork})`,
          );
          prints += market.prints;
          titles += market.titles;
        }
      }

      if (steps.includes("tcghub")) {
        const harvested = await harvestNarutoTcgCards({});
        console.log(
          `── narutotcgcards — listing ${harvested.listed}, détails ${harvested.details}, fetch ${harvested.fetched}`,
        );
        const hub = await installNarutoTcgCards(index, {
          downloadFaces: true,
        });
        console.log(
          `── narutotcgcards — ${hub.prints} prints, ${hub.titles} titres, ${hub.faces} faces (skip ${hub.skipped})`,
        );
        prints += hub.prints;
        titles += hub.titles;
      }

      if (steps.includes("guide")) {
        const harvested = await harvestNarutoCardGuide({});
        console.log(
          `── narutocardguide — listing ${harvested.listed}, fetch ${harvested.fetched}`,
        );
        const guide = await installNarutoCardGuide(index, {
          downloadFaces: true,
        });
        console.log(
          `── narutocardguide — ${guide.prints} prints, ${guide.titles} titres, ${guide.faces} faces (skip ${guide.skipped})`,
        );
        prints += guide.prints;
        titles += guide.titles;
      }

      if (steps.includes("sim")) {
        const harvested = await harvestNarutoMarketSim({});
        const parts = Object.entries(harvested.locales)
          .map(([loc, s]) => `${loc}:${s.listed}`)
          .join(" ");
        console.log(`── narutomarket sim — ${parts}`);
        const sim = await installNarutoMarketSim(index, {
          downloadFaces: true,
        });
        console.log(
          `── narutomarket sim — ${sim.prints} prints, ${sim.titles} titres, ${sim.faces} faces (skip ${sim.skipped})`,
        );
        prints += sim.prints;
        titles += sim.titles;
      }

      if (steps.includes("fest")) {
        const fest = await installBandaiFestPremiumVol00(index, {
          downloadFaces: true,
        });
        console.log(
          `── bandai fest premium vol.00 — ${fest.prints} prints, ${fest.titles} titres JP, ${fest.faces} faces`,
        );
        prints += fest.prints;
        titles += fest.titles;
        const packshot = await ensureBandaiFestPremiumPackshot();
        if (packshot) {
          console.log(`── bandai fest — packshot → ${packshot}`);
        }
      }

      return { prints, titles };
    },
    seedProducts: steps.includes("products")
      ? async () => {
          await ensureBandaiFestPremiumPackshot();
          const sealed = ingestNarutoCardgameSealedProducts();
          console.log(
            `── Naruto Card Game sealed — ${sealed.written} SKU (skip ${sealed.skipped})`,
          );
          return sealed;
        }
      : undefined,
    writeLocaleSpecificFacesFromIndex: {
      catalogueLocales: ["ja", "fr", "en"],
      note: "JA original + EN + FR — gallery Bandai, narutomarket, play#sim, guide, Fest Premium",
    },
  });
}
