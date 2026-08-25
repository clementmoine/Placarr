/**
 * Mercari / Rakuma / eBay pasted 忍-3 leads.
 * Source of truth: `curated/sources/mercari.json`.
 * Bytes for the 巻ノ壱 face are git-backed under `curated/cards/…/ja/source.jpg`.
 */
import ledger from "../curated/sources/mercari.json";

export type MercariFace = (typeof ledger.faces)[number];
export type MercariIngestFace = MercariFace & { curated: string };

export function mercariLedger() {
  return ledger;
}

export function mercariIngestFaces(): MercariIngestFace[] {
  return ledger.faces.filter(
    (row): row is MercariIngestFace =>
      row.ingest === true &&
      "curated" in row &&
      typeof row.curated === "string",
  );
}
