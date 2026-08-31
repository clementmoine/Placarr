/**
 * Shared `cards-index.json` v1 — same filename for every foil pack.
 */

export type CardsIndexLangFiles = {
  art?: string;
  thumb?: string;
  /** Face pixel width — probed at index export for orientation. */
  artW?: number;
  /** Face pixel height — probed at index export for orientation. */
  artH?: number;
  mask?: string;
  varnishMask?: string;
  secondVarnishMask?: string;
  etch?: string;
  back?: string;
  /**
   * Remote face when the pack does not store art on disk (Bandai SAMPLE URLs).
   * Catalogue browse uses this when `art` is missing.
   */
  artUrl?: string;
  /** Printed name in this locale when the pack ships more than one. */
  name?: string;
  /**
   * Le set **de cette langue**, quand il diffère de celui de l'entrée.
   *
   * Un éditeur ne redécoupe pas toujours sa ligne à l'identique d'un marché à
   * l'autre. Naruto en est le cas net : une série européenne empaquette deux à
   * trois 巻ノ japonais, si bien qu'un `set` unique par carte ne peut pas dire
   * la vérité aux deux publics à la fois. La carte reste une, son rangement
   * change avec la langue.
   *
   * Absent = le `set` de l'entrée fait foi pour cette langue.
   */
  set?: string;
  /**
   * False when this language was never printed (cancelled series, pre-prod).
   * Omitted / true = a real edition. Catalogue still shows the slot.
   */
  printed?: boolean;
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
  /** Optional display name (e.g. Manga-News FR). */
  name?: string;
  /** Optional rarity tag when known from checklist. */
  rarity?: string;
  /** True when any locale art scan is wider than tall. */
  landscapePrint?: boolean;
  /** Kayou HR/BP sprite sheet — cols×rows panels in one portrait strip. */
  lenticularGrid?: { cols: number; rows: number };
  /** Kayou fixed lenticular crop profile — skips auto pixel detection. */
  lenticularCropProfile?: string;
  /** Kayou single-face portrait scan — gutter trim for display (320×450). */
  scanCrop?: { left: number; top: number; right: number; bottom: number };
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
