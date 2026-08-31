/** Client-safe catalogue browse row (API + UI). */

export type CatalogueCardRow = {
  printKey: string;
  set: string;
  card: string;
  lang: string;
  /** Empty when the print is catalogued without a face yet. */
  artUrl: string;
  /** When mapped (e.g. Naruto site med), prefer for grid previews. */
  thumbUrl?: string;
  hasFoil: boolean;
  label: string;
  name?: string;
  /** Other locale names, so search finds the card from either catalogue. */
  aka?: string[];
  rarity?: string;
  /** True when index has the print/name but no art/thumb file yet. */
  missingArt?: boolean;
  /** Grid preview uses `back` because no recto is catalogued for this locale. */
  versoOnly?: boolean;
  /**
   * When `artUrl` comes from another print of the same collector number
   * (e.g. promo stub → retail S1 face) until official art exists.
   */
  artFallbackFrom?: string;
  /**
   * When `artUrl` comes from another locale of the same print (neutral recto
   * borrowed across `catalogueLocales`). Verso stays on `lang`.
   */
  artLocaleFrom?: string;
  /** Synthetic pack/set back tiles in the catalogue grid. */
  kind?: "face" | "pack-back" | "set-back";
  /** False = unprinted locale (shown in catalogue, hidden from add). */
  printed?: boolean;
  /** Native landscape scan — wider tile, no pixel rotation. */
  landscapeFace?: boolean;
  /** Portrait scan of a landscape print — rotate 90° in the frame. */
  faceQuarterTurns?: 0 | 1 | 2 | 3;
  /** Any locale art for this print is wider than tall. */
  landscapePrint?: boolean;
  /** Kayou HR/BP sprite sheet — cols×rows. */
  lenticularGrid?: { cols: number; rows: number };
};
