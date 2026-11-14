/**
 * Mint sealed SKUs from orphan `products/{slug}/{lang}/art.*` dirs that never
 * landed in products-index (harvest wrote bytes, covering/rebuild dropped the row).
 *
 * Numbered collision dumps (`*-2`, `*-3`) are skipped when the canonical slug
 * folder exists — they are alternate harvest paths, not distinct retail SKUs.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { assetsSealedProductRoleUrl } from "@/lib/packAssetUrls";
import { packSealedProductsDir } from "@/lib/packPaths";
import { resolveSealedContents } from "@/core/collect/sealedContents";

import { resolveContentLayers } from "./contentLayers";
import {
  sealedProductKey,
  type ProductsIndexV1,
  type SealedProductEntry,
} from "./indexFormat";
import {
  isSealedKind,
  sealedBehaviorForKind,
  sealedContentsKnown,
  sealedKindIsOpaqueContents,
  type SealedKind,
} from "./kinds";

const LANG_SUFFIX_RE = /-(fr|en|de|it)$/i;
const NUMBERED_DUMP_RE = /-\d+$/;

/** Longest-first so `collector_box` wins over `box`. */
const KIND_SUFFIXES: ReadonlyArray<{ suffix: string; kind: SealedKind }> = [
  { suffix: "collector_box", kind: "collector_box" },
  { suffix: "blister_case", kind: "blister_case" },
  { suffix: "prerelease", kind: "prerelease" },
  { suffix: "booster", kind: "booster" },
  { suffix: "display", kind: "display" },
  { suffix: "trove", kind: "trove" },
  { suffix: "quest", kind: "quest" },
  { suffix: "coffret", kind: "coffret" },
  { suffix: "blister", kind: "blister" },
  { suffix: "deck", kind: "deck" },
  { suffix: "tin", kind: "tin" },
  { suffix: "etb", kind: "etb" },
  { suffix: "case", kind: "case" },
];

export type OrphanDiskProductHit = {
  slug: string;
  lang: string;
  kind: SealedKind;
  artFile: string;
};

export type PromoteOrphanDiskProductsOpts = {
  packId: string;
  index: ProductsIndexV1;
  productsDir?: string;
  /** Default `disk`. Official-site harvests typically pass `official-site`. */
  category?: string;
  /**
   * Optional display name. When omitted, falls back to sibling locale SKUs
   * then a humanized slug.
   */
  resolveName?: (hit: OrphanDiskProductHit) => string | null;
  resolveSetLogo?: (hit: OrphanDiskProductHit) => string | null;
  resolveCatalogueSetId?: (hit: OrphanDiskProductHit) => string | null;
  resolveSetCode?: (hit: OrphanDiskProductHit) => string | null;
  /**
   * Product keys the caller already dropped (playmats / accessories) — never
   * re-mint from leftover disk art.
   */
  skipKeys?: ReadonlySet<string>;
};

export type PromoteOrphanDiskProductsResult = {
  written: number;
  skippedNumbered: number;
  skippedExisting: number;
  skippedUnknownKind: number;
  keys: string[];
};

/** Strip locale / numbered dump suffixes before reading the kind token. */
export function sealedSlugKindStem(slug: string): string {
  let stem = slug.trim().toLowerCase();
  stem = stem.replace(LANG_SUFFIX_RE, "");
  stem = stem.replace(NUMBERED_DUMP_RE, "");
  return stem;
}

export function inferSealedKindFromProductSlug(
  slug: string,
): SealedKind | null {
  const stem = sealedSlugKindStem(slug);
  for (const row of KIND_SUFFIXES) {
    if (stem === row.suffix || stem.endsWith(`-${row.suffix}`)) {
      return row.kind;
    }
  }
  return null;
}

export function isNumberedSealedProductDumpSlug(slug: string): boolean {
  const trimmed = slug.trim().toLowerCase();
  if (!NUMBERED_DUMP_RE.test(trimmed)) return false;
  // `…-booster-2` yes; bare `set-3` (chapter id) no — needs a kind stem after strip.
  const stem = sealedSlugKindStem(trimmed);
  return inferSealedKindFromProductSlug(stem) != null;
}

function canonicalSlugForNumberedDump(slug: string): string | null {
  if (!isNumberedSealedProductDumpSlug(slug)) return null;
  return slug.trim().toLowerCase().replace(NUMBERED_DUMP_RE, "");
}

function listArtFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^art\./i.test(name) && /\.(png|webp|jpe?g)$/i.test(name))
    .sort();
}

function humanizeSlugName(slug: string, kind: SealedKind): string {
  const stem = sealedSlugKindStem(slug);
  const withoutKind =
    stem === kind || stem.endsWith(`-${kind}`)
      ? stem.slice(0, Math.max(0, stem.length - kind.length)).replace(/-$/, "")
      : stem;
  const base = withoutKind
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return base || slug;
}

function nameFromSiblingLocales(
  index: ProductsIndexV1,
  hit: OrphanDiskProductHit,
): string | null {
  const stem = sealedSlugKindStem(hit.slug);
  for (const entry of Object.values(index.products)) {
    if (sealedSlugKindStem(entry.slug) !== stem) continue;
    if (entry.kind !== hit.kind) continue;
    const name = entry.name?.trim();
    if (name) return name;
  }
  return null;
}

function listOrphanDiskHits(
  productsDir: string,
  index: ProductsIndexV1,
  packId: string,
  skipKeys?: ReadonlySet<string>,
): {
  hits: OrphanDiskProductHit[];
  skippedNumbered: number;
  skippedExisting: number;
  skippedUnknownKind: number;
} {
  let skippedNumbered = 0;
  let skippedExisting = 0;
  let skippedUnknownKind = 0;
  const hits: OrphanDiskProductHit[] = [];
  if (!existsSync(productsDir)) {
    return { hits, skippedNumbered, skippedExisting, skippedUnknownKind };
  }

  for (const slug of readdirSync(productsDir)) {
    if (slug === "sets" || slug.startsWith(".")) continue;
    const slugDir = path.join(productsDir, slug);
    let langEntries: string[];
    try {
      langEntries = readdirSync(slugDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }

    const numberedBase = canonicalSlugForNumberedDump(slug);
    if (numberedBase) {
      const baseDir = path.join(productsDir, numberedBase);
      if (existsSync(baseDir)) {
        skippedNumbered += langEntries.length;
        continue;
      }
    }

    for (const langRaw of langEntries) {
      const lang = langRaw.trim().toLowerCase();
      if (!/^[a-z]{2}$/.test(lang)) continue;
      const artFiles = listArtFiles(path.join(slugDir, lang));
      if (!artFiles.length) continue;

      const key = sealedProductKey(packId, slug);
      if (skipKeys?.has(key)) {
        skippedExisting += 1;
        continue;
      }
      if (index.products[key]) {
        skippedExisting += 1;
        continue;
      }

      const kind = inferSealedKindFromProductSlug(slug);
      if (!kind || !isSealedKind(kind)) {
        skippedUnknownKind += 1;
        continue;
      }

      hits.push({
        slug,
        lang,
        kind,
        artFile: artFiles[0]!,
      });
    }
  }

  return { hits, skippedNumbered, skippedExisting, skippedUnknownKind };
}

function mintOrphanEntry(
  packId: string,
  hit: OrphanDiskProductHit,
  opts: PromoteOrphanDiskProductsOpts,
): SealedProductEntry {
  const name =
    opts.resolveName?.(hit)?.trim() ||
    nameFromSiblingLocales(opts.index, hit) ||
    humanizeSlugName(hit.slug, hit.kind);
  const preview = sealedKindIsOpaqueContents(hit.kind);
  const contents = resolveSealedContents({
    kind: hit.kind,
    name,
    slug: hit.slug,
  });
  const behavior = sealedBehaviorForKind(hit.kind);
  const contentsKnown = sealedContentsKnown({
    kind: hit.kind,
    containsPrintsIsPreview: preview,
    printCount: 0,
  });
  const layers = resolveContentLayers({
    kind: hit.kind,
    behavior,
    prints: [],
    contentsKnown,
    containsPrintsIsPreview: preview,
  });

  return {
    slug: hit.slug,
    path: "",
    kind: hit.kind,
    behavior,
    category: opts.category ?? "disk",
    name,
    image: assetsSealedProductRoleUrl(packId, hit.slug, hit.lang, "face"),
    imageBack: null,
    setLogo: opts.resolveSetLogo?.(hit) ?? null,
    setCode: opts.resolveSetCode?.(hit) ?? null,
    catalogueSetId: opts.resolveCatalogueSetId?.(hit) ?? null,
    lang: hit.lang,
    releaseDate: null,
    priceCents: null,
    cardsPerPack: contents.cardsPerPack,
    packsContained: contents.packsContained,
    guaranteedPrints: layers.guaranteedPrints,
    randomPoolScope: layers.randomPoolScope,
    randomPoolPrints: layers.randomPoolPrints,
    declaredCardCount: null,
    setCardCount: null,
    contentsKnown,
    containsPrintsIsPreview: preview,
    prints: [],
  };
}

/**
 * Promote orphan on-disk packshots into `index.products` (mutates in place).
 */
export function promoteOrphanSealedProductsFromDisk(
  opts: PromoteOrphanDiskProductsOpts,
): PromoteOrphanDiskProductsResult {
  const packId = opts.packId;
  const productsDir = opts.productsDir ?? packSealedProductsDir(packId);
  const listed = listOrphanDiskHits(
    productsDir,
    opts.index,
    packId,
    opts.skipKeys,
  );
  const keys: string[] = [];

  for (const hit of listed.hits) {
    const key = sealedProductKey(packId, hit.slug);
    opts.index.products[key] = mintOrphanEntry(packId, hit, opts);
    keys.push(key);
  }

  return {
    written: keys.length,
    skippedNumbered: listed.skippedNumbered,
    skippedExisting: listed.skippedExisting,
    skippedUnknownKind: listed.skippedUnknownKind,
    keys,
  };
}
