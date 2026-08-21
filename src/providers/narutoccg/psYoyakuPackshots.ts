/**
 * The PlayStation pre-order bonus, as a sealed SKU.
 * Source of truth: `curated/sources/ps-yoyaku-tokuten.json`.
 *
 * The catalogue had the four 忍-n（PS） cards but not the thing they came in.
 * That thing is not a booster: it is
 * 「NARUTO -ナルト-」カードゲーム 忍の里の陣取り合戦！編（4枚セット）, a
 * スペシャルカードダス handed out with a PS1 pre-order — four known cards, no
 * randomness. The visual is Bandai's own, the four cards side by side; no
 * wrapper was ever photographed.
 */
import ledger from "./curated/sources/ps-yoyaku-tokuten.json";

export type PsYoyakuProduct = (typeof ledger.products)[number];

export function psYoyakuLedger() {
  return ledger;
}

export function psYoyakuIngestPackshots(): PsYoyakuProduct[] {
  return ledger.products.filter((row) => row.ingest);
}
