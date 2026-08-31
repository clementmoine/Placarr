/**
 * Carddass FR starter box accessories (S1–S2 listing).
 * Source of truth: `curated/sources/starter-box-accessories.json`.
 *
 * Cards stay unknown (`contentsKnown` false). Accessories are not prints.
 */
import ledger from "./curated/sources/starter-box-accessories.json";

export function starterBoxAccessoriesLedger() {
  return ledger;
}

export function starterBoxAccessories(setCode: string) {
  const code = setCode.toLowerCase();
  if (!(ledger.sku.attestedSets as readonly string[]).includes(code)) {
    return null;
  }
  return {
    cardCount: ledger.sku.cardCount,
    livretDeJeu: ledger.sku.livretDeJeu,
    plateauDeJeu: ledger.sku.plateauDeJeu,
    jetons: ledger.sku.jetons,
    jetonNarutoAmongTokens: ledger.sku.jetonNarutoAmongTokens,
    livretCartesACollectionner: ledger.sku.livretCartesACollectionner,
  };
}
