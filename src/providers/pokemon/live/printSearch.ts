/**
 * Print picker / checklist surface for the Pokémon `dataPack` owner.
 *
 * Identity lives in TCGdex `catalog.sqlite`; Live joins faces/foil. Local
 * corpus first; TCGdex API is the cold-start / miss fallback (enrich sibling
 * no longer exposes print hooks).
 */
import { parsePrintKey } from "@/core/identify/printKey";
import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import { labelFromPrintSetOptions } from "@/providers/shared/cardCatalogue/labelPrintSet";
import { mergePrintSetOptions } from "@/providers/shared/cardCatalogue/sets";
import {
  cardFromLocalRow,
  toChecklistPrintCandidate,
  toPrintCandidate,
} from "@/providers/pokemon/tcgdex";
import {
  fetchTcgdexCardByPrintKey,
  listTcgdexRemoteSets,
  searchTcgdexCards,
  tcgdexLanguageFromLiveOrDex,
} from "@/providers/pokemon/tcgdex/fetch";
import {
  isLegacyTcgdexTrainerGalleryId,
  listTcgdexLocalSets,
  listTcgdexRowsForLanguage,
  lookupTcgdexSearchRow,
  searchTcgdexRows,
  tcgdexDbPath,
} from "@/providers/pokemon/tcgdex/indexStore";
import {
  loadTcgdexSetLogoIndex,
  withTcgdexSetSymbols,
} from "@/providers/pokemon/tcgdex/setLogos";
import type { PrintCandidate } from "@/types/providerModule";

const POKEMON_GAME = "pokemon";

/** Cache par langue pour l'énumération check-list (une requête SQL). */
const checklistPrintsByLang = new Map<string, Map<string, PrintCandidate[]>>();

function rowIsPrinted(row: { printed?: number | boolean | null }): boolean {
  return row.printed !== 0 && row.printed !== false;
}

function checklistPrintsForLanguage(
  language: string,
  opts?: { includeUnprinted?: boolean },
): Map<string, PrintCandidate[]> {
  const lang = language.trim().toLowerCase() || "fr";
  const includeUnprinted = opts?.includeUnprinted === true;
  const cacheKey = `${lang}\0${includeUnprinted ? "all" : "printed"}`;
  const hit = checklistPrintsByLang.get(cacheKey);
  if (hit) return hit;

  const rows = listTcgdexRowsForLanguage(lang, { includeUnprinted });
  const presentIds = new Set(
    rows.map((row) => row.setId.trim().toLowerCase()),
  );
  const bySet = new Map<string, PrintCandidate[]>();
  for (const row of rows) {
    const setId = row.setId.trim().toLowerCase();
    if (isLegacyTcgdexTrainerGalleryId(setId, presentIds)) continue;
    const candidate = toChecklistPrintCandidate(cardFromLocalRow(row), {
      printed: rowIsPrinted(row) ? undefined : false,
    });
    const list = bySet.get(setId);
    if (list) list.push(candidate);
    else bySet.set(setId, [candidate]);
  }
  checklistPrintsByLang.set(cacheKey, bySet);
  return bySet;
}

function preferFacedFirst(candidates: PrintCandidate[]): PrintCandidate[] {
  const hasFace = (candidate: PrintCandidate) =>
    Boolean(candidate.thumbnailUrl || candidate.imageUrl);
  return [
    ...candidates.filter(hasFace),
    ...candidates.filter((candidate) => !hasFace(candidate)),
  ];
}

export function listPokemonLivePrintLanguages(): string[] {
  return distinctPrintLanguages(tcgdexDbPath());
}

export function labelPokemonLivePrintSet(opts: {
  setCode: string;
  language?: string | null;
}): string | null {
  return labelFromPrintSetOptions(
    listTcgdexLocalSets(opts.language ?? undefined),
    opts.setCode,
  );
}

export function listPokemonLivePrintSets(
  language?: string | null,
): { id: string; label: string; sortKey?: number }[] {
  return listTcgdexLocalSets(language ?? undefined);
}

/** Local ∪ logos ∪ API — cold-start sets stay visible before harvest. */
export async function listPokemonLivePrintSetsMerged(
  language?: string | null,
): Promise<{ id: string; label: string; sortKey?: number }[]> {
  const local = listTcgdexLocalSets(language ?? undefined);
  const logos = (loadTcgdexSetLogoIndex()?.sets ?? [])
    .filter((row) => row.name?.trim())
    .map((row) => ({ id: row.id, label: row.name!.trim() }));
  const remote = await listTcgdexRemoteSets({
    language: tcgdexLanguageFromLiveOrDex(language) ?? undefined,
  });
  const merged = withTcgdexSetSymbols(
    mergePrintSetOptions(local, logos, remote),
  );
  const ids = new Set(merged.map((row) => row.id.toLowerCase()));
  return merged.filter(
    (row) => !isLegacyTcgdexTrainerGalleryId(row.id, ids),
  );
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
  return preferFacedFirst(out);
}

export async function searchPokemonLivePrintsWithRemote(
  query: string,
  opts: {
    language?: string | null;
    limit?: number;
    setId?: string | null;
    catalogueBrowse?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<PrintCandidate[]> {
  const local = searchPokemonLivePrints(query, {
    language: opts.language ?? undefined,
    limit: opts.limit,
    setId: opts.setId,
    catalogueBrowse: opts.catalogueBrowse,
  });
  if (local.length > 0) return local;
  const cards = await searchTcgdexCards(query, {
    language: tcgdexLanguageFromLiveOrDex(opts.language) ?? undefined,
    limit: opts.limit,
    signal: opts.signal,
    setId: opts.setId ?? undefined,
  });
  return preferFacedFirst(cards.map(toPrintCandidate));
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

export async function lookupPokemonLivePrintWithRemote(
  printKey: string,
  opts: {
    language?: string | null;
    name?: string | null;
    signal?: AbortSignal;
  } = {},
): Promise<PrintCandidate | null> {
  if (parsePrintKey(printKey)?.game !== POKEMON_GAME) return null;
  const local = lookupPokemonLivePrint(printKey, opts.language);
  if (local) return local;
  const card = await fetchTcgdexCardByPrintKey(printKey, {
    language: tcgdexLanguageFromLiveOrDex(opts.language) ?? undefined,
    name: opts.name ?? undefined,
    signal: opts.signal,
  });
  return card ? toPrintCandidate(card) : null;
}

export function listPokemonLiveSetPrints(opts: {
  setId: string;
  language?: string | null;
  includeUnprinted?: boolean;
}): PrintCandidate[] {
  const lang = (opts.language ?? "fr").trim().toLowerCase() || "fr";
  const key = opts.setId.trim().toLowerCase();
  if (!key) return [];
  return (
    checklistPrintsForLanguage(lang, {
      includeUnprinted: opts.includeUnprinted,
    }).get(key) ?? []
  );
}
