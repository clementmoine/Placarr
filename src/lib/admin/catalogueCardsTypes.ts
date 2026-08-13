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
};
