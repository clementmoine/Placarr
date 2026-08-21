/**
 * Print search — the entry point for shelves that cannot be scanned.
 *
 * Everywhere else identification starts from a barcode. Trading cards have
 * none, so the user searches by name and picks a *printing*: a title alone is
 * not an answer, since five Lorcana prints share the name "Chiot dalmatien".
 *
 * Core stays provider-blind: it asks every module registered for the media type
 * that implements `searchPrints`, and merges. A second game (Pokémon, Magic)
 * plugs in by declaring the capability, with nothing to change here.
 */
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { parsePrintKey } from "@/core/identify/printKey";
import { isAbortError } from "@/lib/http/abort";

import type { PrintCandidate, PrintSetOption } from "@/types/providerModule";

const DEFAULT_LIMIT = 24;

/** Per-provider ceiling, so one chatty source cannot crowd the others out. */
const PER_PROVIDER_LIMIT = 24;

/**
 * Plafond par provider quand l'appelant en demande davantage.
 *
 * Le plafond fixe ne tronquait pas au hasard : les providers rendent leurs
 * résultats classés, langue préférée d'abord, si bien qu'à vingt-quatre lignes
 * une recherche large ne montrait que du français — les tirages qui n'existent
 * qu'en japonais n'apparaissaient jamais, et filtrer par langue ne pouvait rien
 * y faire. Une demande explicite passe donc jusqu'au provider.
 */
const MAX_PER_PROVIDER_LIMIT = 200;

export type PrintSearchOptions = {
  language?: string | null;
  limit?: number;
  signal?: AbortSignal;
  /** Restreint à une extension — permet une requête vide. */
  setId?: string | null;
  /**
   * Restreint la recherche à un catalogue, par son id de provider.
   *
   * Core reste aveugle : il reçoit un identifiant, il n'en nomme aucun. Sans
   * cette restriction, le plafond de résultats se partage entre tous les jeux
   * de cartes — demander « les Naruto » ne donnait qu'une part des places, le
   * reste allant à des catalogues qu'on ne regardait pas.
   */
  providerId?: string | null;
};

function providersFor(type: string, providerId?: string | null) {
  const wanted = providerId?.trim().toLowerCase();
  return PROVIDER_MODULES.filter(
    (module) =>
      typeof module.searchPrints === "function" &&
      module.info.types.some((mediaType) => mediaType === type) &&
      (!wanted || module.info.id.toLowerCase() === wanted),
  );
}

export type PrintCatalogue = {
  id: string;
  label: string;
  /** Vide quand le provider n'annonce pas encore ses extensions. */
  sets: PrintSetOption[];
  /**
   * Les langues de ce catalogue, si le pack les annonce.
   *
   * Sert à proposer la langue **avant** la première recherche : chez Naruto
   * elle change la découpe des extensions, pas seulement ce qu'on voit.
   */
  languages: string[];
};

/**
 * Les catalogues interrogeables pour ce type, avec leurs extensions.
 *
 * Rendus **sans requête** : c'est ce qui permet de choisir « la Série 1 » avant
 * de savoir quoi y chercher. Tant que la liste se dérivait des résultats, elle
 * était vide à l'ouverture et ne montrait ensuite que les extensions présentes
 * dans la page de résultats — jamais un set entier.
 */
export async function printSearchCatalogues(
  type: string,
  language?: string | null,
): Promise<PrintCatalogue[]> {
  const rows = await Promise.all(
    providersFor(type).map(async (module) => ({
      id: module.info.id,
      // Le nom du **jeu** quand le provider le donne : on choisit un catalogue,
      // pas un dépôt de données. `label` désigne la source, et « LorcanaJSON »
      // n'est pas ce qu'on cherche dans une liste de jeux.
      label: module.info.catalogueLabel ?? module.info.label,
      /*
        Un catalogue qui échoue à lister ses extensions n'en prive pas les
        autres : il apparaît sans set, ce qui reste vrai, plutôt que de vider
        tout le sélecteur.
      */
      sets: await Promise.resolve(
        module.listPrintSets?.(type, language) ?? [],
      ).catch(() => [] as PrintSetOption[]),
      languages: await Promise.resolve(
        module.listPrintLanguages?.(type) ?? [],
      ).catch(() => [] as string[]),
    })),
  );
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * One printing by key, from whichever provider owns that game. Asked live
 * rather than read from storage: what a print exists as belongs to the
 * provider, and a persisted copy would drift as sets get corrected.
 */
export async function lookupPrintCandidate(
  printKey: string,
  type: string,
  options: PrintSearchOptions & { name?: string | null } = {},
): Promise<PrintCandidate | null> {
  const key = printKey?.trim();
  if (!key || !parsePrintKey(key)) return null;

  for (const provider of PROVIDER_MODULES) {
    if (typeof provider.lookupPrint !== "function") continue;
    if (!provider.info.types.some((mediaType) => mediaType === type)) continue;
    try {
      const found = await provider.lookupPrint({
        printKey: key,
        name: options.name,
        language: options.language,
        signal: options.signal,
      });
      if (found) return { ...found, providerId: provider.info.id };
    } catch (error) {
      // Client navigated away / HMR killed the batch — not a provider fault.
      if (isAbortError(error) || options.signal?.aborted) throw error;
      // One provider failing must not hide a print another one could resolve.
      console.warn(
        `[lookupPrintCandidate] ${provider.info.id} failed for "${key}":`,
        error,
      );
    }
  }
  return null;
}

/** Whether any provider can answer a print search for this media type. */
export function supportsPrintSearch(type: string): boolean {
  return providersFor(type).length > 0;
}

/**
 * Merged, de-duplicated candidates. A malformed or missing print key drops the
 * row: a candidate the app could not re-resolve later is worse than one result
 * fewer.
 */
export async function searchPrintCandidates(
  query: string,
  type: string,
  options: PrintSearchOptions = {},
): Promise<PrintCandidate[]> {
  const trimmed = query?.trim();
  const setId = options.setId?.trim();
  /*
    Une requête vide n'est plus forcément une non-question : accompagnée d'une
    extension, elle veut dire « montre-moi ce set ». Sans extension, elle reste
    sans réponse — chercher tout le catalogue n'est pas une intention.
  */
  if (!trimmed && !setId) return [];

  const modules = providersFor(type, options.providerId);
  if (modules.length === 0) return [];

  const settled = await Promise.allSettled(
    modules.map(async (module) => {
      const found = await module.searchPrints!({
        query: trimmed ?? "",
        setId,
        language: options.language,
        limit: Math.min(
          Math.max(options.limit ?? PER_PROVIDER_LIMIT, PER_PROVIDER_LIMIT),
          MAX_PER_PROVIDER_LIMIT,
        ),
        signal: options.signal,
      });
      return found.map((candidate) => ({
        ...candidate,
        providerId: module.info.id,
      }));
    }),
  );

  const merged: PrintCandidate[] = [];
  const seen = new Set<string>();

  for (const [position, result] of settled.entries()) {
    if (result.status === "rejected") {
      // One provider failing must not empty the list the user is looking at.
      console.warn(
        `[searchPrintCandidates] ${modules[position]?.info.id} failed for "${trimmed}":`,
        result.reason,
      );
      continue;
    }

    for (const candidate of result.value) {
      if (candidate.printed === false) continue;
      if (!parsePrintKey(candidate.printKey)) continue;
      const key = `${candidate.printKey}|${candidate.language ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(candidate);
    }
  }

  return merged.slice(0, options.limit ?? DEFAULT_LIMIT);
}

/**
 * Reverse of `slugifyItemName("TFC#002")` → `tfc-2` (and `PR3#34` → `pr3-34`).
 * Used so bookmarks to the pre-enrichment URL still resolve after the catalog
 * title rewrites the slug.
 */
export function collectorQueryFromItemSlug(slug: string): string | null {
  const match = slug.trim().match(/^([a-z][a-z0-9]*)-(\d+[a-z]?)$/i);
  if (!match) return null;
  return `${match[1]!.toUpperCase()}#${match[2]}`;
}

/** Promo tokens collectors type (`P3`, `PR3`) — not a card title. */
function queryPromoGrouping(query: string): string | null {
  const match = query.match(/\bpr?(\d+)\b/i);
  return match ? `p${match[1]}` : null;
}

function printNumberIdentity(printKey: string): string | null {
  const identity = parsePrintKey(printKey);
  if (!identity) return null;
  return `${identity.game}|${identity.set}|${identity.number}`;
}

/**
 * Resolve a pasted line to a single printing when the query is unambiguous.
 *
 * Used by bulk add: `TFC#001` is a lookup code, not a display name. Ambiguous
 * names (`elsa`, `premier chapitre`, twin promos) stay unresolved so we never
 * invent a print the collector did not pick.
 */
export async function resolveUniquePrintCandidate(
  query: string,
  type: string,
  options: PrintSearchOptions = {},
): Promise<PrintCandidate | null> {
  const found = await searchPrintCandidates(query, type, {
    ...options,
    limit: options.limit ?? PER_PROVIDER_LIMIT,
  });
  if (found.length === 0) return null;

  const byKey = new Map<string, PrintCandidate>();
  for (const candidate of found) {
    if (!byKey.has(candidate.printKey)) {
      byKey.set(candidate.printKey, candidate);
    }
  }
  if (byKey.size === 1) return byKey.values().next().value ?? null;

  const wantedPromo = queryPromoGrouping(query);
  if (wantedPromo) {
    const promoHits = [...byKey.values()].filter(
      (candidate) =>
        parsePrintKey(candidate.printKey)?.grouping === wantedPromo,
    );
    if (promoHits.length === 1) return promoHits[0]!;
    return null;
  }

  // `TFC#20` hits both the base print and `20/P1`. Prefer the base when the
  // query did not ask for a promo group and every hit shares set + number.
  const identities = [...byKey.keys()].map(printNumberIdentity);
  if (identities.some((id) => id == null)) return null;
  if (new Set(identities).size !== 1) return null;

  const base = [...byKey.values()].find(
    (candidate) => !parsePrintKey(candidate.printKey)?.grouping,
  );
  return base ?? null;
}
