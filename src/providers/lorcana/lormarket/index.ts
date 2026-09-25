/**
 * Prix-only — Cardmarket EUR from the local `lorcards-fr.json` list dump.
 *
 * Symétrique de {@link pkmmarketModule} / {@link opemarketModule}.
 * Le scrape scellé lorcards ne remplit pas `/cards` — ce module consomme le
 * dump liste une fois récolté (`ensureLorcardsListDump` / Catalogue Sync).
 */
import { createPrintKeyPriceModule } from "@/providers/shared/createPrintKeyPriceModule";
import { cardsFrShopPrintKey } from "@/providers/shared/tcgcards/cardsFrPrintRef";
import {
  fetchMappedCardsFrCardForPrintKey,
  type CardsFrMappedPriceSpec,
} from "@/providers/shared/tcgcards/cardsFrPriceFetch";
import type { DbscardsPriceCard } from "@/providers/shared/tcgcards/priceIndex";
import { lorcardsIndexPath } from "@/providers/shared/tcgcards/scrapeList";
import type { DbscardsTile } from "@/providers/shared/tcgcards/tile";
import {
  loadLorcanaSetLogoIndex,
  lorcanaCatalogueSetIdForProduct,
} from "@/providers/lorcana/lorcanatcg/sources/setLogos";

const LORCANA_GAME = "lorcana";

/** Shop tile → `lorcana:set-number` (numeric shop set via logo catalogue map). */
export function lorcardsTileToPrintKey(
  tile: Pick<DbscardsTile, "slug" | "ref" | "name" | "imageFront">,
): string | null {
  return cardsFrShopPrintKey({
    game: LORCANA_GAME,
    print: {
      slug: tile.slug,
      ref: tile.ref,
      name: tile.name,
      image: tile.imageFront,
    },
    resolveCatalogueSetId: ({ setCode, slug, name }) => {
      const fromLogos = lorcanaCatalogueSetIdForProduct({
        setCode,
        slug,
        name,
        index: loadLorcanaSetLogoIndex(),
      });
      if (fromLogos) return fromLogos;
      // Cold logo index: chapter numbers are already the catalogue set id.
      const bare = setCode?.trim() ?? "";
      return /^\d+$/.test(bare) ? bare : null;
    },
  });
}

const SPEC: CardsFrMappedPriceSpec = {
  cacheId: "lormarket",
  game: LORCANA_GAME,
  origin: "https://www.lorcards.fr",
  indexPath: lorcardsIndexPath("fr"),
  printKeyOf: (tile) => lorcardsTileToPrintKey(tile),
};

/**
 * Prix-only. Id `lormarket` (pas `lorcards`) : le dump scellé / staging portent
 * déjà le slug site.
 */
export const lormarketModule = createPrintKeyPriceModule<DbscardsPriceCard>({
  providerId: "lormarket",
  label: "lorcards.fr",
  priceSource: "lorcards",
  currency: "EUR",
  websiteUrl: "https://www.lorcards.fr/",
  notes:
    "Cotes Cardmarket EUR (dump liste lorcards.fr) pour Disney Lorcana. Match par printKey (slug `223-204-fr-12-…` → lorcana:12-223). Fichier local — pas de HTTP au refresh.",
  referencePriceSource: true,
  evidenceOnlyPriceRefresh: true,
  supplyMode: "scrape_cache",
  printGame: LORCANA_GAME,
  mappingProbe: {
    sampleInput: "lorcana:12-223",
    context: {
      name: "Jessie, Cowgirl énergique",
      printKey: "lorcana:12-223",
    },
  },
  fetchCard: (printKey, { ctx }) =>
    fetchMappedCardsFrCardForPrintKey(printKey, SPEC, {
      evidenceOnly: Boolean(ctx.evidenceOnly),
    }),
  priceRows: (card) => [
    {
      condition: "new",
      priceCents: card.priceCents,
      productName: card.name,
      ...(card.sourceUrl ? { sourceUrl: card.sourceUrl } : {}),
    },
  ],
});
