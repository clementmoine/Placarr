/**
 * DBS CG research digs + curated Bandai product pages → openable citations.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseSealedSkuKey } from "@/core/collect/sealedOpen";
import { sanitizePublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import type { MetadataFact } from "@/types/metadataProvider";

import { DBS_CG_PACK_ID } from "../indexStore";

type DigSource = { id?: string; url?: string };

type DigFile = {
  kind?: string;
  sources?: readonly DigSource[];
};

type ProductsContentsFile = {
  skus?: Record<string, { source?: string }>;
};

let digCache: DigFile | null | undefined;
let sealedFromProducts: Map<string, { label: string; url: string }> | null =
  undefined;

export function resetDbsCgDigCitationCaches(): void {
  digCache = undefined;
  sealedFromProducts = undefined;
}

function curatedDir(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "dragonball",
    "dbscg",
    "curated",
  );
}

function digPath(): string {
  return path.join(curatedDir(), "sources", "sd08-pieces-hunt-2026-09-13.json");
}

function productsContentsPath(): string {
  return path.join(curatedDir(), "products-contents.json");
}

function loadDig(): DigFile | null {
  if (digCache !== undefined) return digCache;
  try {
    if (!existsSync(digPath())) {
      digCache = null;
      return null;
    }
    const raw = JSON.parse(readFileSync(digPath(), "utf8")) as DigFile;
    digCache = raw?.kind === "research-dig" ? raw : null;
  } catch {
    digCache = null;
  }
  return digCache;
}

function digSourceUrl(id: string): string | null {
  const dig = loadDig();
  const row = dig?.sources?.find((entry) => entry.id === id);
  return sanitizePublicCitationUrl(row?.url);
}

function firstHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/[^\s)\]>"']+/i);
  return match?.[0] ? sanitizePublicCitationUrl(match[0]) : null;
}

function isBandaiProductCitation(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)dbs-cardgame\.com$/i.test(parsed.hostname)) return false;
    return /\/product\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function loadSealedFromProducts(): Map<string, { label: string; url: string }> {
  if (sealedFromProducts) return sealedFromProducts;
  const map = new Map<string, { label: string; url: string }>();
  try {
    if (!existsSync(productsContentsPath())) {
      sealedFromProducts = map;
      return map;
    }
    const raw = JSON.parse(
      readFileSync(productsContentsPath(), "utf8"),
    ) as ProductsContentsFile;
    for (const [slug, sku] of Object.entries(raw.skus ?? {})) {
      const url = firstHttpUrl(sku.source);
      if (!url || !isBandaiProductCitation(url)) continue;
      const code =
        slug.match(/^(sd\d+|es\d+|ts\d+|ge\d+|gc\d+|xd\d+)/i)?.[1]?.toUpperCase() ??
        slug;
      map.set(slug.trim().toLowerCase(), {
        label: `Canal — ${code} (dbs-cardgame.com)`,
        url,
      });
    }
  } catch {
    /* empty */
  }
  sealedFromProducts = map;
  return map;
}

/** Dig SD08 first, then any curated Bandai product page on the SKU. */
export function dbsCgSealedDistributionCitation(
  slug: string | null | undefined,
): { label: string; url: string } | null {
  const key = slug?.trim().toLowerCase() || "";
  if (!key) return null;

  if (key === "sd08-rising-broly") {
    const url =
      digSourceUrl("asia-product") ?? digSourceUrl("europe-product");
    if (url) {
      return {
        label: "Canal — Starter Deck 08 Rising Broly (dbs-cardgame.com)",
        url,
      };
    }
  }

  return loadSealedFromProducts().get(key) ?? null;
}

/** SD8-01…10 exclusives listed on the SD08 product dig. */
export function dbsCgSd08InsertCitationForPrintKey(
  printKey: string | null | undefined,
): { label: string; value: string; url: string } | null {
  const pk = printKey?.trim().toLowerCase() || "";
  if (!/^dbscg:sd8-\d{2}$/.test(pk)) return null;
  const url =
    digSourceUrl("asia-product") ?? digSourceUrl("europe-product");
  if (!url) return null;
  return {
    label: "Insert starter",
    value: "DBS CG Starter Deck 08 — Rising Broly",
    url,
  };
}

export function dbsCgDigPrintFacts(
  printKey: string,
  providerId: string,
): MetadataFact[] {
  const insert = dbsCgSd08InsertCitationForPrintKey(printKey);
  if (!insert) return [];
  return [
    {
      kind: "category",
      label: insert.label,
      value: insert.value,
      source: providerId,
      url: insert.url,
      confidence: 0.85,
      priority: 33,
    },
  ];
}

export function dbsCgSealedMetadataResult(
  skuKey: string,
  providerId: string,
): {
  title: string;
  imageUrl?: string;
  facts: MetadataFact[];
  externalIds: Record<string, string>;
} | null {
  const parsed = parseSealedSkuKey(skuKey);
  if (!parsed || parsed.packId !== DBS_CG_PACK_ID) return null;
  const citation = dbsCgSealedDistributionCitation(parsed.slug);
  if (!citation) return null;

  /*
    Lazy: sealedProductsLoad can cycle through the provider registry while
    modules are still initializing.
  */
  const { loadSealedProductEntries } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/lib/collect/sealedProductsLoad") as typeof import("@/lib/collect/sealedProductsLoad");
  const entry = loadSealedProductEntries(DBS_CG_PACK_ID).find(
    (row) => row.slug === parsed.slug,
  );
  const title = entry?.name?.trim();
  if (!title) return null;

  return {
    title,
    ...(entry?.image ? { imageUrl: entry.image } : {}),
    facts: [
      {
        kind: "category",
        label: "Distribution",
        value: citation.label,
        source: providerId,
        url: citation.url,
        confidence: 0.85,
        priority: 34,
      },
    ],
    externalIds: {
      [providerId]: skuKey,
      skuKey,
    },
  };
}
