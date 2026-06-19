/** Shelf type → Chasse aux Livres catalog slug. */
export function catalogForShelfType(type: string | null): string {
  if (type === "movies") return "dvd";
  if (type === "musics") return "music";
  if (type === "games") return "videogames";
  if (type === "boardgames") return "toys";
  return "fr";
}
