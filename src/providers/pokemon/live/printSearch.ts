/**
 * Print picker / checklist surface for the Pokémon `dataPack` owner.
 *
 * Identity lives in TCGdex `catalog.sqlite`; Live joins faces/foil. Same
 * corpus as `tcgdex` search — exposed here so sealed checklist + catalog hub
 * do not depend on the API sibling alone.
 */
import { parsePrintKey } from "@/core/identify/printKey";
import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import {
  cardFromLocalRow,
  toPrintCandidate,
} from "@/providers/pokemon/tcgdex";
import {
  listTcgdexLocalSets,
  lookupTcgdexSearchRow,
  searchTcgdexRows,
  tcgdexDbPath,
} from "@/providers/pokemon/tcgdex/indexStore";
import type { PrintCandidate } from "@/types/providerModule";

const POKEMON_GAME = "pokemon";

export function listPokemonLivePrintLanguages(): string[] {
  return distinctPrintLanguages(tcgdexDbPath());
}

export function listPokemonLivePrintSets(
  language?: string | null,
): { id: string; label: string; sortKey?: number }[] {
  return listTcgdexLocalSets(language ?? undefined);
}

export function searchPokemonLivePrints(
  query: string,
  opts: {
    language?: string;
    limit?: number;
    setId?: string | null;
    catalogueBrowse?: boolean;
  } = {},
): PrintCandidate[] {
  const rows = searchTcgdexRows(query, opts);
  const seen = new Set<string>();
  const out: PrintCandidate[] = [];
  for (const row of rows) {
    if (seen.has(row.printKey)) continue;
    seen.add(row.printKey);
    out.push(toPrintCandidate(cardFromLocalRow(row)));
    if (opts.limit && out.length >= opts.limit) break;
  }
  return out;
}

export function lookupPokemonLivePrint(
  printKey: string,
  language?: string | null,
): PrintCandidate | null {
  if (parsePrintKey(printKey)?.game !== POKEMON_GAME) return null;
  const row = lookupTcgdexSearchRow(printKey, {
    language: language ?? undefined,
  });
  return row ? toPrintCandidate(cardFromLocalRow(row)) : null;
}
