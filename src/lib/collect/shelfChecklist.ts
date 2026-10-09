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
  resolveMasterSetOwned,
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
import { normalizeVariantOptions } from "@/core/enrich/variants";
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
   * Prix unitaire par carte du set (`printKey` → centimes), **possédées
   * comprises** — pour afficher la cote même une fois la case cochée.
   * Absent = pas de cote connue. Devise d'affichage (EUR), y compris après
   * fallback FX USD→EUR. Le plan d'achat (`singles` / `plan`) ne compte que
   * les manquantes.
   */
  prices: Record<string, number>;
  /**
   * Produits scellés qui **garantissent** chaque carte du set (starter, promo
   * gift…), y compris déjà possédées. Absent = seulement le pool booster.
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

/**
 * Modules qui portent les SKU scellés pour le conseil d'achat.
 *
 * L'énumérateur de sets (le provider JSON upstream) n'a souvent **pas** de
 * `dataPack` : les produits vivent chez le sibling catalogue. Bornés
 * uniquement aux `catalogueIds`, on chargeait zéro booster. On ajoute donc
 * les packs **données seules** (dataPack, sans listPrintSets) qui partagent
 * un `printGames` avec les catalogues retenus — sans élargir aux autres
 * catalogues Naruto (Carddass vs Ninja Ranks ont chacun listPrintSets).
 */
export function sealedProductModulesForShelf(input: {
  type: MediaType;
  games: ReadonlySet<string>;
  catalogueIds: ReadonlySet<string>;
}): ProviderModule[] {
  const typeOk = (pack: ProviderModule) =>
    pack.info.types.includes(input.type);

  if (input.catalogueIds.size === 0) {
    return PROVIDER_MODULES.filter((pack) => {
      if (!typeOk(pack)) return false;
      if (
        input.games.size > 0 &&
        !(pack.printGames ?? []).some((game) => input.games.has(game))
      ) {
        return false;
      }
      return true;
    });
  }

  const selected = PROVIDER_MODULES.filter((pack) =>
    input.catalogueIds.has(pack.info.id),
  );
  const selectedGames = new Set(
    selected.flatMap((pack) => pack.printGames ?? []),
  );

  const byId = new Map<string, ProviderModule>();
  for (const pack of PROVIDER_MODULES) {
    if (!typeOk(pack)) continue;
    if (input.catalogueIds.has(pack.info.id)) {
      byId.set(pack.info.id, pack);
      continue;
    }
    /*
      Sibling data-only : le catalogue Lorcana a le dossier `lorcana/`, pas la
      liste d'extensions. Un second catalogue qui sait aussi lister (Carddass)
      reste hors allowlist.
    */
    if (!pack.catalog?.dataPack) continue;
    if (typeof pack.listPrintSets === "function") continue;
    if (!(pack.printGames ?? []).some((game) => selectedGames.has(game))) {
      continue;
    }
    byId.set(pack.info.id, pack);
  }
  return [...byId.values()];
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

/** Cotes unitaires pour une liste de printKeys (manquantes ou possédées). */
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
  /**
   * Exemplaires possédés, déjà filtrés sur la langue.
   *
   * Set-scoped : `setCode|printKey` (ou `printKey` legacy sans set).
   * Master set : `setCode|printKey|finish` via {@link checklistSetOwnedKey}.
   */
  owned: ReadonlySet<string>;
  language?: string | null;
  /** Nom d'étagère — borne au catalogue quand il est unique (Ninja Ranks…). */
  shelfName?: string | null;
  /**
   * Master set : une ligne par finition, possession exacte set×print×finish.
   * Sinon toute finition du même `printKey` (dans ce set) compte.
   */
  masterSet?: boolean;
}): Promise<ShelfChecklistResult> {
  const masterSet = Boolean(input.masterSet);
  /*
    `gamesInShelf` / catalogues lisent des printKey. Les clés owned sont
    `set|printKey` ou `set|printKey|finish` — on isole le segment printKey
    (celui qui contient `:`).
  */
  const ownedPrintKeys = new Set(
    [...input.owned].map((key) => {
      const parts = key.trim().toLowerCase().split("|");
      if (parts.length >= 3) return parts[1]!;
      if (parts.length === 2) {
        // `set|printKey` ou `printKey|finish` — le printKey porte toujours `:`.
        return parts[0]!.includes(":") ? parts[0]! : parts[1]!;
      }
      return parts[0]!;
    }),
  );
  const games = gamesInShelf(ownedPrintKeys);
  const language = input.language?.trim().toLowerCase() || null;
  const gameScoped = providersForShelf({ type: input.shelfType, games });
  const catalogueIds = await resolveChecklistCatalogueIds({
    modules: gameScoped,
    shelfName: input.shelfName,
    owned: ownedPrintKeys,
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
    iconUrl?: string | null;
    iconUrls?: string[] | null;
  }[] = [];
  /** Langues de cartes par extension — borne les conseils scellés. */
  const setCardLanguages = new Map<string, string[]>();
  const prints: ChecklistPrint[] = [];
  const productsBySet = new Map<string, BuyProduct[]>();
  const allSealed: BuyProduct[] = [];
  /** Finitions catalogue par printKey (minuscules) — master set ownership. */
  const finishesByPrintKey = new Map<string, string[]>();
  const plainFinishesByPrintKey = new Map<string, string[]>();

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
        iconUrl: set.iconUrl?.trim() || null,
        iconUrls: set.iconUrls?.map((u) => u.trim()).filter(Boolean) ?? null,
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
        const base = {
          printKey: row.printKey,
          setId: set.id,
          reference: row.reference ?? row.printKey,
          title: row.title ?? row.reference ?? row.printKey,
          thumbnailUrl: row.thumbnailUrl ?? row.imageUrl ?? null,
          rarity: row.rarity ?? null,
        };
        if (!masterSet) {
          prints.push(base);
          continue;
        }
        /*
          Master set : une ligne par finition annoncée. Sans liste, une seule
          ligne (finish null) — comme le print picker.
        */
        const finishes = normalizeVariantOptions(row.finishes);
        const printKeyLower = row.printKey.trim().toLowerCase();
        finishesByPrintKey.set(printKeyLower, finishes);
        plainFinishesByPrintKey.set(
          printKeyLower,
          normalizeVariantOptions(row.plainFinishes),
        );
        if (finishes.length === 0) {
          prints.push({ ...base, finish: null });
          continue;
        }
        for (const finish of finishes) {
          const finishArt = row.variantImageUrls?.[finish]?.trim();
          prints.push({
            ...base,
            finish,
            thumbnailUrl: finishArt || base.thumbnailUrl,
          });
        }
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
  const sealedModules = sealedProductModulesForShelf({
    type: input.shelfType,
    games,
    catalogueIds,
  });
  for (const pack of sealedModules) {
    for (const product of loadBuyProducts(pack.catalog?.dataPack)) {
      allSealed.push(product);
    }
  }

  /*
    Reprints multi-set (NI-009 → s1+s4) : toutes les memberships. Un last-write
    unique inventait une seule série et faussait les projections multi-set
    (coffrets). Ça n'autorise **pas** un starter S1 comme conseil pour S4.
  */
  const printSetIds = new Map<string, Set<string>>();
  for (const row of prints) {
    const key = row.printKey.trim().toLowerCase();
    const setId = row.setId.trim().toLowerCase();
    if (!key || !setId) continue;
    const bag = printSetIds.get(key) ?? new Set<string>();
    bag.add(setId);
    printSetIds.set(key, bag);
  }
  for (const [setId, rows] of projectBuyProductsBySet({
    products: allSealed,
    printSetIds,
  })) {
    productsBySet.set(setId, rows);
  }

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
    owned: masterSet
      ? resolveMasterSetOwned({
          owned: input.owned,
          finishesByPrintKey,
          plainFinishesByPrintKey,
        })
      : input.owned,
    language,
    masterSet,
  });

  const advice: ChecklistSetAdvice[] = [];
  for (const set of checklist.sets) {
    const missingKeys = set.missing.map((row) => row.printKey);
    /*
      Cotes + sources scellées pour **toutes** les cartes du set (possédées
      comprises). Le plan d'achat ne porte que sur les manquantes.
    */
    const allKeys = [
      ...new Set(set.cards.map((row) => row.printKey.trim()).filter(Boolean)),
    ];
    const prices = await priceMissing(input.shelfType, allKeys);
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

    const options =
      missingKeys.length === 0
        ? []
        : buyOptionsForMissing({
            missing: new Set(missingKeys),
            poolSize: set.total,
            products,
            allowedLanguages,
            preferredLanguage: language,
            packsPerHitByPrint,
          });
    /*
      Sources scellées **du set** seulement. Un starter S1 qui contient NI-009
      ne doit pas s'afficher sur la checklist S4 (autre extension), même si le
      printKey est partagé.
    */
    const sourcesIndex = sealedSourcesByPrint(products);
    const sealedSources: Record<string, SealedPrintSource[]> = {};
    for (const key of allKeys) {
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
