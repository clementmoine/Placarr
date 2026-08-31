/**
 * Bandai FR Drive Doc « Série 1 détaillée » — marketing maths + line list.
 * Source of truth: `curated/sources/bandai-fr-serie-1-detaillee.json`.
 */
import ledger from "../curated/sources/bandai-fr-serie-1-detaillee.json";

export function bandaiFrSerie1DetailleeLedger() {
  return ledger;
}

export function bandaiFrSerie1DetailleePrintKeys(): string[] {
  return [...new Set(ledger.cards.map((row) => row.printKey))].sort();
}

export function bandaiFrSerie1DetailleeHoloCount(): number {
  return ledger.cards.filter((row) => row.holoMarker).length;
}
