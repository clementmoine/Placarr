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
  rarity?: string;
  /** True when index has the print/name but no art/thumb file yet. */
  missingArt?: boolean;
  /**
   * When `artUrl` comes from another print of the same collector number
   * (e.g. promo stub → retail S1 face) until official art exists.
   */
  artFallbackFrom?: string;
  /** Synthetic pack/set back tiles in the catalogue grid. */
  kind?: "face" | "pack-back" | "set-back";
};
