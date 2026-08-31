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

import type {
  RandomPoolScope,
  SealedPrintLink,
  SealedProductEntry,
} from "./indexFormat";

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
  randomPoolScope?: RandomPoolScope;
  randomPoolPrintKeys?: readonly string[];
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
        "guaranteedPrintKeys" | "guaranteedPrints" | "randomPoolPrintKeys"
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
  if (!keys) return null;
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

function applyPatch(
  entry: SealedProductEntry,
  patch: CuratedSealedSku,
): SealedProductEntry {
  const guaranteed =
    linksFromGuaranteed(patch.guaranteedPrints) ??
    linksFromKeys(patch.guaranteedPrintKeys);
  const pool = linksFromKeys(patch.randomPoolPrintKeys);
  return {
    ...entry,
    cardsPerPack:
      patch.cardsPerPack !== undefined ? patch.cardsPerPack : entry.cardsPerPack,
    packsContained:
      patch.packsContained !== undefined
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
    declaredCardCount:
      patch.declaredCardCount !== undefined
        ? patch.declaredCardCount
        : entry.declaredCardCount,
    guaranteedPrints: guaranteed ?? entry.guaranteedPrints,
    randomPoolPrints: pool ?? entry.randomPoolPrints,
    randomPoolScope: patch.randomPoolScope ?? entry.randomPoolScope,
    behavior: patch.behavior ?? entry.behavior,
    contentsKnown:
      patch.contentsKnown !== undefined
        ? patch.contentsKnown
        : guaranteed && guaranteed.length > 0
          ? true
          : entry.contentsKnown,
    containsPrintsIsPreview:
      patch.containsPrintsIsPreview !== undefined
        ? patch.containsPrintsIsPreview
        : guaranteed && guaranteed.length > 0
          ? false
          : entry.containsPrintsIsPreview,
  };
}

/**
 * Applique le ledger curated sur un index déjà projeté depuis la boutique.
 * SKU dédié gagne sur `byKind`.
 */
export function mergeCuratedSealedContents(
  packId: string,
  products: Record<string, SealedProductEntry>,
): Record<string, SealedProductEntry> {
  const curated = readCuratedSealedContents(packId);
  if (!curated) return products;
  const out: Record<string, SealedProductEntry> = {};
  for (const [key, entry] of Object.entries(products)) {
    const bySku = curated.skus[entry.slug];
    const byKind = curated.byKind?.[entry.kind];
    let next = entry;
    if (byKind) next = applyPatch(next, byKind);
    if (bySku) next = applyPatch(next, bySku);
    out[key] = next;
  }
  return out;
}
