/**
 * Coleka Pokémon McDo listings — Ref. NNN/MMM + thumbs CDN.
 */
import {
  COLEKA_ORIGIN,
  colekaFullFaceUrl,
} from "@/providers/naruto/narutocarddass/parse/coleka";
import { colekaListingItems } from "@/providers/shared/coleka/listingItems";

export { COLEKA_ORIGIN, colekaFullFaceUrl };

export type ColekaPokemonMcdoCard = {
  localId: string;
  printed: string;
  name: string;
  colekaId: string;
  pagePath: string;
  thumbUrl: string;
  faceUrl: string;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** `004/015` or `4/15` → localId `4` (TCGdex style, unpadded). */
export function colekaMcdoLocalId(printed: string): string | null {
  const m = printed.trim().match(/^0*(\d+)\s*\/\s*\d+$/);
  return m ? m[1]! : null;
}

export function parseColekaPokemonMcdoListing(
  html: string,
): ColekaPokemonMcdoCard[] {
  const byId = new Map<string, ColekaPokemonMcdoCard>();
  for (const item of colekaListingItems(html)) {
    const ref = item.ref?.match(/^(\d+)\s*\/\s*(\d+)$/i);
    if (!ref) continue;
    const printed = `${ref[1]}/${ref[2]}`;
    const localId = colekaMcdoLocalId(printed);
    if (!localId || byId.has(localId)) continue;
    const title = item.title ? [item.title, item.title] : null;
    const img = item.thumbUrl?.startsWith(
      "https://thumbs.coleka.com/media/item/",
    )
      ? [item.thumbUrl, item.thumbUrl]
      : null;
    const href = item.href;
    if (!title || !img || !href) continue;
    const colekaId = item.id;
    const pagePath = href.startsWith("http") ? new URL(href).pathname : href;
    const thumbUrl = img[1]!;
    byId.set(localId, {
      localId,
      printed: `${ref[1]!.padStart(3, "0")}/${ref[2]!.padStart(3, "0")}`,
      name: decodeEntities(title[1]!),
      colekaId,
      pagePath,
      thumbUrl,
      faceUrl: colekaFullFaceUrl(thumbUrl),
    });
  }
  return [...byId.values()].sort(
    (a, b) => Number(a.localId) - Number(b.localId),
  );
}

export function colekaPokemonListingPageUrls(
  listingPath: string,
  listedCount: number,
): string[] {
  const base = `${COLEKA_ORIGIN}${listingPath}`;
  const pages = Math.max(1, Math.ceil(listedCount / 48));
  return [
    base,
    ...Array.from({ length: pages - 1 }, (_, i) => `${base}?p=${i + 1}`),
  ];
}
