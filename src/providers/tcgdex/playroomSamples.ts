/**
 * Best-effort catalogue stand-ins for Pokémon finishes the foil playroom asks
 * for (`holo`, `reverse`, …). Seeds are known TCGdex ids that carry those
 * variants — no full dump required.
 *
 * Prefer Live pack art/masks under `/foil/pokemon/…` when the dump has the
 * print; TCGdex CDN remains cold-start fallback only.
 */
import type {
  FoilPlayroomCatalogSample,
  FoilPlayroomNeed,
} from "@/types/providerModule";
import {
  paperArtUrl,
  paperMaskUrl,
  resolveEffectForPrintKey,
} from "@/effects/pokemon/resolveEffect";
import { POKEMON_EFFECT_PACK_ID } from "@/effects/pokemon";

import {
  fetchTcgdexCardById,
  type TcgdexCard,
  type TcgdexLanguage,
} from "./fetch";

// Server-side: installs the SQLite lookups over the client-safe stubs.
// Without it the pack answers empty and every audit reports zero.
import "@/effects/pokemon/cardFoilIndex";

const SHELF_TYPE = "tcg";

/** One seed print per finish we know how to illustrate from catalogue alone. */
const FINISH_SEEDS: ReadonlyArray<{ finish: string; cardId: string }> = [
  { finish: "normal", cardId: "sv03.5-001" },
  { finish: "reverse", cardId: "sv03.5-001" },
  { finish: "holo", cardId: "sv03.5-006" },
  // Pokémon TCG Pocket Ossatueur-ex (Quatre Diamants → RR hologram path)
  { finish: "holo", cardId: "A1-153" },
  { finish: "firstEdition", cardId: "base1-4" },
];

function normalizeFinish(value: string): string {
  return value.trim().toLowerCase();
}

function cardHasFinish(card: TcgdexCard, finish: string): boolean {
  const wanted = normalizeFinish(finish);
  return card.finishes.some((entry) => normalizeFinish(entry) === wanted);
}

function needKey(need: FoilPlayroomNeed): string {
  return `${need.finish ?? ""}|${need.varnish ?? ""}`;
}

export function pickTcgdexPlayroomSamples(
  cardsById: ReadonlyMap<string, TcgdexCard>,
  needs: readonly FoilPlayroomNeed[],
): FoilPlayroomCatalogSample[] {
  const seen = new Set<string>();
  const out: FoilPlayroomCatalogSample[] = [];

  for (const need of needs) {
    const key = needKey(need);
    if (seen.has(key)) continue;
    seen.add(key);

    // Pokémon has no varnish axis in the catalogue.
    if (need.varnish) continue;
    if (!need.finish) continue;

    const wanted = normalizeFinish(need.finish);
    const seed = FINISH_SEEDS.find(
      (entry) => normalizeFinish(entry.finish) === wanted,
    );
    if (!seed) continue;

    const card = cardsById.get(seed.cardId);
    if (!card?.imageUrl) continue;
    if (!cardHasFinish(card, need.finish) && card.finishes.length > 0) continue;

    const resolved = resolveEffectForPrintKey(
      card.printKey,
      need.finish,
      card.language,
    );
    const liveArt = resolved
      ? paperArtUrl(resolved.bundle, resolved.cardTex)
      : null;
    const liveMask = resolved
      ? paperMaskUrl(resolved.bundle, resolved.maskTex)
      : null;
    out.push({
      id: `catalog:${card.printKey}:${need.finish}`,
      name: card.name,
      variant: need.finish,
      printKey: card.printKey,
      shelfType: SHELF_TYPE,
      imageUrl: liveArt ?? card.imageUrl,
      foilMaskUrl: liveMask,
      // Live per-card plates (etch / cold foil) ride the varnish surfaces.
      varnishMaskUrl: resolved
        ? paperMaskUrl(resolved.bundle, resolved.etchTex)
        : null,
      secondVarnishMaskUrl: resolved
        ? paperMaskUrl(resolved.bundle, resolved.coldFoilTex)
        : null,
      effectPack: POKEMON_EFFECT_PACK_ID,
    });
  }

  return out;
}

export async function suggestTcgdexFoilPlayroomSamples(
  needs: readonly FoilPlayroomNeed[],
  options?: { language?: TcgdexLanguage; signal?: AbortSignal },
): Promise<FoilPlayroomCatalogSample[]> {
  if (needs.length === 0) return [];

  const relevant = needs.filter(
    (need) =>
      !need.varnish &&
      need.finish &&
      FINISH_SEEDS.some(
        (seed) =>
          normalizeFinish(seed.finish) === normalizeFinish(need.finish!),
      ),
  );
  if (relevant.length === 0) return [];

  const ids = [
    ...new Set(
      relevant.flatMap((need) => {
        const seed = FINISH_SEEDS.find(
          (entry) =>
            normalizeFinish(entry.finish) === normalizeFinish(need.finish!),
        );
        return seed ? [seed.cardId] : [];
      }),
    ),
  ];

  const cards = await Promise.all(
    ids.map((id) =>
      fetchTcgdexCardById(id, {
        language: options?.language,
        signal: options?.signal,
      }),
    ),
  );

  const byId = new Map<string, TcgdexCard>();
  for (const card of cards) {
    if (card) byId.set(card.providerId, card);
  }

  return pickTcgdexPlayroomSamples(byId, needs);
}
