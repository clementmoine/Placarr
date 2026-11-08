/**
 * Bleach SCB curated proofs → openable citations (carddass.fr S1 starters).
 * Never invents hubs — only Wayback deep links already staged under curated/.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  sanitizePublicCitationUrl,
  waybackPublicCitationUrl,
} from "@/core/enrich/citations/publicCitationUrl";
import type { LocalPrintSearchRow } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import type { MetadataFact } from "@/types/metadataProvider";

import { bleachScbCuratedDir } from "../pack";

type CdxRow = {
  timestamp?: string;
  original?: string;
};

type ProductsContentsFile = {
  skus?: Record<
    string,
    {
      guaranteedPrintKeys?: readonly string[];
      notes?: string;
    }
  >;
};

const S1_CATALOGUE_ORIGINAL =
  "http://www.carddass.fr/bleach/catalogue_S1_Bleach.html";

const SEALED_SLUG_LABELS: Record<string, string> = {
  "starter-compagnons": 'Canal — Starter "Compagnons" (carddass.fr S1)',
  "starter-rivaux": 'Canal — Starter "Rivaux" (carddass.fr S1)',
  "booster-s1-shinigami-and-ichigo":
    "Canal — Booster S1 Shinigami & Ichigo (carddass.fr)",
  "display-s1-shinigami-and-ichigo":
    "Canal — Display S1 Shinigami & Ichigo (carddass.fr)",
};

let s1CatalogueUrlCache: string | null | undefined;
let insertByPrintKeyCache: Map<string, { label: string; value: string }> | null =
  undefined;

export function resetBleachScbDigCitationCaches(): void {
  s1CatalogueUrlCache = undefined;
  insertByPrintKeyCache = undefined;
}

function cdxPath(): string {
  return path.join(
    bleachScbCuratedDir(),
    "sources",
    "wayback",
    "carddass_fr_bleach_.json",
  );
}

function productsContentsPath(): string {
  return path.join(bleachScbCuratedDir(), "products-contents.json");
}

/** Official S1 catalogue via Wayback CDX row (deep page, not hub). */
export function bleachScbS1CatalogueCitationUrl(): string | null {
  if (s1CatalogueUrlCache !== undefined) return s1CatalogueUrlCache;
  try {
    if (!existsSync(cdxPath())) {
      s1CatalogueUrlCache = null;
      return null;
    }
    const rows = JSON.parse(readFileSync(cdxPath(), "utf8")) as CdxRow[];
    const hit = rows.find(
      (row) =>
        typeof row.original === "string" &&
        row.original.replace(/:80\b/, "") === S1_CATALOGUE_ORIGINAL &&
        typeof row.timestamp === "string",
    );
    if (!hit?.timestamp || !hit.original) {
      s1CatalogueUrlCache = null;
      return null;
    }
    const built = waybackPublicCitationUrl(hit.timestamp, S1_CATALOGUE_ORIGINAL);
    s1CatalogueUrlCache = sanitizePublicCitationUrl(built);
  } catch {
    s1CatalogueUrlCache = null;
  }
  return s1CatalogueUrlCache;
}

export function bleachScbSealedDistributionCitation(
  slug: string | null | undefined,
): { label: string; url: string } | null {
  const key = slug?.trim().toLowerCase() || "";
  const label = SEALED_SLUG_LABELS[key];
  if (!label) return null;
  const url = bleachScbS1CatalogueCitationUrl();
  if (!url) return null;
  return { label, url };
}

function loadInsertByPrintKey(): Map<
  string,
  { label: string; value: string }
> {
  if (insertByPrintKeyCache) return insertByPrintKeyCache;
  const map = new Map<string, { label: string; value: string }>();
  try {
    if (!existsSync(productsContentsPath())) {
      insertByPrintKeyCache = map;
      return map;
    }
    const raw = JSON.parse(
      readFileSync(productsContentsPath(), "utf8"),
    ) as ProductsContentsFile;
    const starters: Array<{ slug: string; value: string }> = [
      {
        slug: "starter-compagnons",
        value: 'Bleach SCB Starter "Compagnons" (FR S1)',
      },
      {
        slug: "starter-rivaux",
        value: 'Bleach SCB Starter "Rivaux" (FR S1)',
      },
    ];
    for (const starter of starters) {
      const keys = raw.skus?.[starter.slug]?.guaranteedPrintKeys ?? [];
      for (const printKey of keys) {
        const pk = printKey.trim().toLowerCase();
        if (!pk || map.has(pk)) continue;
        map.set(pk, { label: "Insert starter", value: starter.value });
      }
    }
  } catch {
    /* empty map */
  }
  insertByPrintKeyCache = map;
  return map;
}

export function bleachScbPrintFacts(
  row: LocalPrintSearchRow,
  providerId: string,
): MetadataFact[] {
  const url = bleachScbS1CatalogueCitationUrl();
  if (!url) return [];
  const insert = loadInsertByPrintKey().get(row.printKey.trim().toLowerCase());
  if (!insert) return [];
  return [
    {
      kind: "category",
      label: insert.label,
      value: insert.value,
      source: providerId,
      url,
      confidence: 0.85,
      priority: 33,
    },
  ];
}
