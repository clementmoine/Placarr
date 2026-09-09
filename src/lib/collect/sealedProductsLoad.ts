/**
 * Charge les produits scellés d'un dataPack pour le conseil d’achat et
 * « Inclus dans ».
 *
 * Une seule lecture de `products-index.json` + merge curated ; deux projections
 * ({@link BuyProduct} vs {@link ContainmentProduct}) pour ne pas mélanger
 * garanties-only (buyAdvice) et pool set (fiche carte).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  withContainerPackSizes,
  type BuyProduct,
  type ProductBehavior,
} from "@/core/collect/buyAdvice";
import { resolveSealedContents } from "@/core/collect/sealedContents";
import type {
  ContainmentProduct,
} from "@/core/collect/sealedContainment";
import { mergeCuratedSealedContents } from "@/providers/shared/sealedProducts/curatedContents";
import type {
  RandomPoolScope,
  SealedProductEntry,
  SealedPrintLink,
} from "@/providers/shared/sealedProducts/indexFormat";
import {
  isSealedKind,
  sealedBehaviorForKind,
  withRefinedSealedKind,
} from "@/providers/shared/sealedProducts/kinds";
import { resolveSealedLang } from "@/providers/shared/sealedProducts/lang";
import { dataRoot } from "@/lib/runtimeData";

function printLinks(links: unknown): SealedPrintLink[] {
  if (!Array.isArray(links)) return [];
  return links.map((link) => {
    const row = link as Record<string, unknown>;
    const printKey = (row.printKey as string | null) ?? null;
    const qty =
      typeof row.qty === "number" && row.qty > 0 ? row.qty : undefined;
    const finish =
      typeof row.finish === "string" && row.finish.trim()
        ? row.finish.trim()
        : undefined;
    return {
      name: String(row.name ?? row.printKey ?? ""),
      slug: String(row.slug ?? row.printKey ?? ""),
      ref: (row.ref as string | null) ?? null,
      printKey,
      ...(qty != null ? { qty } : {}),
      ...(finish ? { finish } : {}),
    };
  });
}

function printKeys(links: readonly SealedPrintLink[]): string[] {
  return links
    .map((row) => row.printKey)
    .filter((key): key is string => Boolean(key));
}

function packsBySetFromRow(
  value: unknown,
): Record<string, number> | null | undefined {
  if (value == null) return value as null | undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [setId, packs] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const key = setId.trim();
    if (!key) continue;
    if (typeof packs === "number" && packs > 0 && Number.isFinite(packs)) {
      out[key] = packs;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function guaranteeSetsFromRow(
  value: unknown,
): string[] | null | undefined {
  if (value == null) return value as null | undefined;
  if (!Array.isArray(value)) return null;
  const out = value
    .map((row) => (typeof row === "string" ? row.trim() : ""))
    .filter(Boolean);
  return out.length > 0 ? out : null;
}

function sealedEntryRank(
  key: string,
  entry: Pick<SealedProductEntry, "image" | "contentsKnown" | "guaranteedPrints">,
): number {
  let score = 0;
  /*
    Après merge EN→Carddass, l'index peut garder `naruto/en-ccg::display-s24`
    **et** `naruto/carddass::display-s24` (même slug). Le conseil d'achat
    listait alors deux fois le display — clé React dupliquée.
  */
  if (key.includes("/carddass::")) score += 100;
  if (key.includes("/en-ccg::")) score -= 50;
  if (entry.image) score += 10;
  if (entry.contentsKnown) score += 5;
  if ((entry.guaranteedPrints?.length ?? 0) > 0) score += 3;
  return score;
}

/** Une entrée par slug — garde la plus informative / canonique. */
export function dedupeSealedEntriesBySlug(
  entries: Readonly<Record<string, SealedProductEntry>>,
): SealedProductEntry[] {
  const best = new Map<
    string,
    { key: string; entry: SealedProductEntry; rank: number }
  >();
  for (const [key, entry] of Object.entries(entries)) {
    const slug = entry.slug.trim();
    if (!slug) continue;
    const rank = sealedEntryRank(key, entry);
    const prev = best.get(slug);
    if (!prev || rank > prev.rank) best.set(slug, { key, entry, rank });
  }
  return [...best.values()].map((row) => row.entry);
}

/** Entrées mergées (index + curated sealed-contents). */
export function loadSealedProductEntries(
  pack: string | null | undefined,
): SealedProductEntry[] {
  if (!pack) return [];
  const file = path.join(dataRoot(), ...pack.split("/"), "products-index.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      products?: Record<string, Record<string, unknown>>;
    };
    const raw = parsed.products ?? {};
    const entries: Record<string, SealedProductEntry> = {};
    for (const [key, row] of Object.entries(raw)) {
      const slug = String(row.slug ?? "");
      const rawName = String(row.name ?? "").trim();
      const declaredCardCount = (row.declaredCardCount as number | null) ?? null;
      const rawKind = String(row.kind ?? "booster");
      const kind = isSealedKind(rawKind) ? rawKind : "coffret";
      const contents = resolveSealedContents({
        kind,
        name: rawName || null,
        slug,
        declaredCardCount,
      });
      entries[key] = withRefinedSealedKind({
        slug,
        path: String(row.path ?? ""),
        kind,
        behavior: sealedBehaviorForKind(kind),
        category: String(row.category ?? ""),
        name: rawName || null,
        image: (row.image as string | null) ?? null,
        imageBack: (row.imageBack as string | null) ?? null,
        setLogo: (row.setLogo as string | null) ?? null,
        setCode: (row.setCode as string | null) ?? null,
        catalogueSetId: (row.catalogueSetId as string | null) ?? null,
        lang: resolveSealedLang({
          lang: (row.lang as string | null) ?? null,
          slug,
        }),
        releaseDate: (row.releaseDate as string | null) ?? null,
        priceCents:
          typeof row.priceCents === "number" && row.priceCents > 0
            ? row.priceCents
            : null,
        cardsPerPack:
          typeof row.cardsPerPack === "number" && row.cardsPerPack > 0
            ? row.cardsPerPack
            : contents.cardsPerPack,
        packsContained:
          typeof row.packsContained === "number" && row.packsContained > 0
            ? row.packsContained
            : contents.packsContained,
        packsBySet: packsBySetFromRow(row.packsBySet),
        guaranteeSets: guaranteeSetsFromRow(row.guaranteeSets),
        guaranteedPrints: printLinks(row.guaranteedPrints),
        randomPoolScope: (row.randomPoolScope as RandomPoolScope) ?? "unknown",
        randomPoolPrints: printLinks(row.randomPoolPrints),
        declaredCardCount,
        setCardCount: (row.setCardCount as number | null) ?? null,
        contentsKnown: Boolean(row.contentsKnown),
        containsPrintsIsPreview: Boolean(row.containsPrintsIsPreview),
        prints: printLinks(row.prints),
      });
    }
    return dedupeSealedEntriesBySlug(
      mergeCuratedSealedContents(pack, entries),
    );
  } catch {
    return [];
  }
}

export function toBuyProduct(entry: SealedProductEntry): BuyProduct {
  const guaranteed = printKeys(entry.guaranteedPrints);
  const preview = printKeys(entry.prints);
  const known = guaranteed.length > 0;
  const randomPoolScope = entry.randomPoolScope ?? "unknown";
  const randomPoolPrints = printKeys(entry.randomPoolPrints);
  return {
    slug: entry.slug,
    name: (entry.name ?? "").trim() || entry.slug.replace(/-/g, " "),
    kind: entry.kind,
    behavior: entry.behavior as ProductBehavior,
    setId: entry.catalogueSetId ?? entry.setCode,
    prints: known ? guaranteed : preview,
    printsArePreview: known ? false : entry.containsPrintsIsPreview,
    cardCount: entry.declaredCardCount,
    packSize: entry.cardsPerPack,
    packsInContainer: entry.packsContained,
    packsBySet: entry.packsBySet ?? null,
    guaranteeSets: entry.guaranteeSets ?? null,
    priceCents: entry.priceCents,
    imageUrl: entry.image,
    language: entry.lang,
    contentsKnown: entry.contentsKnown,
    randomPoolScope,
    randomPoolPrints:
      randomPoolScope === "listed" && randomPoolPrints.length > 0
        ? randomPoolPrints
        : null,
  };
}

export function toContainmentProduct(
  entry: SealedProductEntry,
): ContainmentProduct {
  const guaranteed = printKeys(entry.guaranteedPrints);
  return {
    slug: entry.slug,
    name: (entry.name ?? "").trim() || entry.slug.replace(/-/g, " "),
    kind: entry.kind,
    behavior: entry.behavior as ContainmentProduct["behavior"],
    setId: entry.catalogueSetId ?? entry.setCode,
    imageUrl: entry.image,
    language: entry.lang,
    guaranteedPrints: guaranteed,
    packsBySet: entry.packsBySet ?? null,
    printsArePreview:
      guaranteed.length > 0 ? false : entry.containsPrintsIsPreview,
    randomPoolScope: entry.randomPoolScope ?? "unknown",
    randomPoolPrints: printKeys(entry.randomPoolPrints),
  };
}

/** Projection buyAdvice (garanties / preview comme avant). */
export function loadBuyProducts(
  pack: string | null | undefined,
): BuyProduct[] {
  return withContainerPackSizes(
    loadSealedProductEntries(pack).map(toBuyProduct),
  );
}

/** Projection « Inclus dans » (garanties + pools). */
export function loadContainmentProducts(
  pack: string | null | undefined,
): ContainmentProduct[] {
  return loadSealedProductEntries(pack).map(toContainmentProduct);
}
