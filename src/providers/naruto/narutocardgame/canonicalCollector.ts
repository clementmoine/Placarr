/**
 * Collector numbers attestés — corrige les mal-lus communautaires.
 *
 * `K-039` (narutomarket / narutotcgcards) = même face que `N-009` Kakashi
 * (narutocardguide + nindodb.com). Nindo + spoilers listent Kakashi en N-009 ;
 * le préfixe K- est un mal-lu du collector imprimé.
 */
const COLLECTOR_ALIASES: Readonly<Record<string, string>> = {
  k039: "n009",
};

/** Après `normalize*Ref` — alias → numéro catalogue canonique. */
export function canonicalNarutoCardgameCollector(
  number: string | null | undefined,
): string | null {
  const raw = (number ?? "").trim().toLowerCase();
  if (!raw) return null;
  return COLLECTOR_ALIASES[raw] ?? raw;
}

/** Ancien printKey fantôme à retirer après remap Sync. */
export const NARUTO_CARDGAME_MISREAD_KAKASHI_PRINT_KEY =
  "narutocardgame:demo-k039";
