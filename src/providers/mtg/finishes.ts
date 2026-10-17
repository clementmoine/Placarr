/**
 * Stamp Scryfall finishes + CDN artUrl on PrintCandidate.
 */
import type { PrintCandidate } from "@/types/providerModule";
import type { LocalPrintSearchRow } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  clearMtgArtUrlCache,
  loadMtgArtUrlMap,
  resolveMtgArtUrl,
} from "./artUrls";
import { loadMtgFinishesMap } from "./harvest/seedFromScryfall";

let finishesCache: ReturnType<typeof loadMtgFinishesMap> | null = null;

export function resetMtgFinishesCache(): void {
  finishesCache = null;
  clearMtgArtUrlCache();
}

export function decorateMtgCandidate(
  base: PrintCandidate,
  row?: LocalPrintSearchRow,
): PrintCandidate {
  finishesCache ??= loadMtgFinishesMap();
  const finishes = finishesCache[base.printKey];
  const plain = finishes?.filter((f) => f === "nonfoil") ?? [];
  const lang = (row?.lang ?? base.language ?? "en").trim().toLowerCase();
  const remote =
    !base.imageUrl
      ? resolveMtgArtUrl(loadMtgArtUrlMap(), base.printKey, lang)
      : null;
  return {
    ...base,
    ...(finishes?.length ? { finishes } : {}),
    ...(plain.length ? { plainFinishes: plain } : {}),
    ...(!base.imageUrl && remote
      ? { imageUrl: remote.url, thumbnailUrl: remote.url }
      : {}),
  };
}
