/**
 * Stamp Scryfall finishes + CDN artUrl on PrintCandidate.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { PrintCandidate } from "@/types/providerModule";

import { MTG_PACK_ID } from "./pack";
import { loadMtgFinishesMap } from "./harvest/seedFromScryfall";

let finishesCache: ReturnType<typeof loadMtgFinishesMap> | null = null;
let artCache: Record<string, string> | null = null;

export function resetMtgFinishesCache(): void {
  finishesCache = null;
  artCache = null;
}

function loadArtUrls(): Record<string, string> {
  const p = path.join(
    process.cwd(),
    "data",
    MTG_PACK_ID,
    "curated",
    "art-urls.json",
  );
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function decorateMtgCandidate(
  base: PrintCandidate,
): PrintCandidate {
  finishesCache ??= loadMtgFinishesMap();
  artCache ??= loadArtUrls();
  const finishes = finishesCache[base.printKey];
  const artUrl = artCache[base.printKey];
  const plain = finishes?.filter((f) => f === "nonfoil") ?? [];
  return {
    ...base,
    ...(finishes?.length ? { finishes } : {}),
    ...(plain.length ? { plainFinishes: plain } : {}),
    ...(!base.imageUrl && artUrl
      ? { imageUrl: artUrl, thumbnailUrl: artUrl }
      : {}),
  };
}
