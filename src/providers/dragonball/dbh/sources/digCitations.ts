/**
 * DBH research digs → openable citations (Namek starter, Fullahead sealed…).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { sanitizePublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import type { LocalPrintSearchRow } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import type { MetadataFact } from "@/types/metadataProvider";

import { dbhCuratedDir } from "../pack";

type DigSource = { id?: string; url?: string; finding?: string };

type NamekDigFile = {
  kind?: string;
  verdict?: { battleIds?: readonly string[] };
  sources?: readonly DigSource[];
};

type FullaheadWiredRow = {
  slugs?: readonly string[];
  productUrl?: string;
  packProductUrl?: string;
  title?: string;
};

type FullaheadDigFile = {
  source?: string;
  wired?: readonly FullaheadWiredRow[];
  stagingBoxArts?: readonly {
    productUrl?: string;
    art?: readonly string[];
    note?: string;
  }[];
};

/** Marketplace sealed digs (Toy-Let / Chitoro / Rapp / Amazon / eBay / Club). */
type MarketplaceSealedItem = {
  slugs?: readonly string[];
  slug?: string;
  /** carddass-club-matched stem → pack (+ optional -box). */
  stem?: string;
  productUrl?: string;
  page?: string;
  url?: string;
  title?: string;
};

type MarketplaceSealedDigFile = {
  source?: string;
  items?: readonly MarketplaceSealedItem[];
};

const MARKETPLACE_SEALED_DIG_FILES = [
  "toy-let-sealed-2026-09-20.json",
  "chitoroshop-sealed-2026-09-20.json",
  "rappcollect-sealed-2026-09-20.json",
  "amazon-packshots-2026-09-20.json",
  "ebay-packshots-2026-09-20.json",
  "carddass-club-2026-09-20.json",
  "carddass-club-matched-2026-09-20.json",
] as const;

let namekCache: NamekDigFile | null | undefined;
let fullaheadBySlug:
  | Map<string, { label: string; url: string }>
  | null
  | undefined;
let marketplaceBySlug:
  | Map<string, { label: string; url: string }>
  | null
  | undefined;

export function resetDbhDigCitationCaches(): void {
  namekCache = undefined;
  fullaheadBySlug = undefined;
  marketplaceBySlug = undefined;
}

function namekDigPath(): string {
  return path.join(
    dbhCuratedDir(),
    "sources",
    "namek-starter-ugmps-2026-09-13.json",
  );
}

function fullaheadDigPath(): string {
  return path.join(
    dbhCuratedDir(),
    "sources",
    "fullahead-sealed-2026-09-20.json",
  );
}

function loadNamekDig(): NamekDigFile | null {
  if (namekCache !== undefined) return namekCache;
  try {
    if (!existsSync(namekDigPath())) {
      namekCache = null;
      return null;
    }
    const raw = JSON.parse(readFileSync(namekDigPath(), "utf8")) as NamekDigFile;
    namekCache = raw?.kind === "research-dig" ? raw : null;
  } catch {
    namekCache = null;
  }
  return namekCache;
}

function digSourceUrl(id: string): string | null {
  const dig = loadNamekDig();
  const row = dig?.sources?.find((entry) => entry.id === id);
  return sanitizePublicCitationUrl(row?.url);
}

function slugFromFullaheadArt(art: string | undefined): string | null {
  if (!art) return null;
  const base = path.basename(art).replace(/\.[^.]+$/, "");
  return base.trim() || null;
}

function loadFullaheadBySlug(): Map<string, { label: string; url: string }> {
  if (fullaheadBySlug) return fullaheadBySlug;
  const map = new Map<string, { label: string; url: string }>();
  try {
    if (!existsSync(fullaheadDigPath())) {
      fullaheadBySlug = map;
      return map;
    }
    const raw = JSON.parse(
      readFileSync(fullaheadDigPath(), "utf8"),
    ) as FullaheadDigFile;

    for (const row of raw.wired ?? []) {
      const boxUrl = sanitizePublicCitationUrl(row.productUrl);
      const packUrl = sanitizePublicCitationUrl(row.packProductUrl);
      const title = row.title?.trim() || "Full Ahead";
      for (const slugRaw of row.slugs ?? []) {
        const slug = slugRaw.trim().toLowerCase();
        if (!slug || map.has(slug)) continue;
        const isBox = /-box$/i.test(slug);
        const url = isBox ? boxUrl ?? packUrl : packUrl ?? boxUrl;
        if (!url) continue;
        map.set(slug, {
          label: `Canal — ${title} (Full Ahead)`,
          url,
        });
      }
    }

    for (const row of raw.stagingBoxArts ?? []) {
      const url = sanitizePublicCitationUrl(row.productUrl);
      if (!url) continue;
      for (const art of row.art ?? []) {
        const slug = slugFromFullaheadArt(art)?.toLowerCase();
        if (!slug || map.has(slug)) continue;
        map.set(slug, {
          label: "Canal — Fullahead BOX (packshot dig)",
          url,
        });
      }
    }
  } catch {
    /* empty map */
  }
  fullaheadBySlug = map;
  return map;
}

function canalLabelForMarketplaceUrl(
  url: string,
  title: string | undefined,
): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (host.includes("toy-let")) return "Canal — Toy-Let";
    if (host.includes("chitoroshop")) return "Canal — Chitoro Shop";
    if (host.includes("rappcollect")) return "Canal — Rapp Collect";
    if (host.includes("amazon.")) {
      return title?.trim()
        ? `Canal — Amazon (${title.trim()})`
        : "Canal — Amazon";
    }
    if (host.includes("ebay.")) return "Canal — eBay (packshot attesté)";
    if (host.includes("carddass.com")) return "Canal — Carddass Club";
  } catch {
    /* fall through */
  }
  return title?.trim()
    ? `Canal — ${title.trim()}`
    : "Canal — marketplace DBH dig";
}

function loadMarketplaceBySlug(): Map<string, { label: string; url: string }> {
  if (marketplaceBySlug) return marketplaceBySlug;
  const map = new Map<string, { label: string; url: string }>();
  for (const file of MARKETPLACE_SEALED_DIG_FILES) {
    const digPath = path.join(dbhCuratedDir(), "sources", file);
    try {
      if (!existsSync(digPath)) continue;
      const raw = JSON.parse(
        readFileSync(digPath, "utf8"),
      ) as MarketplaceSealedDigFile;
      for (const item of raw.items ?? []) {
        const url = sanitizePublicCitationUrl(
          item.productUrl ?? item.page ?? item.url,
        );
        if (!url) continue;
        const stem = item.stem?.trim().toLowerCase() || "";
        const slugs = [
          ...(item.slugs ?? []),
          ...(item.slug ? [item.slug] : []),
          ...(stem ? [stem, `${stem}-box`] : []),
        ];
        for (const slugRaw of slugs) {
          const slug = slugRaw.trim().toLowerCase();
          if (!slug || map.has(slug)) continue;
          map.set(slug, {
            label: canalLabelForMarketplaceUrl(url, item.title),
            url,
          });
        }
      }
    } catch {
      /* skip bad dig */
    }
  }
  marketplaceBySlug = map;
  return map;
}

/** Official Carddass / Fullahead / marketplace product pages for sealed SKUs. */
export function dbhSealedDistributionCitation(
  slug: string | null | undefined,
): { label: string; url: string } | null {
  const key = slug?.trim().toLowerCase() || "";
  if (!key) return null;

  if (key === "starter-pack-namek-battle") {
    const url =
      digSourceUrl("official-product") ?? digSourceUrl("dbh-biyori-list");
    if (!url) return null;
    return {
      label: "Canal — Starter Pack Namek (carddass.com)",
      url,
    };
  }

  return (
    loadFullaheadBySlug().get(key) ?? loadMarketplaceBySlug().get(key) ?? null
  );
}

function normalizeBattleId(raw: string): string {
  return raw.trim().toUpperCase().replace(/^UGMPS-0*/, "UGMPS-");
}

/** UGMPS-01…06 battle cards from the Namek starter dig. */
export function dbhNamekInsertCitationForPrint(
  row: Pick<LocalPrintSearchRow, "setCode" | "number">,
): { label: string; value: string; url: string } | null {
  if (row.setCode.trim().toLowerCase() !== "ugmps") return null;
  const dig = loadNamekDig();
  const battleIds = dig?.verdict?.battleIds ?? [];
  const num = row.number.trim().toUpperCase().replace(/^0+/, "") || row.number;
  const forms = [
    `UGMPS-${num}`,
    `UGMPS-${row.number.trim()}`,
    `UGMPS-${row.number.trim().padStart(2, "0")}`,
  ];
  const hit = battleIds.some((id) =>
    forms.some((form) => normalizeBattleId(id) === normalizeBattleId(form)),
  );
  if (!hit) return null;
  const url =
    digSourceUrl("official-product") ?? digSourceUrl("dbh-biyori-list");
  if (!url) return null;
  return {
    label: "Insert starter",
    value: "SDBH Starter Pack — Namek Battle",
    url,
  };
}

export function dbhPrintFacts(
  row: LocalPrintSearchRow,
  providerId: string,
): MetadataFact[] {
  const insert = dbhNamekInsertCitationForPrint(row);
  if (!insert) return [];
  const facts: MetadataFact[] = [
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
  const retail = loadNamekDig()?.sources?.find(
    (entry) => entry.id === "retail-structure",
  );
  const claim = retail?.finding?.trim() || "";
  const storyUrl =
    sanitizePublicCitationUrl(retail?.url) ?? insert.url;
  if (claim && storyUrl) {
    facts.push({
      kind: "story",
      label: "Le saviez-vous ?",
      value: claim,
      source: providerId,
      url: storyUrl,
      confidence: 0.85,
      priority: 26,
    });
  }
  return facts;
}
