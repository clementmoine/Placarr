/**
 * Cardmarket EUR for McDo prints via TCGdex API → local evidence ledger.
 *
 * pkmcards.fr skips historic McDo; Coleka deals only cover recent years
 * without captcha. TCGdex already embeds Cardmarket on each card payload —
 * dump it once so Catalogue browse stays evidence-only (no live storm).
 */
import { packTcgdexMcdoPricesPath } from "@/lib/packPaths";
import {
  mergeColekaPriceRows,
  writeColekaPriceLedger,
  type ColekaPriceLedger,
  type ColekaPriceRow,
} from "@/providers/shared/coleka/dealsHarvest";

import {
  fetchTcgdexCardByPrintKey,
  printKeyFromTcgdexIds,
} from "../fetch";
import { loadPokecardexMcdoLedger } from "./pokecardex/fillMcdo";
import { POKEMONTCG_MCDO_STEMS } from "./faces";

export function tcgdexMcdoPriceLedgerPath(): string {
  return packTcgdexMcdoPricesPath();
}

type McdoSetTarget = {
  setId: string;
  cardCount: number;
  label: string;
};

/** Unique McDo set ids from PokéCardex ledger + pokemontcg.io stems. */
export function tcgdexMcdoPriceTargets(
  ledgerPath?: string,
): McdoSetTarget[] {
  const bySet = new Map<string, McdoSetTarget>();
  for (const campaign of loadPokecardexMcdoLedger(ledgerPath).campaigns) {
    const setId = campaign.setId.trim().toLowerCase();
    if (!setId) continue;
    const prev = bySet.get(setId);
    if (!prev || campaign.cardCount > prev.cardCount) {
      bySet.set(setId, {
        setId,
        cardCount: campaign.cardCount,
        label: campaign.label ?? setId,
      });
    }
  }
  for (const [setId, stem] of Object.entries(POKEMONTCG_MCDO_STEMS)) {
    const id = setId.trim().toLowerCase();
    if (!id || bySet.has(id)) continue;
    const count = id === "2021swsh" ? 25 : /swsh$/.test(id) ? 15 : 12;
    bySet.set(id, {
      setId: id,
      cardCount: count,
      label: `McDo ${id} (${stem})`,
    });
  }
  return [...bySet.values()].sort((a, b) => a.setId.localeCompare(b.setId));
}

function preferredCents(card: {
  cmPriceCents: number | null;
  cmFoilPriceCents: number | null;
}): number | null {
  const foil =
    typeof card.cmFoilPriceCents === "number" && card.cmFoilPriceCents > 0
      ? card.cmFoilPriceCents
      : null;
  const normal =
    typeof card.cmPriceCents === "number" && card.cmPriceCents > 0
      ? card.cmPriceCents
      : null;
  // McDo are holo-only — foil first, then normal.
  return foil ?? normal;
}

export async function harvestTcgdexMcdoPrices(
  opts: {
    signal?: AbortSignal;
    language?: string;
    ledgerPath?: string;
    outPath?: string;
  } = {},
): Promise<{ ledger: ColekaPriceLedger; outPath: string }> {
  const language = (opts.language ?? "fr").trim().toLowerCase() || "fr";
  const targets = tcgdexMcdoPriceTargets(opts.ledgerPath);
  const rows: ColekaPriceRow[] = [];
  const rubriques: ColekaPriceLedger["rubriques"] = [];
  let offerCount = 0;

  for (const target of targets) {
    let withQuotation = 0;
    let uniqueItems = 0;
    for (let n = 1; n <= target.cardCount; n++) {
      if (opts.signal?.aborted) break;
      const printKey = printKeyFromTcgdexIds(target.setId, String(n));
      if (!printKey) continue;
      uniqueItems += 1;
      offerCount += 1;
      const card = await fetchTcgdexCardByPrintKey(printKey, {
        language,
        signal: opts.signal,
      });
      const cents = card ? preferredCents(card) : null;
      if (cents != null) withQuotation += 1;
      rows.push({
        printKey,
        printed: `${String(n).padStart(3, "0")}/${String(target.cardCount).padStart(3, "0")}`,
        colekaId: card?.cardmarketProductId
          ? `cm:${card.cardmarketProductId}`
          : `tcgdex:${target.setId}-${n}`,
        rubriqueId: target.setId,
        refItem: `${n}/${target.cardCount}`,
        title: card?.name ?? null,
        quotationEuro: cents != null ? cents / 100 : null,
        quotationCents: cents,
        offerEuro: null,
        offerCents: null,
        shippingEuro: null,
        marketplace: "cardmarket",
        observedAt: new Date().toISOString(),
        affiliatePath: card?.cardmarketProductId
          ? `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${card.cardmarketProductId}`
          : null,
      });
    }
    rubriques.push({
      id: target.setId,
      label: target.label,
      offerCount: uniqueItems,
      uniqueItems,
      withQuotation,
      listedCount: target.cardCount,
    });
  }

  const cards = mergeColekaPriceRows(rows);
  const ledger: ColekaPriceLedger = {
    source: "api.tcgdex.net cardmarket (McDo)",
    sourceId: "tcgdex-cardmarket",
    packId: "pokemon",
    fetchedAt: new Date().toISOString(),
    rubriques,
    offerCount,
    uniqueItems: cards.length,
    withQuotation: cards.filter((c) => c.quotationCents != null).length,
    withPrintKey: cards.filter((c) => Boolean(c.printKey)).length,
    cards,
  };
  const outPath = writeColekaPriceLedger(
    opts.outPath ?? tcgdexMcdoPriceLedgerPath(),
    ledger,
  );
  return { ledger, outPath };
}
