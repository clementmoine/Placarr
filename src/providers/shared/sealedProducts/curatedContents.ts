/**
 * Overlay curated — contenus scellés **vérifiés** SKU par SKU.
 *
 * L'ingest boutique laisse souvent `cardsPerPack` / listes vides (aperçu 15
 * tuiles, « Nombre de cartes » = taille du set). Ce ledger survit au re-ingest
 * et écrase uniquement les champs renseignés.
 *
 * Graine durable (git) : `src/providers/<id>/curated/products-contents.json`
 * → installée sous `data/<pack>/curated/products-contents.json` au refresh.
 * Legacy : `sealed-contents.json` (même schéma).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";

import { packDataDir } from "@/lib/packPaths";

import {
  profileToSkuPackComposition,
  readBoosterCompositionFile,
  resolveBoosterComposition,
  sealedSkuNeedsPackComposition,
  type BoosterCompositionProfile,
  type PackCompositionField,
} from "./boosterComposition";
import type {
  RandomPoolScope,
  SealedPrintLink,
  SealedProductEntry,
  SealedProductLink,
} from "./indexFormat";
import { sealedProductKey } from "./indexFormat";
import type { SealedKind } from "./kinds";

/** Une ligne de contenu garanti (playset + finish optionnel). */
export type CuratedGuaranteedPrint = {
  printKey: string;
  /** Copies dans le produit (défaut 1). */
  qty?: number;
  /**
   * Finish sur le **même** printKey (ex. `holo`) — pas un suffixe de clé.
   * Absent = non attesté.
   */
  finish?: string;
};

export type CuratedGuaranteedProduct = {
  slug: string;
  qty?: number;
};

export type CuratedSealedSku = {
  /** Preuve courte (URL ou « emballage Ravensburger »). */
  source: string;
  verifiedAt: string;
  notes?: string;
  cardsPerPack?: number | null;
  packsContained?: number | null;
  /**
   * Sachets par set catalogue (coffret multi-séries). Ex. `{ "s1": 1, "s2": 1 }`.
   */
  packsBySet?: Record<string, number> | null;
  /**
   * Sets catalogue où les garanties entrent au conseil d'achat (deck / promo).
   * Distinct de `packsBySet` (loterie).
   */
  guaranteeSets?: readonly string[] | null;
  /**
   * Code boutique / catalogue (`Q3`, `12`, …). Permet de rattacher un SKU
   * official-site ou lorcards sans setId (coffret quête FR) au set checklist.
   */
  setCode?: string | null;
  catalogueSetId?: string | null;
  /**
   * Taille totale du contenu fixe (ex. 120 = 2×60 decks quête), pour que le
   * conseil d'achat traite une liste partielle comme un plancher (`atLeast`).
   */
  declaredCardCount?: number | null;
  /**
   * printKeys toujours dans le produit (legacy). Préférer `guaranteedPrints`
   * quand qty / finish sont connus.
   */
  guaranteedPrintKeys?: readonly string[];
  /** Contenu garanti structuré (qty + finish). Gagne sur `guaranteedPrintKeys`. */
  guaranteedPrints?: readonly CuratedGuaranteedPrint[];
  /**
   * SKU scellés inclus (Pack Découverte → starters + boosters).
   * La checklist Catalogue les affiche en miniatures produit.
   */
  guaranteedProducts?: readonly CuratedGuaranteedProduct[];
  /**
   * Unités taille connue sans liste (Gateway decks + reward packs, 2p starter).
   */
  structureUnits?: readonly {
    label: string;
    count: number;
    cardsEach: number;
  }[];
  randomPoolScope?: RandomPoolScope;
  randomPoolPrintKeys?: readonly string[];
  /**
   * Composition sachet de **ce** SKU. `"none"` / objet écrasent ; `null` dans
   * le patch = pas d'avis (ne pas effacer une graine byKind).
   */
  packComposition?: PackCompositionField;
  /** Quand le produit est un starter + booster, etc. */
  behavior?: SealedProductEntry["behavior"];
  contentsKnown?: boolean;
  containsPrintsIsPreview?: boolean;
};

export type CuratedSealedContentsFile = {
  version: 1;
  pack: string;
  updatedAt: string;
  /**
   * Règles par `kind` appliquées si le SKU n'a pas d'entrée dédiée.
   * Ex. tous les boosters Lorcana → 12 cartes (attestation éditeur).
   */
  byKind?: Partial<
    Record<
      SealedProductEntry["kind"],
      Omit<
        CuratedSealedSku,
        | "guaranteedPrintKeys"
        | "guaranteedPrints"
        | "guaranteedProducts"
        | "randomPoolPrintKeys"
      >
    >
  >;
  skus: Record<string, CuratedSealedSku>;
};

export function curatedProductsContentsPath(packId: string): string {
  return path.join(packDataDir(packId), "curated", "products-contents.json");
}

/** @deprecated Prefer {@link curatedProductsContentsPath}. */
export function curatedSealedContentsPath(packId: string): string {
  return path.join(packDataDir(packId), "curated", "sealed-contents.json");
}

/**
 * Copie la graine provider → `data/<pack>/curated/products-contents.json`
 * (+ miroir legacy `sealed-contents.json` pour les chemins encore branchés).
 */
export function installProviderProductsContents(
  packId: string,
  sourceFile: string,
): boolean {
  if (!existsSync(sourceFile)) return false;
  const destDir = path.join(packDataDir(packId), "curated");
  mkdirSync(destDir, { recursive: true });
  const primary = curatedProductsContentsPath(packId);
  copyFileSync(sourceFile, primary);
  copyFileSync(sourceFile, curatedSealedContentsPath(packId));
  return true;
}

export function readCuratedSealedContents(
  packId: string,
): CuratedSealedContentsFile | null {
  const candidates = [
    curatedProductsContentsPath(packId),
    curatedSealedContentsPath(packId),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(
        readFileSync(file, "utf8"),
      ) as CuratedSealedContentsFile;
      if (parsed?.version !== 1 || typeof parsed.skus !== "object") continue;
      return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

function linksFromKeys(
  keys: readonly string[] | undefined,
): SealedPrintLink[] | null {
  // Empty `[]` must not wipe ingest lists (legacy stubs used to do that).
  if (keys == null || keys.length === 0) return null;
  return keys.map((printKey) => ({
    name: printKey,
    slug: printKey,
    ref: null,
    printKey,
  }));
}

function linksFromGuaranteed(
  rows: readonly CuratedGuaranteedPrint[] | undefined,
): SealedPrintLink[] | null {
  if (!rows?.length) return null;
  return rows.map((row) => ({
    name: row.printKey,
    slug: row.printKey,
    ref: null,
    printKey: row.printKey,
    ...(row.qty != null && row.qty > 0 ? { qty: row.qty } : {}),
    ...(row.finish?.trim() ? { finish: row.finish.trim() } : {}),
  }));
}

function productLinksFromCurated(
  rows: readonly CuratedGuaranteedProduct[] | undefined,
): SealedProductLink[] | null {
  if (!rows?.length) return null;
  return rows
    .map((row) => {
      const slug = row.slug?.trim();
      if (!slug) return null;
      return {
        slug,
        ...(row.qty != null && row.qty > 0 ? { qty: Math.floor(row.qty) } : {}),
      };
    })
    .filter((row): row is SealedProductLink => row != null);
}

function applyPatch(
  entry: SealedProductEntry,
  patch: CuratedSealedSku,
): SealedProductEntry {
  const guaranteed =
    linksFromGuaranteed(patch.guaranteedPrints) ??
    linksFromKeys(patch.guaranteedPrintKeys);
  const pool = linksFromKeys(patch.randomPoolPrintKeys);
  const products = productLinksFromCurated(patch.guaranteedProducts);
  const hasProductBundle = Boolean(
    (products && products.length > 0) ||
      (!products && entry.guaranteedProducts?.length),
  );
  const hasPrintInventory = Boolean(
    (guaranteed && guaranteed.length > 0) ||
      (!guaranteed && entry.guaranteedPrints?.length),
  );
  const inventoryKnown = hasProductBundle || hasPrintInventory;
  return {
    ...entry,
    /*
      `null` dans un SKU curated = « pas d'avis », pas « effacer le byKind ».
      Sinon les troves Hyperia (`cardsPerPack: null`) écrasaient byKind ×12 et
      le display set 14 (sans booster frère) restait à packSize inconnu →
      newCards 0 → masqué du conseil d'achat.
    */
    cardsPerPack:
      patch.cardsPerPack !== undefined && patch.cardsPerPack !== null
        ? patch.cardsPerPack
        : entry.cardsPerPack,
    packsContained:
      patch.packsContained !== undefined && patch.packsContained !== null
        ? patch.packsContained
        : entry.packsContained,
    packsBySet:
      patch.packsBySet !== undefined ? patch.packsBySet : entry.packsBySet,
    guaranteeSets:
      patch.guaranteeSets !== undefined
        ? patch.guaranteeSets
          ? [...patch.guaranteeSets]
          : null
        : entry.guaranteeSets,
    setCode:
      patch.setCode !== undefined
        ? patch.setCode?.trim() || null
        : entry.setCode,
    catalogueSetId:
      patch.catalogueSetId !== undefined
        ? patch.catalogueSetId?.trim() || null
        : entry.catalogueSetId,
    declaredCardCount:
      patch.declaredCardCount !== undefined
        ? patch.declaredCardCount
        : entry.declaredCardCount,
    guaranteedPrints: guaranteed ?? entry.guaranteedPrints,
    guaranteedProducts: products ?? entry.guaranteedProducts,
    structureUnits:
      patch.structureUnits !== undefined
        ? patch.structureUnits
            .filter(
              (row) =>
                row.label.trim() &&
                row.count > 0 &&
                row.cardsEach > 0,
            )
            .map((row) => ({
              label: row.label.trim(),
              count: Math.floor(row.count),
              cardsEach: Math.floor(row.cardsEach),
            }))
        : entry.structureUnits,
    randomPoolPrints: pool ?? entry.randomPoolPrints,
    randomPoolScope: patch.randomPoolScope ?? entry.randomPoolScope,
    packComposition:
      patch.packComposition !== undefined && patch.packComposition !== null
        ? patch.packComposition
        : entry.packComposition,
    behavior: patch.behavior ?? entry.behavior,
    // Explicit curated flag wins — partial exclusives (S5 posters) keep
    // contentsKnown=false even with guaranteedPrints filled.
    contentsKnown:
      patch.contentsKnown !== undefined
        ? patch.contentsKnown
        : inventoryKnown
          ? true
          : entry.contentsKnown,
    containsPrintsIsPreview:
      patch.containsPrintsIsPreview !== undefined
        ? patch.containsPrintsIsPreview
        : inventoryKnown
          ? false
          : entry.containsPrintsIsPreview,
  };
}

function curatedHasInventory(patch: CuratedSealedSku): boolean {
  return Boolean(
    (patch.guaranteedPrintKeys && patch.guaranteedPrintKeys.length > 0) ||
      (patch.guaranteedPrints && patch.guaranteedPrints.length > 0) ||
      (patch.guaranteedProducts && patch.guaranteedProducts.length > 0),
  );
}

/**
 * Kind from slug shape. Prefer infix match — dbsjcc dual decks are
 * `part4-starter-forces-du-mal`, not `starter-…`.
 */
export function guessSealedKindFromSlug(slug: string): SealedKind {
  const s = slug.trim().toLowerCase();
  if (s.startsWith("pack-decouverte") || s.includes("deck-bundle")) {
    return "deck_bundle";
  }
  if (/(^|-)booster(-box|-display)?(-|$)/.test(s) || s.startsWith("booster")) {
    if (s.includes("-box") || s.includes("display")) return "display";
    return "booster";
  }
  if (s.startsWith("tin") || /(^|-)tin(-|$)/.test(s)) return "tin";
  if (
    /(^|-)starter(-|$)/.test(s) ||
    /(^|-)deck(-|$)/.test(s) ||
    s.startsWith("deck") ||
    s.startsWith("starter")
  ) {
    return "deck";
  }
  return "coffret";
}

/** `part4-starter-forces-du-mal` → `part4`; `ss5-starter` → `ss5`. */
export function guessSealedSetCodeFromSlug(slug: string): string | null {
  const m = /^(part\d+|ss\d+|tinbox|sp|promo|accessory)(?:-|$)/i.exec(
    slug.trim(),
  );
  return m ? m[1]!.toLowerCase() : null;
}

/** Minimal row so curated can mint a SKU the boutique index dropped. */
function stubSealedEntry(_packId: string, slug: string): SealedProductEntry {
  const kind = guessSealedKindFromSlug(slug);
  const setCode = guessSealedSetCodeFromSlug(slug);
  return {
    slug,
    path: `curated/${slug}`,
    kind,
    behavior: kind === "booster" ? "random_pack" : "known_bundle",
    category:
      kind === "booster"
        ? "boosters"
        : kind === "deck"
          ? "starter-deck"
          : kind === "display"
            ? "booster-box"
            : "decks",
    name: null,
    image: null,
    imageBack: null,
    setLogo: null,
    setCode,
    catalogueSetId: setCode,
    lang: null,
    releaseDate: null,
    priceCents: null,
    cardsPerPack: null,
    packsContained: null,
    declaredCardCount: null,
    setCardCount: null,
    randomPoolScope: "none",
    randomPoolPrints: [],
    contentsKnown: false,
    containsPrintsIsPreview: true,
    guaranteedPrints: [],
    prints: [],
  };
}

/**
 * Applique un profil graine sur un SKU encore `null`.
 * Ne touche pas `"none"` / objet déjà présent ; ignore les containers.
 */
export function seedPackCompositionFromProfile(
  entry: SealedProductEntry,
  profile: BoosterCompositionProfile,
): SealedProductEntry {
  if (entry.packComposition != null) return entry;
  if (!sealedSkuNeedsPackComposition(entry)) return entry;
  if (entry.behavior === "pack_container") return entry;
  /*
    mixed_bundle opaque : N sachets sans set unique (gift box) ou déjà un
    packsBySet multi-séries — ne pas coller la grille d'un booster de set.
    Starter ×1 sachet du catalogueSetId : OK (bySet vide, packsContained ≤ 1).
  */
  if (entry.behavior === "mixed_bundle") {
    const bySetKeys = entry.packsBySet
      ? Object.keys(entry.packsBySet).length
      : 0;
    if (bySetKeys >= 2) return entry;
    if (bySetKeys === 0 && (entry.packsContained ?? 0) > 1) return entry;
  }
  if (!(profile.slots && profile.slots.length > 0)) return entry;
  return {
    ...entry,
    packComposition: profileToSkuPackComposition(profile),
  };
}

/**
 * Graine `data/…/booster-composition.json` → objet SKU si encore `null`.
 */
export function seedPackCompositionFromFile(
  entry: SealedProductEntry,
  packId: string,
): SealedProductEntry {
  if (entry.packComposition != null) return entry;
  const file = readBoosterCompositionFile(packId);
  if (!file) return entry;
  const setId = entry.catalogueSetId ?? entry.setCode;
  return seedPackCompositionFromProfile(
    entry,
    resolveBoosterComposition(file, setId),
  );
}

/**
 * Applique le ledger curated sur un index déjà projeté depuis la boutique.
 * SKU dédié gagne sur `byKind`.
 *
 * SKUs curated with a known inventory that are **absent** from the index are
 * minted (sqlite sometimes drops FR Naruto starters while curated still lists
 * them) — otherwise checklist / buy advice cannot attach deck cards.
 *
 * Ensuite : graine composition depuis `booster-composition.json` si le SKU
 * loterie n'a toujours pas de `packComposition`.
 */
export function mergeCuratedSealedContents(
  packId: string,
  products: Record<string, SealedProductEntry>,
): Record<string, SealedProductEntry> {
  const curated = readCuratedSealedContents(packId);
  const out: Record<string, SealedProductEntry> = {};
  const seenSlugs = new Set<string>();
  for (const [key, entry] of Object.entries(products)) {
    let next = entry;
    if (curated) {
      const bySku = curated.skus[entry.slug];
      const byKind = curated.byKind?.[entry.kind];
      if (byKind) next = applyPatch(next, byKind);
      if (bySku) next = applyPatch(next, bySku);
    }
    out[key] = seedPackCompositionFromFile(next, packId);
    seenSlugs.add(entry.slug);
  }
  if (curated) {
    for (const [slug, patch] of Object.entries(curated.skus)) {
      if (seenSlugs.has(slug)) continue;
      if (!curatedHasInventory(patch)) continue;
      const key = sealedProductKey(packId, slug);
      out[key] = seedPackCompositionFromFile(
        applyPatch(stubSealedEntry(packId, slug), patch),
        packId,
      );
    }
  }
  return out;
}
