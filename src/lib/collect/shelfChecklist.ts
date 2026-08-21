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
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { PROVIDER_MODULES } from "@/core/catalog/registry";
import { parsePrintKey } from "@/core/identify/printKey";
import {
  buildShelfChecklist,
  type ChecklistPrint,
  type ShelfChecklist,
} from "@/core/collect/checklist";
import {
  buyOptionsForMissing,
  singlesCostBreakdown,
  type BuyOption,
  type BuyProduct,
  type ProductBehavior,
} from "@/core/collect/buyAdvice";
import { dataRoot } from "@/lib/runtimeData";
import type { ProviderModule } from "@/types/providerModule";
import type { MediaType } from "@/types/providerRegistry";

export type ChecklistSetAdvice = {
  setId: string;
  /** Ce que coûterait l'achat à l'unité, et où est la falaise. */
  singles: ReturnType<typeof singlesCostBreakdown>;
  options: BuyOption[];
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
 * sélecteur d'ajout : chaque `printKey` porte son slug de jeu. Une étagère vide
 * ou mixte n'impose rien, et on retombe alors sur tous les packs du type —
 * mieux vaut trop montrer que de taire un jeu que l'utilisateur y range.
 */
function providersForShelf(input: {
  type: MediaType;
  games: ReadonlySet<string>;
}): ProviderModule[] {
  const candidates = PROVIDER_MODULES.filter(
    (pack) =>
      pack.info.types.includes(input.type) &&
      typeof pack.listSetPrints === "function" &&
      typeof pack.listPrintSets === "function",
  );
  if (input.games.size === 0) return candidates;
  const scoped = candidates.filter((pack) =>
    (pack.printGames ?? []).some((game: string) => input.games.has(game)),
  );
  return scoped.length > 0 ? scoped : candidates;
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
 * Les produits scellés d'un pack, tels que son index les publie.
 *
 * Absent = pas de conseil d'achat pour ce pack, ce que l'interface doit dire.
 * Inventer un booster serait pire que de n'en proposer aucun.
 */
function sealedProductsFor(pack: string | null | undefined): BuyProduct[] {
  if (!pack) return [];
  const file = path.join(dataRoot(), ...pack.split("/"), "products-index.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      products?: Record<string, Record<string, unknown>>;
    };
    return Object.values(parsed.products ?? {}).map((row) => ({
      slug: String(row.slug ?? ""),
      name: String(row.name ?? ""),
      kind: String(row.kind ?? ""),
      behavior: String(row.behavior ?? "random_pack") as ProductBehavior,
      setId: (row.setCode as string | null) ?? null,
      prints: Array.isArray(row.prints) ? (row.prints as string[]) : null,
      printsArePreview: Boolean(row.containsPrintsIsPreview),
      cardCount: (row.declaredCardCount as number | null) ?? null,
      priceCents: null,
    }));
  } catch {
    return [];
  }
}

/**
 * Un prix pour une carte qu'on ne possède pas.
 *
 * Les offres en base sont attachées aux **items** : par construction, elles ne
 * disent rien de ce qui manque. On redemande donc aux packs qui savent tarifer
 * un tirage isolé — chez Lorcana c'est un index déjà chargé, donc bon marché.
 *
 * Une carte sans prix reste **comptée comme sans prix**, jamais comme gratuite :
 * c'est ce qui distingue « ce set coûte 12 € » de « ce set coûte 12 € plus
 * quarante cartes qu'on ne sait pas chiffrer ».
 */
async function priceMissing(
  shelfType: MediaType,
  printKeys: readonly string[],
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const pricers = PROVIDER_MODULES.filter(
    (pack) =>
      pack.info.types.includes(shelfType) &&
      typeof pack.refreshBarcodePriceOffers === "function",
  );
  if (pricers.length === 0) return prices;

  for (const printKey of printKeys) {
    for (const pack of pricers) {
      try {
        const offers = await pack.refreshBarcodePriceOffers!({
          shelfType,
          printKey,
        } as never);
        const cheapest = (offers ?? [])
          .map((offer) => offer.priceCents)
          .filter((cents): cents is number => typeof cents === "number")
          .sort((a, b) => a - b)[0];
        if (cheapest != null) {
          prices.set(printKey, cheapest);
          break;
        }
      } catch {
        /* un pack muet n'empêche pas les autres de répondre */
      }
    }
  }
  return prices;
}

export async function buildChecklistForShelf(input: {
  shelfType: MediaType;
  /** `printKey` des exemplaires possédés, déjà filtrés sur la langue. */
  owned: ReadonlySet<string>;
  language?: string | null;
  /** Tarifer les manquantes coûte du temps ; l'appelant décide. */
  withPrices?: boolean;
}): Promise<ShelfChecklistResult> {
  const modules = providersForShelf({
    type: input.shelfType,
    games: gamesInShelf(input.owned),
  });
  const language = input.language?.trim().toLowerCase() || null;

  const catalogues: { id: string; label: string }[] = [];
  const languages = new Set<string>();
  const sets: { id: string; label: string; group?: string | null }[] = [];
  const prints: ChecklistPrint[] = [];
  const productsBySet = new Map<string, BuyProduct[]>();

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
    for (const product of sealedProductsFor(pack.catalog?.dataPack)) {
      if (!product.setId) continue;
      const rows = productsBySet.get(product.setId) ?? [];
      rows.push(product);
      productsBySet.set(product.setId, rows);
    }

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
      sets.push({ id: set.id, label: set.label, group: set.group ?? null });
      for (const row of await Promise.resolve(
        pack.listSetPrints!({ setId: set.id, language }),
      )) {
        prints.push({
          printKey: row.printKey,
          setId: set.id,
          reference: row.reference ?? row.printKey,
          title: row.title ?? row.reference ?? row.printKey,
          thumbnailUrl: row.thumbnailUrl ?? row.imageUrl ?? null,
        });
      }
    }
  }

  const checklist = buildShelfChecklist({
    sets,
    prints,
    owned: input.owned,
    language,
  });

  const advice: ChecklistSetAdvice[] = [];
  for (const set of checklist.sets) {
    if (set.missing.length === 0) continue;
    const missingKeys = set.missing.map((row) => row.printKey);
    const prices = input.withPrices
      ? await priceMissing(input.shelfType, missingKeys)
      : new Map<string, number>();
    advice.push({
      setId: set.id,
      singles: singlesCostBreakdown(
        missingKeys.map((key) => prices.get(key) ?? null),
      ),
      options: buyOptionsForMissing({
        missing: new Set(missingKeys),
        poolSize: set.total,
        products: productsBySet.get(set.id) ?? [],
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
