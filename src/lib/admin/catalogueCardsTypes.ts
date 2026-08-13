/** Client-safe catalogue browse row (API + UI). */

export type CatalogueCardRow = {
  printKey: string;
  set: string;
  card: string;
  lang: string;
  artUrl: string;
  /** When mapped (e.g. Naruto site med), prefer for grid previews. */
  thumbUrl?: string;
  hasFoil: boolean;
  label: string;
  name?: string;
  rarity?: string;
};
