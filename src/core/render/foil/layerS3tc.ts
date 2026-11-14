/**
 * Catalogue layer S3TC sidecars (`layers.s3tc.json` beside art.client.webp).
 * Pack-agnostic: any face URL under …/cards/…/ can ship the meta file.
 */
import type { FoilS3tcBinding } from "./types";

export type CatalogueLayerS3tcMeta = {
  picture?: {
    file: string;
    width: number;
    height: number;
    format: string;
  };
  frame?: {
    file: string;
    width: number;
    height: number;
    format: string;
  };
  text?: {
    file: string;
    width: number;
    height: number;
    format: string;
  };
};

/** Resolve absolute S3TC URL + dims from face URL + meta entry. */
export function resolveCatalogueFrontS3tc(
  faceUrl: string,
  meta: CatalogueLayerS3tcMeta | null | undefined,
): FoilS3tcBinding | null {
  const picture = meta?.picture;
  if (!picture?.file || !picture.width || !picture.height || !picture.format) {
    return null;
  }
  const dirMatch = /^(.*\/cards\/[^/]+\/[^/]+\/[^/]+)\/[^/]+$/.exec(faceUrl);
  if (!dirMatch) return null;
  return {
    file: `${dirMatch[1]}/${picture.file.replace(/^\/+/, "")}`,
    width: picture.width,
    height: picture.height,
    format: picture.format,
  };
}

/**
 * Fetch `layers.s3tc.json` next to a catalogue face. Returns null on 404 /
 * network / parse errors — WebGL falls back to raster `frontUrl`.
 */
export async function fetchCatalogueFrontS3tc(
  faceUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FoilS3tcBinding | null> {
  const dirMatch = /^(.*\/cards\/[^/]+\/[^/]+\/[^/]+)\/[^/]+$/.exec(faceUrl);
  if (!dirMatch) return null;
  const metaUrl = `${dirMatch[1]}/layers.s3tc.json`;
  try {
    const res = await fetchImpl(metaUrl);
    if (!res.ok) return null;
    const meta = (await res.json()) as CatalogueLayerS3tcMeta;
    return resolveCatalogueFrontS3tc(faceUrl, meta);
  } catch {
    return null;
  }
}
