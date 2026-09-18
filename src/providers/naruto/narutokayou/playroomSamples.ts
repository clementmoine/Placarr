/**
 * Kayou catalogue samples for the foil playroom — one curated print per
 * lenticular family (Heaven Scrolls HR grids, BP, MR, holo).
 */
import { existsSync, readFileSync } from "node:fs";

import { isCardsIndexV1, type CardsIndexEntry } from "@/effects/cardsIndex";
import {
  KAYOU_LENTICULAR_TYPES,
  kayouLenticularTypeForFinish,
} from "@/effects/narutokayou/lenticularTypes";
import {
  NARUTO_KAYOU_EFFECT_PACK_ID,
  NARUTO_KAYOU_FULL_FOIL_MASK_URL,
} from "@/effects/narutokayou";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import { packCardsIndexPath } from "@/lib/packPaths";
import type {
  FoilPlayroomCatalogSample,
  FoilPlayroomNeed,
} from "@/types/providerModule";

import { NARUTO_KAYOU_PACK_ID } from "./pack";

const SHELF_TYPE = "tcg";

function needKey(need: FoilPlayroomNeed): string {
  return `${need.finish ?? ""}|${need.varnish ?? ""}`;
}

function sampleFromEntry(
  entry: CardsIndexEntry,
  printKey: string,
  finish: string,
): FoilPlayroomCatalogSample | null {
  for (const [lang, files] of Object.entries(entry.langs)) {
    const art = files.art?.trim();
    if (!art) continue;
    return {
      id: `${printKey}:${finish}`,
      name: entry.name?.trim() || entry.card,
      variant: finish,
      printKey,
      shelfType: SHELF_TYPE,
      imageUrl: assetsCardUrl(
        NARUTO_KAYOU_PACK_ID,
        { set: entry.set, lang, card: entry.card },
        art,
      ),
      foilMaskUrl: NARUTO_KAYOU_FULL_FOIL_MASK_URL,
      effectPack: NARUTO_KAYOU_EFFECT_PACK_ID,
    };
  }
  return null;
}

function sampleForPrintKey(
  cards: Record<string, CardsIndexEntry>,
  printKey: string,
  finish: string,
): FoilPlayroomCatalogSample | null {
  const entry = cards[printKey.trim().toLowerCase()];
  if (!entry) return null;
  return sampleFromEntry(entry, printKey.trim().toLowerCase(), finish);
}

export function suggestKayouFoilPlayroomSamples(
  needs: readonly FoilPlayroomNeed[],
): FoilPlayroomCatalogSample[] {
  const indexPath = packCardsIndexPath(NARUTO_KAYOU_PACK_ID);
  if (!existsSync(indexPath)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    return [];
  }
  if (!isCardsIndexV1(raw)) return [];

  const cards = raw.cards;
  const seen = new Set<string>();
  const out: FoilPlayroomCatalogSample[] = [];

  for (const need of needs) {
    const key = needKey(need);
    if (seen.has(key)) continue;
    seen.add(key);
    const finish = need.finish?.trim().toLowerCase() ?? "";
    if (!finish || need.varnish) continue;

    const typed = kayouLenticularTypeForFinish(finish);
    if (typed) {
      const sample = sampleForPrintKey(cards, typed.exemplarPrintKey, finish);
      if (sample) out.push(sample);
      continue;
    }
  }

  return out;
}

/** Every lenticular family with a face on disk — for tests / diagnostics. */
export function listKayouLenticularPlayroomSamples(): FoilPlayroomCatalogSample[] {
  const indexPath = packCardsIndexPath(NARUTO_KAYOU_PACK_ID);
  if (!existsSync(indexPath)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    return [];
  }
  if (!isCardsIndexV1(raw)) return [];

  return KAYOU_LENTICULAR_TYPES.flatMap((type) => {
    const sample = sampleForPrintKey(raw.cards, type.exemplarPrintKey, type.finish);
    return sample ? [sample] : [];
  });
}
