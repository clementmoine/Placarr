/**
 * Assembler la check-list d'une étagère : catalogue, collection, prix, produits.
 *
 * Le calcul lui-même vit dans `core/collect` et ne connaît aucun jeu. Ce module
 * fait le travail d'aiguillage : trouver les packs qui servent ce type
 * d'étagère, leur demander leurs extensions et leurs tirages, lire les items
 * possédés, puis chercher un prix pour ce qui manque.
 *
 * **Tout est borné par une langue.** Compléter une extension n'a de sens que
 * dans une langue — les 182 tirages français de la Série 1 et ses 128 anglais
 * ne sont pas la même collection — et un pourcentage qui les mêlerait ne
 * voudrait rien dire.
 */
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { parsePrintKey } from "@/core/identify/printKey";
import {
  buildShelfChecklist,
  type ChecklistPrint,
  type ShelfChecklist,
} from "@/core/collect/checklist";
import {
  buyOptionsForMissing,
  planSetCompletion,
  projectBuyProductsBySet,
  sealedSourcesByPrint,
  singlesCostBreakdown,
  type BuyOption,
  type BuyProduct,
  type CompletionPlan,
  type SealedPrintSource,
} from "@/core/collect/buyAdvice";
import { displayEstimatedCentsFromOffers } from "@/core/commerce/pricing/pricePipeline";
import type { PriceObservation } from "@/core/commerce/pricing/priceTypes";
import {
  readBoosterCompositionFile,
  resolveBoosterComposition,
  specificPacksPerHitByPrint,
  type BoosterCompositionFile,
} from "@/providers/shared/sealedProducts/boosterComposition";
import {
  inferPrintPickerDefaults,
  type PrintPickerCatalogueHint,
} from "@/lib/collect/inferPrintPickerDefaults";
import { loadBuyProducts } from "@/lib/collect/sealedProductsLoad";
import type { ProviderModule } from "@/types/providerModule";
import type { MediaType } from "@/types/providerRegistry";

function boosterCompositionForModules(
  modules: readonly ProviderModule[],
  dataPackIds: readonly string[],
): BoosterCompositionFile | null {
  for (const pack of modules) {
    const fromModule = pack.loadBoosterComposition?.() ?? null;
    if (fromModule?.version === 1) return fromModule;
  }
  for (const packId of dataPackIds) {
    const fromDisk = readBoosterCompositionFile(packId);
    if (fromDisk) return fromDisk;
  }
  return null;
}

export type ChecklistSetAdvice = {
  setId: string;
  /** Ce que coûterait l'achat à l'unité, et où est la falaise. */
  singles: ReturnType<typeof singlesCostBreakdown>;
  /**
   * Prix unitaire des manquantes (`printKey` → centimes). Absent = pas de cote
   * connue — la carte n'est pas gratuite, elle est juste hors cache.
   * Toujours en devise d'affichage (EUR), y compris après fallback FX USD→EUR.
   */
  prices: Record<string, number>;
  /**
   * Produits scellés qui **garantissent** chaque manquante (starter, promo
   * gift…). Absent = seulement le pool booster du set, pas de liste connue.
   */
  sealedSources: Record<string, SealedPrintSource[]>;
  options: BuyOption[];
  /** Singles (chase / fin de set) + fill scellé milieu de set si l'EV tient. */
  plan: CompletionPlan;
};

export type ShelfChecklistResult = ShelfChecklist & {
  catalogues: { id: string; label: string }[];
  advice: ChecklistSetAdvice[];
  /** Langues que les packs de cette étagère annoncent. */
  languages: string[];
};

/**
 * Les packs qui servent cette étagère — pas tous ceux de son **type**.
 *
 * `Shelf` ne porte qu'un `type`, et `tcg` est partagé par Lorcana, Pokémon,
 * Naruto et Dragon Ball. S'en contenter comptait les 292 extensions de tous les
 * jeux : l'étagère Lorcana annonçait « 193 / 31 795 — 1 % », en additionnant des
 * cartes Pokémon qu'elle ne contiendra jamais.
 *
 * Le jeu se **déduit de ce que l'étagère contient**, comme le fait déjà le
 * sélecteur d'ajout : chaque `printKey` porte son slug de jeu.
 *
 * Plusieurs catalogues partagent parfois le même slug (`naruto` = Carddass,
 * Ninja Ranks, Ultra Challenge, 疾風伝). On resserre alors au **catalogue** :
 * nom d'étagère (comme le print picker) et/ou extensions réellement présentes
 * dans les `printKey` possédés. Une étagère vide ou ambiguë n'impose rien —
 * mieux vaut trop montrer que de taire un jeu que l'utilisateur y range.
 */
function providersForShelf(input: {
  type: MediaType;
  games: ReadonlySet<string>;
  catalogueIds?: ReadonlySet<string>;
}): ProviderModule[] {
  const candidates = PROVIDER_MODULES.filter(
    (pack) =>
      pack.info.types.includes(input.type) &&
      typeof pack.listSetPrints === "function" &&
      typeof pack.listPrintSets === "function",
  );
  const byGame =
    input.games.size === 0
      ? candidates
      : candidates.filter((pack) =>
          (pack.printGames ?? []).some((game: string) =>
            input.games.has(game),
          ),
        );
  const scoped = byGame.length > 0 ? byGame : candidates;
  if (!input.catalogueIds || input.catalogueIds.size === 0) return scoped;
  const byCatalogue = scoped.filter((pack) =>
    input.catalogueIds!.has(pack.info.id),
  );
  return byCatalogue.length > 0 ? byCatalogue : scoped;
}

/** Les jeux qu'une étagère contient, lus dans les clés de ses tirages. */
export function gamesInShelf(printKeys: Iterable<string>): Set<string> {
  const games = new Set<string>();
  for (const key of printKeys) {
    const game = parsePrintKey(key)?.game;
    if (game) games.add(game);
  }
  return games;
}

/**
 * Catalogues dont une extension apparaît dans les tirages possédés.
 *
 * `naruto:nr-0001` et `naruto:uc-0001` partagent le jeu `naruto` mais pas le
 * catalogue — le set de la clé tranche.
 */
export async function cataloguesInShelf(
  modules: readonly ProviderModule[],
  printKeys: Iterable<string>,
  language?: string | null,
): Promise<Set<string>> {
  const ownedSets = new Set<string>();
  for (const key of printKeys) {
    const set = parsePrintKey(key)?.set;
    if (set) ownedSets.add(set);
  }
  if (ownedSets.size === 0) return new Set();

  const owners = new Set<string>();
  for (const pack of modules) {
    const sets = await Promise.resolve(
      pack.listPrintSets?.(
        pack.info.types[0] ?? "tcg",
        language,
      ) ?? [],
    );
    for (const set of sets) {
      if (ownedSets.has(set.id.trim().toLowerCase())) {
        owners.add(pack.info.id);
        break;
      }
    }
  }
  return owners;
}

function catalogueHintsFor(
  modules: readonly ProviderModule[],
): PrintPickerCatalogueHint[] {
  return modules.map((pack) => ({
    id: pack.info.id,
    label: pack.info.catalogueLabel ?? pack.info.label,
    aliases: (pack.info.catalogueAliases ?? []).map((entry) =>
      typeof entry === "string" ? { label: entry } : entry,
    ),
    defaultLanguage:
      pack.info.defaultLanguage === "fr" || pack.info.defaultLanguage === "en"
        ? pack.info.defaultLanguage
        : null,
    languages: [],
  }));
}

/**
 * Quel(s) catalogue(s) bornent la check-list.
 *
 * 1. Nom d'étagère unique (« Naruto Ninja Ranks ») → ce catalogue.
 * 2. Sinon, catalogues qui possèdent réellement les extensions des cartes
 *    déjà rangées.
 * 3. Sinon rien — on reste au scope jeu / type.
 */
export async function resolveChecklistCatalogueIds(input: {
  modules: readonly ProviderModule[];
  shelfName?: string | null;
  owned: ReadonlySet<string>;
  language?: string | null;
}): Promise<Set<string>> {
  const inferred = inferPrintPickerDefaults(
    input.shelfName,
    catalogueHintsFor(input.modules),
    [...input.owned].map((printKey) => ({ printKey })),
  );
  if (inferred.catalogueId) {
    return new Set([inferred.catalogueId]);
  }
  return cataloguesInShelf(input.modules, input.owned, input.language);
}

/**
 * Un prix pour une carte manquante — sync auto puis lecture cache.
 *
 * Les offres en base sont attachées aux **items** : elles ne disent rien de ce
 * qui manque. On demande donc aux packs de cote (`referencePriceSource`) qui
 * savent aussi rejouer un cache (`evidenceOnlyPriceRefresh`) :
 *
 * 1. **une** passe sans `evidenceOnly` sur la première clé — peuplement /
 *    rafraîchissement du ProviderEvidence (ex. dump DotGG Lorcana) ;
 * 2. les clés suivantes en `evidenceOnly` — zéro HTTP, lecture du cache.
 *
 * Pas de bouton : ouvrir la check-list suffit. Une carte toujours sans cote
 * reste « sans prix connu », jamais gratuite.
 */
function checklistPriceContext(
  shelfType: MediaType,
  printKey: string,
  evidenceOnly: boolean,
) {
  return {
    shelfType,
    printKey,
    evidenceOnly,
    barcodes: [] as string[],
    cleanedBarcode: "",
    primaryTitle: "",
    primaryName: "",
    titles: [] as string[],
    acceptanceTitles: [] as string[],
    fallbackNames: [] as string[],
    leDenicheurQueries: [] as string[],
    isPal: false,
    isClassics: false,
  };
}

async function priceMissing(
  shelfType: MediaType,
  printKeys: readonly string[],
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const pricers = PROVIDER_MODULES.filter(
    (pack) =>
      pack.info.types.includes(shelfType) &&
      typeof pack.refreshBarcodePriceOffers === "function" &&
      pack.info.evidenceOnlyPriceRefresh &&
      /*
        Sur une étagère TCG on ne réveille pas eBay / Back Market : ce sont des
        scrapers à la carte. Les cotes de référence (Lorcana.gg, …) tiennent un
        index bulk qu'on peut syncer une fois puis relire.
      */
      (shelfType !== "tcg" || pack.info.referencePriceSource),
  );
  if (pricers.length === 0 || printKeys.length === 0) return prices;

  const seed = printKeys[0]!;
  for (const pack of pricers) {
    try {
      await pack.refreshBarcodePriceOffers!(
        checklistPriceContext(shelfType, seed, false),
      );
    } catch {
      /* un pack muet n'empêche pas les autres de répondre */
    }
  }

  for (const printKey of printKeys) {
    const observations: PriceObservation[] = [];
    for (const pack of pricers) {
      try {
        const offers = await pack.refreshBarcodePriceOffers!(
          checklistPriceContext(shelfType, printKey, true),
        );
        for (const offer of offers ?? []) {
          if (typeof offer.priceCents !== "number" || offer.priceCents <= 0) {
            continue;
          }
          observations.push({
            source: offer.source,
            condition: offer.condition ?? null,
            priceCents: offer.priceCents,
            currency: offer.currency ?? null,
            productName: offer.productName ?? null,
            sourceUrl: offer.sourceUrl ?? null,
            metadataScoped: offer.metadataScoped,
          });
        }
      } catch {
        /* un pack muet n'empêche pas les autres de répondre */
      }
    }
    const cents = await displayEstimatedCentsFromOffers(
      shelfType,
      observations,
    );
    if (cents != null) prices.set(printKey, cents);
  }
  return prices;
}

export async function buildChecklistForShelf(input: {
  shelfType: MediaType;
  /** `printKey` des exemplaires possédés, déjà filtrés sur la langue. */
  owned: ReadonlySet<string>;
  language?: string | null;
  /** Nom d'étagère — borne au catalogue quand il est unique (Ninja Ranks…). */
  shelfName?: string | null;
}): Promise<ShelfChecklistResult> {
  const games = gamesInShelf(input.owned);
  const language = input.language?.trim().toLowerCase() || null;
  const gameScoped = providersForShelf({ type: input.shelfType, games });
  const catalogueIds = await resolveChecklistCatalogueIds({
    modules: gameScoped,
    shelfName: input.shelfName,
    owned: input.owned,
    language,
  });
  const modules = providersForShelf({
    type: input.shelfType,
    games,
    catalogueIds,
  });

  const catalogues: { id: string; label: string }[] = [];
  const languages = new Set<string>();
  const sets: {
    id: string;
    label: string;
    group?: string | null;
    sortKey?: number | null;
  }[] = [];
  /** Langues de cartes par extension — borne les conseils scellés. */
  const setCardLanguages = new Map<string, string[]>();
  const prints: ChecklistPrint[] = [];
  const productsBySet = new Map<string, BuyProduct[]>();
  const allSealed: BuyProduct[] = [];

  for (const pack of modules) {
    catalogues.push({
      id: pack.info.id,
      label: pack.info.catalogueLabel ?? pack.info.label,
    });
    for (const code of await Promise.resolve(
      pack.listPrintLanguages?.(input.shelfType) ?? [],
    )) {
      languages.add(code.trim().toLowerCase());
    }

    const moduleSets = await Promise.resolve(
      pack.listPrintSets!(input.shelfType, language),
    );
    for (const set of moduleSets) {
      /*
        Une extension qui n'est pas parue dans cette langue n'entre pas dans le
        décompte : aucun 巻ノ n'est sorti en France, et l'y compter ferait
        chuter la complétion française pour des cartes qu'on ne peut pas
        posséder.
      */
      if (
        language &&
        set.languages?.length &&
        !set.languages.includes(language)
      )
        continue;
      sets.push({
        id: set.id,
        label: set.label,
        group: set.group ?? null,
        sortKey: set.sortKey ?? null,
      });
      if (set.languages?.length) {
        setCardLanguages.set(
          set.id,
          set.languages.map((code) => code.trim().toLowerCase()).filter(Boolean),
        );
      }
      for (const row of await Promise.resolve(
        pack.listSetPrints!({ setId: set.id, language }),
      )) {
        prints.push({
          printKey: row.printKey,
          setId: set.id,
          reference: row.reference ?? row.printKey,
          title: row.title ?? row.reference ?? row.printKey,
          thumbnailUrl: row.thumbnailUrl ?? row.imageUrl ?? null,
          rarity: row.rarity ?? null,
        });
      }
    }
  }

  /*
    Les produits scellés appartiennent au **jeu**, pas au pack qui énumère ses
    extensions. Deux jeux sur quatre sont servis par une paire de modules : l'un
    sait lister les sets sans posséder de données, l'autre possède le dossier de
    données sans savoir énumérer. Chercher les produits chez l'énumérateur
    rendait donc zéro option d'achat sur cent quarante et un produits.

    Quand un catalogue est tranché (Ninja Ranks, pas tout Naruto), on borne
    aussi les scellés à ce catalogue — un display Ultra Challenge n'aide pas
    à finir les NW.
  */
  const sealedModules =
    catalogueIds.size > 0
      ? PROVIDER_MODULES.filter(
          (pack) =>
            pack.info.types.includes(input.shelfType) &&
            catalogueIds.has(pack.info.id),
        )
      : PROVIDER_MODULES.filter((pack) => {
          if (!pack.info.types.includes(input.shelfType)) return false;
          if (
            games.size > 0 &&
            !(pack.printGames ?? []).some((game) => games.has(game))
          ) {
            return false;
          }
          return true;
        });
  for (const pack of sealedModules) {
    for (const product of loadBuyProducts(pack.catalog?.dataPack)) {
      allSealed.push(product);
    }
  }

  const printSetIds = new Map<string, string>();
  for (const row of prints) {
    printSetIds.set(row.printKey, row.setId);
  }
  for (const [setId, rows] of projectBuyProductsBySet({
    products: allSealed,
    printSetIds,
  })) {
    productsBySet.set(setId, rows);
  }

  const sourcesIndex = sealedSourcesByPrint(allSealed);

  const dataPackIds = [
    ...new Set(
      sealedModules.flatMap((pack) =>
        pack.catalog?.dataPack ? [pack.catalog.dataPack] : [],
      ),
    ),
  ];
  const compositionFile = boosterCompositionForModules(modules, dataPackIds);

  const checklist = buildShelfChecklist({
    sets,
    prints,
    owned: input.owned,
    language,
  });

  const advice: ChecklistSetAdvice[] = [];
  // Toute extension incomplète — y compris à 0 % — reçoit un conseil d'achat.
  for (const set of checklist.sets) {
    if (set.missing.length === 0) continue;
    const missingKeys = set.missing.map((row) => row.printKey);
    const prices = await priceMissing(input.shelfType, missingKeys);
    /*
      Filtre check-list → une seule langue. Sinon les langues **des cartes**
      de l'extension (pas tous les scellés du monde : un booster DE pour une
      Série 1 sans titres DE n'aide pas).
    */
    const allowedLanguages = language
      ? [language]
      : (setCardLanguages.get(set.id) ?? []);
    const products = productsBySet.get(set.id) ?? [];

    const setPrints = prints.filter((row) => row.setId === set.id);
    const packsPerHitByPrint =
      compositionFile != null
        ? specificPacksPerHitByPrint({
            profile: resolveBoosterComposition(compositionFile, set.id),
            pool: setPrints.map((row) => ({
              printKey: row.printKey,
              rarity: row.rarity,
            })),
          })
        : undefined;

    const options = buyOptionsForMissing({
      missing: new Set(missingKeys),
      poolSize: set.total,
      products,
      allowedLanguages,
      preferredLanguage: language,
      packsPerHitByPrint,
    });
    const sealedSources: Record<string, SealedPrintSource[]> = {};
    for (const key of missingKeys) {
      const sources = sourcesIndex.get(key);
      if (sources?.length) sealedSources[key] = sources;
    }
    advice.push({
      setId: set.id,
      singles: singlesCostBreakdown(
        missingKeys.map((key) => prices.get(key) ?? null),
      ),
      prices: Object.fromEntries(prices),
      sealedSources,
      options,
      plan: planSetCompletion({
        missingPrices: new Map(
          missingKeys.map((key) => [key, prices.get(key) ?? null]),
        ),
        poolSize: set.total,
        options,
        products,
        packsPerHitByPrint,
      }),
    });
  }

  return {
    ...checklist,
    catalogues,
    advice,
    languages: [...languages].sort(),
  };
}
