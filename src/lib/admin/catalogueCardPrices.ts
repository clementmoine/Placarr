/**
 * Join catalogue card browse rows with reference TCG price dumps (*cards.fr,
 * Lorcana.gg evidence, …) — same pricers as shelf checklist, disk / evidence
 * only (no live scrape storm on Catalogue page load).
 */
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { parsePrintKey } from "@/core/identify/printKey";
import type { PriceOfferInput } from "@/core/enrich/evidence";
import { cataloguePokemonPriceLookupKey } from "@/providers/pokemon/pkmmarket";
import { catalogueColekaPriceQuoteByPrintKey } from "@/providers/shared/coleka/priceIndex";
import type { DbscardsPriceCard } from "@/providers/shared/tcgcards/priceIndex";
import type { MediaType } from "@/types/media";
import type {
  BarcodePriceRefreshContext,
  ProviderModule,
} from "@/types/providerModule";
import { providerModulesForPack } from "@/providers/shared/packOwner";

/**
 * Catalogue row keys → pricer printKeys.
 *
 * Most packs already store real printKeys (`onepiece:op17-001`). Pokémon
 * cards-index uses Live CDN bundle ids (`me5_fr_001`) — no `game:` prefix —
 * so we remap any Live-shaped key before asking *cards.fr pricers.
 */
export function cataloguePriceLookupKey(
  _packId: string,
  printKey: string,
): string {
  const trimmed = printKey.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(":")) return trimmed;
  if (/^[a-z0-9.-]+_[a-z]{2,4}_\d/i.test(trimmed)) {
    return cataloguePokemonPriceLookupKey(trimmed);
  }
  return trimmed;
}

export type CatalogueCardPriceQuote = {
  priceCents: number;
  priceDeltaCents?: number | null;
  shopItemId?: string | null;
};

function checklistPriceContext(
  shelfType: MediaType,
  printKey: string,
  evidenceOnly: boolean,
): BarcodePriceRefreshContext {
  return {
    shelfType,
    printKey,
    evidenceOnly,
    barcodes: [],
    cleanedBarcode: "",
    primaryTitle: "",
    primaryName: "",
    titles: [],
    acceptanceTitles: [],
    fallbackNames: [],
    leDenicheurQueries: [],
    isPal: false,
    isClassics: false,
  };
}

function printGamesForPack(packId: string): Set<string> {
  const games = new Set<string>();
  for (const mod of providerModulesForPack(packId)) {
    for (const game of mod.printGames ?? []) {
      const g = game.trim().toLowerCase();
      if (g) games.add(g);
    }
  }
  return games;
}

function referenceTcgPricers(games: ReadonlySet<string>): ProviderModule[] {
  return PROVIDER_MODULES.filter((pack) => {
    if (!pack.info.types.includes("tcg")) return false;
    if (typeof pack.refreshBarcodePriceOffers !== "function") return false;
    if (!pack.info.evidenceOnlyPriceRefresh) return false;
    if (!pack.info.referencePriceSource) return false;
    /*
      Price-only modules (opemarket, …) have no dataPack — bound by printGame
      from mappingProbe sample / first catalogue key when games is known.
    */
    if (games.size === 0) return true;
    const sample = pack.mappingProbe?.context?.printKey?.trim();
    const sampleGame = sample ? parsePrintKey(sample)?.game : null;
    if (sampleGame && games.has(sampleGame)) return true;
    const probeGames = pack.printGames ?? [];
    return probeGames.some((g) => games.has(g.trim().toLowerCase()));
  });
}

function preferredOffer(
  offers: readonly PriceOfferInput[] | null | undefined,
): PriceOfferInput | null {
  if (!offers?.length) return null;
  return (
    offers.find(
      (o) =>
        (o.condition ?? "").toLowerCase() === "new" &&
        typeof o.priceCents === "number" &&
        o.priceCents > 0,
    ) ??
    offers.find(
      (o) => typeof o.priceCents === "number" && o.priceCents > 0,
    ) ??
    null
  );
}

function quoteFromOffer(offer: PriceOfferInput): CatalogueCardPriceQuote {
  const raw = offer.rawValue as DbscardsPriceCard | null | undefined;
  const priceDeltaCents =
    typeof raw?.priceDeltaCents === "number" &&
    Number.isFinite(raw.priceDeltaCents)
      ? raw.priceDeltaCents
      : null;
  const shopItemId = raw?.shopItemId?.trim() || null;
  return {
    priceCents: offer.priceCents,
    ...(priceDeltaCents != null ? { priceDeltaCents } : {}),
    ...(shopItemId ? { shopItemId } : {}),
  };
}

/**
 * Bulk map printKey → quote (cents + optional 30j delta / shop itemId).
 */
export async function catalogueCardPriceQuoteByPrintKey(
  packId: string,
  printKeys: readonly string[],
): Promise<Map<string, CatalogueCardPriceQuote>> {
  const prices = new Map<string, CatalogueCardPriceQuote>();
  const unique = [
    ...new Set(printKeys.map((k) => k.trim()).filter(Boolean)),
  ];
  if (unique.length === 0) return prices;

  /** Original Catalogue key → pricer key (Pokémon Live bundle → printKey). */
  const lookupByOriginal = new Map<string, string>();
  for (const key of unique) {
    lookupByOriginal.set(key, cataloguePriceLookupKey(packId, key));
  }
  const lookupKeys = [...new Set(lookupByOriginal.values())];

  const games = printGamesForPack(packId);
  if (games.size === 0) {
    for (const key of lookupKeys) {
      const game = parsePrintKey(key)?.game;
      if (game) games.add(game);
    }
  }

  const pricers = referenceTcgPricers(games);

  /*
    Coleka-only packs (Bleach SCB, Lamincards, …) have no *cards.fr pricer.
    Still run the deals-ledger fallback below — do not early-return empty.
  */
  if (pricers.length > 0) {
    const seed = lookupKeys[0]!;
    for (const pack of pricers) {
      try {
        await pack.refreshBarcodePriceOffers!(
          checklistPriceContext("tcg", seed, false),
        );
      } catch {
        /* un pack muet n'empêche pas les autres */
      }
    }

    const LOOKUP_CONCURRENCY = 64;
    const quoteByLookup = new Map<string, CatalogueCardPriceQuote>();
    for (let i = 0; i < lookupKeys.length; i += LOOKUP_CONCURRENCY) {
      const slice = lookupKeys.slice(i, i + LOOKUP_CONCURRENCY);
      await Promise.all(
        slice.map(async (lookupKey) => {
          const observations: PriceOfferInput[] = [];
          for (const pack of pricers) {
            try {
              const offers = await pack.refreshBarcodePriceOffers!(
                checklistPriceContext("tcg", lookupKey, true),
              );
              if (offers?.length) observations.push(...offers);
            } catch {
              /* ignore */
            }
          }
          const offer = preferredOffer(observations);
          if (offer) quoteByLookup.set(lookupKey, quoteFromOffer(offer));
        }),
      );
    }

    for (const [original, lookupKey] of lookupByOriginal) {
      const quote = quoteByLookup.get(lookupKey);
      if (quote) prices.set(original, quote);
    }
  }

  /* Coleka deals ledger — primary for Coleka-only packs; gap-fill otherwise. */
  const coleka = catalogueColekaPriceQuoteByPrintKey(packId);
  if (coleka.size > 0) {
    for (const [original, lookupKey] of lookupByOriginal) {
      if (prices.has(original)) continue;
      const quote = coleka.get(lookupKey) ?? coleka.get(original);
      if (quote) prices.set(original, quote);
    }
  }

  return prices;
}

/**
 * Bulk map printKey → EUR cents from local / evidence price indexes
 * (*cards.fr pricers and/or curated Coleka deals ledgers).
 * Empty map when neither source has a quote (honest « sans prix »).
 */
export async function catalogueCardPriceCentsByPrintKey(
  packId: string,
  printKeys: readonly string[],
): Promise<Map<string, number>> {
  const quotes = await catalogueCardPriceQuoteByPrintKey(packId, printKeys);
  const prices = new Map<string, number>();
  for (const [key, quote] of quotes) {
    prices.set(key, quote.priceCents);
  }
  return prices;
}
