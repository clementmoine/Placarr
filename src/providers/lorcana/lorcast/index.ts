import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import {
  createPrintKeyPriceModule,
  dualFinishPriceRows,
} from "@/providers/shared/createPrintKeyPriceModule";

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

export const lorcastModule = createPrintKeyPriceModule<LorcastCard>({
  providerId: "lorcast",
  label: "Lorcast",
  priceSource: "Lorcast",
  currency: "USD",
  websiteUrl: "https://lorcast.com/",
  notes:
    "Prix marché TCGplayer (USD) pour Disney Lorcana. Match par printKey (set/numéro). La conversion EUR n'est faite qu'en fallback pipeline (~), jamais dans la moyenne des offres natives.",
  referencePriceSource: true,
  mappingProbe: {
    sampleInput: "lorcana:1-1",
    context: { name: "Ariel - On Human Legs", printKey: "lorcana:1-1" },
  },
  fetchCard: (printKey, { signal, ctx }) =>
    fetchLorcastCardForPrintKey(printKey, {
      signal,
      titleHint: lorcastTitleHint(ctx),
    }),
  priceRows: (card) =>
    dualFinishPriceRows({
      label: lorcastCardLabel(card),
      // Always market-foil for usdFoil — foil-only prints (Enchanted etc.) must
      // not land in the `new` bucket.
      newCents: card.prices.usd,
      foilCents: card.prices.usdFoil,
      sourceUrl: lorcastProductUrl(card),
    }),
});
