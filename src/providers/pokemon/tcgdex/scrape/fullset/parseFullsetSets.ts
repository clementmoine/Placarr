/**
 * Pokémon Fullset.fr parse — thin re-export over shared Fullset HTML parser.
 */
import {
  foldFullsetSetName,
  fullsetSetsIndexUrl,
  normalizeFullsetSetRef,
  parseFullsetSetsHtml,
  type FullsetSetRow,
  type FullsetSetsLedger,
} from "@/providers/shared/fullset/parseSets";

export type FullsetPokemonSetRow = FullsetSetRow;
export type FullsetPokemonSetsLedger = Omit<FullsetSetsLedger, "game"> & {
  game?: "pokemon";
};

export function fullsetPokemonSetsIndexUrl(): string {
  return fullsetSetsIndexUrl("pokemon");
}

export {
  foldFullsetSetName,
  normalizeFullsetSetRef,
};

export function parseFullsetPokemonSetsHtml(
  html: string,
): FullsetPokemonSetRow[] {
  return parseFullsetSetsHtml(html, "pokemon");
}
