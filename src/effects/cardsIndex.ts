/**
 * Shared `cards-index.json` v1 — same filename for every foil pack.
 */

export type CardsIndexLangFiles = {
  art?: string;
  thumb?: string;
  mask?: string;
  varnishMask?: string;
  secondVarnishMask?: string;
  etch?: string;
  back?: string;
  /** Pokémon: foil metadata per Live variant; files stay in the same card dir. */
  variants?: Record<
    string,
    {
      mask?: string;
      etch?: string;
      foil?: string;
      shader?: string;
    }
  >;
};

export type CardsIndexEntry = {
  set: string;
  card: string;
  langs: Record<string, CardsIndexLangFiles>;
};

export type CardsIndexV1 = {
  version: 1;
  pack: string;
  generatedAt?: string;
  cards: Record<string, CardsIndexEntry>;
};

export function emptyCardsIndex(pack: string): CardsIndexV1 {
  return { version: 1, pack, cards: {} };
}

export function isCardsIndexV1(value: unknown): value is CardsIndexV1 {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.version === 1 && typeof row.pack === "string" && !!row.cards;
}
