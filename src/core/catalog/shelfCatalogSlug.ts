/** Shelf type -> Chasse aux Livres catalog slug. */
export const CHASSE_AUX_LIVRES_CATALOG_BY_TYPE = {
  books: "fr",
  movies: "dvd",
  musics: "music",
  games: "videogames",
  /** Consoles / manettes live in the same CAL videogames catalog as games. */
  hardware: "videogames",
  boardgames: "toys",
} as const;

export function catalogForShelfType(type: string | null): string {
  return (
    CHASSE_AUX_LIVRES_CATALOG_BY_TYPE[
      type as keyof typeof CHASSE_AUX_LIVRES_CATALOG_BY_TYPE
    ] ?? "fr"
  );
}
