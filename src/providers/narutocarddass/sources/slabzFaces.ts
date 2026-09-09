/**
 * Slab-Z pasted CDN faces. Source of truth: `curated/sources/slab-z-ja.json`.
 *
 * Media IDs were pasted from the guide; Wix serves them at a fixed URL shape.
 * Do not crawl slab-z.com.
 */
import ledger from "../curated/sources/slab-z-ja.json";

export type SlabzFace = (typeof ledger.faces.cards)[number];

export function slabzFaceLedger() {
  return ledger;
}

export function slabzIngestFaces(): SlabzFace[] {
  return ledger.faces.cards;
}

/** Deterministic Wix CDN for a pasted media id. */
export function slabzFaceUrl(media: string): string {
  const id = media.trim();
  return `https://static.wixstatic.com/media/${id}~mv2.jpg`;
}
