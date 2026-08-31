/**
 * Project TCG Cards staging JSON into `data/<pack>/products-index.json`.
 *
 * Staging stays the scrape cache. The index is what Catalogue reads — same
 * idea as `cards-index.json`. Packshots stay remote URLs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { providerModuleForPack } from "@/providers/shared/packOwner";

import { buildPrintKey } from "@/core/identify/printKey";
import { resolveSealedContents } from "@/core/collect/sealedContents";
import { packProductsIndexPath } from "@/lib/packPaths";
import { foilPackDataDir } from "@/lib/runtimeData";
import type {
  DbscardsProductListingRow,
  DbscardsProductPage,
  DbscardsProductPrintLink,
} from "@/providers/shared/dbscards/parseProducts";
import { tcgCardsSiteForPack } from "@/providers/shared/dbscards/sites";

import {
  emptyProductsIndex,
  sealedProductKey,
  type ProductsIndexV1,
  type SealedPrintLink,
  type SealedProductEntry,
} from "./indexFormat";
import {
  sealedBehaviorForKind,
  sealedContentsKnown,
  sealedKindForCategory,
} from "./kinds";
import { resolveContentLayers } from "./contentLayers";
import { mergeCuratedSealedContents } from "./curatedContents";

/**
 * printKey game slug for a data pack. Lives here (providers/) so core never
 * names a TCG provider. Only Bandai-shaped collector refs become printKeys
 * today — lorcards `241-204` is card/set-size, not `lorcana:241-204`.
 */
const PACK_PRINT_GAME: Readonly<Record<string, string>> = {
  "dbs/cg": "dbscg",
  "dbs/fw": "dbsfw",
  lorcana: "lorcana",
  pokemon: "pokemon",
  "naruto/carddass": "naruto",
  "naruto/en-ccg": "naruto",
};

export function printGameForPack(packId: string): string | null {
  return PACK_PRINT_GAME[packId] ?? null;
}

/** `bt13-135` / `fs10-01-p1` / `bt23-033-pr` — Bandai collector refs only. */
const BANDAI_PRINT_GAMES = new Set(["dbscg", "dbsfw"]);

/** `bt13-135` / `fs10-01-p1` → printKey when the game uses that shape. */
export function printKeyFromCollectorRef(
  game: string,
  ref: string | null | undefined,
): string | null {
  if (!BANDAI_PRINT_GAMES.has(game)) return null;
  if (!ref) return null;
  const parts = ref.trim().toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length === 2) {
    return buildPrintKey({ game, set: parts[0]!, number: parts[1]! });
  }
  return buildPrintKey({
    game,
    set: parts[0]!,
    number: parts[1]!,
    grouping: parts.slice(2).join(""),
  });
}

function packStagingProductsDir(packId: string, stagingFolder: string): string {
  return path.join(foilPackDataDir(packId), "staging", stagingFolder);
}

function readJson(file: string): unknown | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function listingRows(raw: unknown): DbscardsProductListingRow[] {
  if (!raw || typeof raw !== "object") return [];
  const products = (raw as { products?: unknown }).products;
  if (!Array.isArray(products)) return [];
  return products.filter(
    (row): row is DbscardsProductListingRow =>
      !!row &&
      typeof row === "object" &&
      typeof (row as DbscardsProductListingRow).slug === "string" &&
      typeof (row as DbscardsProductListingRow).category === "string",
  );
}

function productPages(raw: unknown): DbscardsProductPage[] {
  if (!raw || typeof raw !== "object") return [];
  const products = (raw as { products?: unknown }).products;
  if (!Array.isArray(products)) return [];
  return products.filter(
    (row): row is DbscardsProductPage =>
      !!row &&
      typeof row === "object" &&
      typeof (row as DbscardsProductPage).slug === "string" &&
      typeof (row as DbscardsProductPage).category === "string",
  );
}

/**
 * Prix boutique → centimes EUR.
 *
 * Les fiches TCG Cards portent `price` + `currency` (souvent `"4.90"` /
 * `"EUR"`). Hors euro on ignore : le conseil d'achat compare en €.
 */
export function sealedPriceCentsFromShop(input: {
  price?: string | number | null;
  currency?: string | null;
}): number | null {
  const raw = input.price;
  if (raw == null || raw === "") return null;
  const currency = (input.currency ?? "EUR").trim().toUpperCase();
  if (currency && currency !== "EUR" && currency !== "€") return null;
  const euros =
    typeof raw === "number"
      ? raw
      : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(euros) || euros <= 0) return null;
  return Math.round(euros * 100);
}

function mapPrints(
  packId: string,
  links: readonly DbscardsProductPrintLink[] | undefined,
): SealedPrintLink[] {
  const game = printGameForPack(packId);
  const out: SealedPrintLink[] = [];
  const seen = new Set<string>();
  for (const link of links ?? []) {
    const key = (link.ref ?? link.slug).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: link.name,
      slug: link.slug,
      ref: link.ref,
      printKey: game ? printKeyFromCollectorRef(game, link.ref) : null,
    });
  }
  return out;
}

export function sealedProductFromStaging(input: {
  packId: string;
  listing: Pick<
    DbscardsProductListingRow,
    "slug" | "path" | "category" | "image"
  >;
  page?: DbscardsProductPage | null;
  /** Pokémon: TCGdex wordmark index. Other packs ignore it. */
  /** Fourni par le pack qui possède ce catalogue, ou absent. */
  resolveCatalogueSetId?: (input: {
    setCode?: string | null;
    slug?: string | null;
    name?: string | null;
  }) => string | null;
  resolveSetLogo?: (input: {
    setCode?: string | null;
    slug?: string | null;
    name?: string | null;
  }) => string | null;
  /** Lorcana: official viewer set thumbs. Other packs ignore it. */
  /** Dos de l'emballage, quand une source l'a photographié. */
  imageBack?: string | null;
}): SealedProductEntry | null {
  const kind = sealedKindForCategory(input.listing.category);
  if (!kind) return null;
  const page = input.page ?? null;
  const prints = mapPrints(input.packId, page?.containsPrints);
  const preview =
    page?.containsPrintsIsPreview ?? (kind === "booster" || kind === "display");
  const declaredCardCount = page?.declaredCardCount ?? null;
  const contents = resolveSealedContents({
    kind,
    name: page?.name,
    slug: input.listing.slug,
    declaredCardCount,
  });
  const behavior = sealedBehaviorForKind(kind);
  const contentsKnown = sealedContentsKnown({
    kind,
    containsPrintsIsPreview: preview,
    printCount: prints.length,
  });
  const layers = resolveContentLayers({
    kind,
    behavior,
    prints,
    contentsKnown,
    containsPrintsIsPreview: preview,
  });
  return {
    slug: input.listing.slug,
    path: input.listing.path || page?.path || "",
    kind,
    behavior,
    category: input.listing.category,
    name: page?.name ?? null,
    image: page?.image || input.listing.image || null,
    imageBack: input.imageBack ?? null,
    // Les fiches TCG Cards ne chiffrent pas la taille du set.
    setCardCount: null,
    /*
      Le pack répond, le code partagé demande. Il y avait ici deux branches
      nommant les jeux et deux imports de providers depuis `shared/` : ajouter
      un catalogue obligeait à éditer du code commun pour lui faire une place.
    */
    setLogo:
      input.resolveSetLogo?.({
        setCode: page?.setCode,
        slug: input.listing.slug,
        name: page?.name,
      }) ?? null,
    setCode: page?.setCode ?? null,
    /*
      L'extension telle que le **catalogue** la nomme. Le `setCode` ci-dessus
      est celui de la boutique, et les deux divergent : `ROTF` contre `2`. Sans
      cette traduction, aucun produit ne se rattache à un set, donc aucun
      conseil d'achat n'est possible.
    */
    catalogueSetId:
      input.resolveCatalogueSetId?.({
        setCode: page?.setCode,
        slug: input.listing.slug,
        name: page?.name,
      }) ?? null,
    lang: page?.lang ?? null,
    releaseDate: page?.releaseDate ?? null,
    priceCents: sealedPriceCentsFromShop({
      price: page?.price,
      currency: page?.currency,
    }),
    cardsPerPack: contents.cardsPerPack,
    packsContained: contents.packsContained,
    guaranteedPrints: layers.guaranteedPrints,
    randomPoolScope: layers.randomPoolScope,
    randomPoolPrints: layers.randomPoolPrints,
    declaredCardCount,
    containsPrintsIsPreview: preview,
    contentsKnown,
    prints,
  };
}

export type IngestSealedProductsResult = {
  pack: string;
  written: number;
  skipped: number;
  file: string;
};

export async function ingestSealedProducts(
  packId: string,
): Promise<IngestSealedProductsResult | null> {
  /*
    Il y avait ici un aiguillage vers l'ingest de Naruto — du code partagé qui
    appelait un jeu précis, et refermait le graphe d'imports sur lui-même : le
    provider Naruto importe ce module, qui réimportait le provider Naruto.

    Il était **inatteignable** : on n'entre ici que par `scrapeDbscardsProducts`,
    dont l'unique appelant passe le `packId` d'un site `dbscards`. Naruto n'a pas
    d'entrée dans `sites.ts` et n'en aura pas — son scellé vient de trente
    sources moissonnées à la main, pas d'un catalogue de boutique. Son ingest
    est appelé par son propre CLI, comme il se doit.
  */
  const site = tcgCardsSiteForPack(packId);
  if (!site) return null;
  const dir = packStagingProductsDir(packId, site.stagingFolder);
  const listings = listingRows(readJson(path.join(dir, "listings.json")));
  const pages = productPages(readJson(path.join(dir, "products.json")));
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  /*
    Le module qui **possède** ce pack, s'il en est un. C'est lui qui sait où
    vivent ses logos de set ; le registre est chargé d'un bloc, donc tous les
    résolveurs sont là dès qu'un seul l'est.
  */
  const owner = providerModuleForPack(packId);
  const resolveSetLogo = owner?.resolveSetLogo;
  const resolveCatalogueSetId = owner?.resolveCatalogueSetId;

  const index: ProductsIndexV1 = emptyProductsIndex(packId);
  let skipped = 0;
  const source = listings.length
    ? listings
    : pages.map((page) => ({
        slug: page.slug,
        path: page.path,
        category: page.category,
        image: page.image,
      }));
  for (const listing of source) {
    const entry = sealedProductFromStaging({
      packId,
      listing,
      page: bySlug.get(listing.slug) ?? null,
      resolveSetLogo,
      resolveCatalogueSetId,
    });
    if (!entry) {
      skipped += 1;
      continue;
    }
    index.products[sealedProductKey(packId, entry.slug)] = entry;
  }

  index.products = mergeCuratedSealedContents(packId, index.products);

  const file = packProductsIndexPath(packId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return {
    pack: packId,
    written: Object.keys(index.products).length,
    skipped,
    file,
  };
}
