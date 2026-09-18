/**
 * Pick one LorcanaJSON print per foil-playroom need so every dumped material
 * that exists in the catalogue can be shown — without inventing Magma on a
 * Silver mask.
 */
import type {
  FoilPlayroomCatalogSample,
  FoilPlayroomNeed,
} from "@/types/providerModule";
import { withPackCardUrls } from "@/effects/lorcana/packAssets";

import {
  LORCANA_DEFAULT_LANGUAGE,
  loadLorcanaIndexes,
  type LorcanaCard,
  type LorcanaLanguage,
} from "./fetch";

const SHELF_TYPE = "tcg";

function normalizeFinishToken(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "vertwave") return "verticalwave";
  if (lower === "freeform") return "freeform1";
  return lower;
}

export function cardHasFinish(card: LorcanaCard, finish: string): boolean {
  const wanted = normalizeFinishToken(finish);
  return card.foilTypes.some((foil) => normalizeFinishToken(foil) === wanted);
}

function needKey(need: FoilPlayroomNeed): string {
  return `${need.finish ?? ""}|${need.varnish ?? ""}`;
}

function scoreCard(card: LorcanaCard, need: FoilPlayroomNeed): number {
  if (!card.imageUrl && !card.fullFoilUrl) return -1;

  if (need.finish) {
    if (!cardHasFinish(card, need.finish)) return -1;
    if (!card.foilMaskUrl) return -1;
  }

  if (need.varnish) {
    if ((card.varnishType ?? "").toLowerCase() !== need.varnish.toLowerCase()) {
      return -1;
    }
    if (!card.varnishMaskUrl) return -1;
    return 3;
  }

  // Varnish-only materials (finish null, varnish null): any varnish mask works.
  if (!need.finish) {
    if (!card.varnishMaskUrl || !card.varnishType) return -1;
    return 2;
  }

  // Finish without baked varnish: prefer an unvarnished print.
  if (card.varnishType) return 1;
  return 2;
}

export function pickLorcanaPlayroomSamples(
  cards: readonly LorcanaCard[],
  needs: readonly FoilPlayroomNeed[],
): FoilPlayroomCatalogSample[] {
  const seen = new Set<string>();
  const out: FoilPlayroomCatalogSample[] = [];

  for (const need of needs) {
    const key = needKey(need);
    if (seen.has(key)) continue;
    seen.add(key);

    let best: { card: LorcanaCard; score: number } | null = null;
    for (const card of cards) {
      const score = scoreCard(card, need);
      if (score < 0) continue;
      if (!best || score > best.score) {
        best = { card, score };
        if (score >= 3) break;
      }
    }
    if (!best) continue;

    const { card } = best;
    const variant = need.finish;
    out.push(
      withPackCardUrls({
        id: `catalog:${card.printKey}:${variant ?? "varnish"}:${need.varnish ?? "none"}`,
        name: card.fullName,
        variant,
        printKey: card.printKey,
        shelfType: SHELF_TYPE,
        language: card.language,
        imageUrl: card.fullFoilUrl ?? card.imageUrl,
        foilMaskUrl: card.foilMaskUrl,
        varnishMaskUrl: card.varnishMaskUrl,
        varnishType: card.varnishType,
        varnishColor: card.foilEffectColors[0] ?? null,
        secondVarnishMaskUrl: card.secondVarnishMaskUrl,
        secondVarnishColor: card.foilEffectColors[1] ?? null,
        effectPack: "lorcana",
      }),
    );
  }

  return out;
}

export async function suggestLorcanaFoilPlayroomSamples(
  needs: readonly FoilPlayroomNeed[],
  options?: { language?: LorcanaLanguage; signal?: AbortSignal },
): Promise<FoilPlayroomCatalogSample[]> {
  if (needs.length === 0) return [];
  // Preferred language first, then the rest — Tempest / FreeForm2 /
  // CalendarWave live only on English printings today.
  const language = options?.language ?? LORCANA_DEFAULT_LANGUAGE;
  const indexes = await loadLorcanaIndexes(language, {
    signal: options?.signal,
  });
  const cards = indexes.flatMap((index) => index.cards);
  return pickLorcanaPlayroomSamples(cards, needs);
}
