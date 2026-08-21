/**
 * Coleka EN CCG display packshots (box + booster) from collector thumbs.
 * Source of truth: `curated/sources/coleka-en-ccg-covers.json`.
 */
import ledger from "./curated/sources/coleka-en-ccg-covers.json";

export type ColekaEnCcgCover = (typeof ledger.covers)[number];

/** Coleka serves `_120x120` / `_300x300` thumbs; the catalogue wants the full webp. */
export function colekaThumbToFull(url: string): string {
  return url.replace(/_\d+x\d+\.webp$/i, ".webp");
}

/** Covers that become a display SKU, excluding s28 (already coleka-s28). */
export function colekaEnCcgNewDisplays(): ColekaEnCcgCover[] {
  return ledger.covers.filter(
    (row) => row.sku.startsWith("display-") && row.set !== "s28",
  );
}

export function colekaEnCcgCoverLedger() {
  return ledger;
}

/** Full Coleka webp for the Carddass FR branch — never the `_300x300` thumb. */
export function colekaCarddassFrBranchCoverUrl(): string {
  const row = ledger.skip.find((item) => item.kind === "carddass-fr-branch");
  const raw = row && "url" in row && typeof row.url === "string" ? row.url : "";
  return colekaThumbToFull(raw);
}
