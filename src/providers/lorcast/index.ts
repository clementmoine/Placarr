import type { ProviderModule } from "@/types/providerModule";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { rawProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";

import {
  fetchLorcastCardForPrintKey,
  lorcastCardLabel,
  lorcastProductUrl,
  type LorcastCard,
} from "./fetch";

export {
  fetchLorcastCardForPrintKey,
  fetchLorcastCardBySetNumber,
  mapLorcastCard,
  lorcastLookupFromPrintKey,
  lorcastPromoSetFromGrouping,
} from "./fetch";

const PROVIDER_ID = "lorcast";
const PRICE_SOURCE = "Lorcast";

function printKeyFromContext(ctx: BarcodePriceRefreshContext): string | null {
  const direct = ctx.printKey?.trim();
  if (direct) return direct;
  const fromIds = ctx.externalIds?.printKey?.trim();
  return fromIds || null;
}

function offersFromCard(card: LorcastCard) {
  const label = lorcastCardLabel(card);
  const sourceUrl = lorcastProductUrl(card);
  const rows: Array<{
    condition: string;
    priceCents: number | null;
    productName: string;
  }> = [];

  if (card.prices.usd != null) {
    rows.push({
      condition: "new",
      priceCents: card.prices.usd,
      productName: label,
    });
  }
  if (card.prices.usdFoil != null) {
    rows.push({
      // Always market-foil — foil-only prints (Enchanted etc.) must not land in
      // the `new` bucket, or a Lore/Magma copy reads an empty foil hero price.
      condition: "foil",
      priceCents: card.prices.usdFoil,
      productName: `${label} (foil)`,
    });
  }

  return pricedOffers(
    PRICE_SOURCE,
    rows.map((row) => ({
      condition: row.condition,
      priceCents: row.priceCents,
      rawValue: card,
      extra: {
        currency: "USD",
        productName: row.productName,
        sourceUrl,
        // Matched by printKey, not by listing title — EN Lorcast names must not
        // be rejected against a FR item title at persist time.
        metadataScoped: true,
      },
    })),
  );
}

/**
 * Prefer an ASCII / English-looking title for Lorcast search. FR item names
 * ("La Fée Clochette…") rarely match EN catalog copy; multi-lang aliases do.
 * When the primary is already ASCII French ("Concepteur d'armures"), prefer a
 * distinct ASCII alias ("Armor Designer") over repeating the primary.
 */
function lorcastTitleHint(ctx: BarcodePriceRefreshContext): string | null {
  const candidates = [
    ...ctx.acceptanceTitles,
    ...ctx.titles,
    ctx.primaryTitle,
    ctx.primaryName,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value);

  const ascii = candidates.filter(
    (title) => /^[\x00-\x7F]+$/.test(title) && /[A-Za-z]{3,}/.test(title),
  );
  const primary = ctx.primaryName?.trim() || ctx.primaryTitle?.trim() || null;
  const alternateAscii = ascii.find((title) => title !== primary);
  return alternateAscii ?? ascii[0] ?? candidates[0] ?? null;
}

async function refreshLorcastOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "tcg") return [];
  const printKey = printKeyFromContext(ctx);
  if (!printKey) return [];

  const card = await fetchLorcastCardForPrintKey(printKey, {
    signal: ctx.signal,
    titleHint: lorcastTitleHint(ctx),
  });
  if (!card) return [];
  return offersFromCard(card);
}

export const lorcastModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: "Lorcast",
    types: ["tcg"],
    capabilities: ["price"],
    auth: { kind: "none" },
    canonical: false,
    websiteUrl: "https://lorcast.com/",
    notes:
      "Prix marché TCGplayer (USD) pour Disney Lorcana. Match par printKey (set/numéro). La conversion EUR n'est faite qu'en fallback pipeline (~), jamais dans la moyenne des offres natives.",
    referencePriceSource: true,
  },
  mappingProbe: {
    sampleInput: "lorcana:1-1",
    context: { name: "Ariel - On Human Legs", printKey: "lorcana:1-1" },
  },
  runMappingProbe: async () =>
    rawProbe(await fetchLorcastCardForPrintKey("lorcana:1-1")),
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Ariel",
      printKey: "lorcana:1-1",
    });
    return mappingRawKeysFromFetch(() =>
      fetchLorcastCardForPrintKey(ctx.printKey?.trim() || "lorcana:1-1"),
    );
  },
  refreshBarcodePriceOffers: refreshLorcastOffers,
};
