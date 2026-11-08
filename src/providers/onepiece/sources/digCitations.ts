/**
 * OPTCG research digs → sealed Distribution / Insert citations (Tier One Pieces).
 * Dig proof URLs are matched onto curated `products-contents` SKUs (incl. JA twins).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { sanitizePublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";
import type { LocalPrintSearchRow } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import type { MetadataFact } from "@/types/metadataProvider";

import { onepieceCuratedDir } from "../pack";
import { onepiecePrintKey } from "../printIdentity";

type DigIngestRow = {
  sum?: number;
  url?: string;
  slug?: string;
};

type DigSource = { id?: string; url?: string };

type DigDeckTable = {
  url?: string;
  rows?: readonly { id?: string }[];
  /** ST13–28 harvest: cardId → qty (numbers only). */
  [cardId: string]: string | number | readonly { id?: string }[] | undefined;
};

type DigFile = {
  kind?: string;
  /** ST13–28 harvest — code → Tier One Pieces URL. */
  urls?: Record<string, string>;
  verdict?: { ingested?: Record<string, DigIngestRow> };
  sources?: readonly DigSource[];
  decks?: Record<string, DigDeckTable>;
};

type ProductsContentsFile = {
  skus?: Record<
    string,
    {
      source?: string;
      guaranteedPrintKeys?: readonly string[];
    }
  >;
};

let digsCache: DigFile[] | null | undefined;
let sealedBySlug: Map<string, { label: string; url: string }> | null | undefined;
let insertByPrintKey:
  | Map<string, { label: string; value: string; url: string }>
  | null
  | undefined;

export function resetOnepieceDigCitationCaches(): void {
  digsCache = undefined;
  sealedBySlug = undefined;
  insertByPrintKey = undefined;
}

const DIG_FILES = [
  "st01-21-tier-one-pieces-2026-09-13.json",
  "st13-19-28-tier-one-pieces-2026-09-14.json",
  "st29-35-tier-one-pieces-2026-09-13.json",
] as const;

function digPaths(): string[] {
  return DIG_FILES.map((file) =>
    path.join(onepieceCuratedDir(), "sources", file),
  );
}

function productsContentsPath(): string {
  return path.join(onepieceCuratedDir(), "products-contents.json");
}

function loadDigs(): DigFile[] {
  if (digsCache !== undefined) return digsCache ?? [];
  const out: DigFile[] = [];
  for (const digPath of digPaths()) {
    try {
      if (!existsSync(digPath)) continue;
      const raw = JSON.parse(readFileSync(digPath, "utf8")) as DigFile;
      // ST13–28 harvest omits `kind` but carries Tier One `urls` + deck qty maps.
      if (raw?.kind === "research-dig" || raw?.urls) out.push(raw);
    } catch {
      /* skip bad dig */
    }
  }
  digsCache = out;
  return out;
}

/** Match starter SKUs to dig codes (st19, …) — skip event/tournament boosters. */
function slugMatchesStarterCode(slug: string, code: string): boolean {
  const c = code.trim().toLowerCase();
  const key = slug.trim().toLowerCase();
  if (!c || !key) return false;
  if (key.startsWith("booster-")) return false;
  if (key.startsWith(`${c}-`)) return true;
  if (key.includes(`japanese-starter-deck-${c}-`)) return true;
  if (key.includes(`starter-deck-${c}-`)) return true;
  return false;
}

/** First http(s) URL embedded in a products-contents `source` field. */
function firstHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/[^\s)\]>"']+/i);
  return match?.[0] ? sanitizePublicCitationUrl(match[0]) : null;
}

function collectDigProofUrls(digs: DigFile[]): Map<string, string> {
  /** normalized URL → display code hint (st29, st01, …) */
  const byUrl = new Map<string, string>();
  for (const dig of digs) {
    for (const [code, row] of Object.entries(dig.verdict?.ingested ?? {})) {
      const url = sanitizePublicCitationUrl(row.url);
      if (url) byUrl.set(url, code.toUpperCase());
    }
    for (const [code, urlRaw] of Object.entries(dig.urls ?? {})) {
      const url = sanitizePublicCitationUrl(urlRaw);
      if (url && !byUrl.has(url)) byUrl.set(url, code.toUpperCase());
    }
    for (const [code, deck] of Object.entries(dig.decks ?? {})) {
      const url = sanitizePublicCitationUrl(
        typeof deck.url === "string" ? deck.url : undefined,
      );
      if (url && !byUrl.has(url)) byUrl.set(url, code.toUpperCase());
    }
    for (const source of dig.sources ?? []) {
      const url = sanitizePublicCitationUrl(source.url);
      if (!url || byUrl.has(url)) continue;
      // Only Tier One per-deck pages — skip shared membership hubs (st31–36).
      const tier = source.id?.match(/tier-one-st(\d{2})/i);
      if (!tier) continue;
      byUrl.set(url, `ST${tier[1]}`);
    }
  }
  return byUrl;
}

function loadProductsContents(): ProductsContentsFile | null {
  try {
    if (!existsSync(productsContentsPath())) return null;
    return JSON.parse(
      readFileSync(productsContentsPath(), "utf8"),
    ) as ProductsContentsFile;
  } catch {
    return null;
  }
}

/**
 * Dig URL matches a SKU source when the SKU’s first URL equals the dig URL
 * or the dig URL is a strict prefix of the SKU URL (query / trailing junk).
 */
function digUrlForSkuSource(
  skuSourceUrl: string,
  digUrls: Map<string, string>,
): { url: string; code: string } | null {
  const direct = digUrls.get(skuSourceUrl);
  if (direct) return { url: skuSourceUrl, code: direct };
  for (const [digUrl, code] of digUrls) {
    if (
      skuSourceUrl === digUrl ||
      skuSourceUrl.startsWith(`${digUrl}?`) ||
      digUrl.startsWith(skuSourceUrl)
    ) {
      return { url: digUrl, code };
    }
  }
  return null;
}

function ensureMaps(): {
  sealed: Map<string, { label: string; url: string }>;
  inserts: Map<string, { label: string; value: string; url: string }>;
} {
  if (sealedBySlug && insertByPrintKey) {
    return { sealed: sealedBySlug, inserts: insertByPrintKey };
  }

  const sealed = new Map<string, { label: string; url: string }>();
  const inserts = new Map<
    string,
    { label: string; value: string; url: string }
  >();
  const digs = loadDigs();
  const digUrls = collectDigProofUrls(digs);

  // ST01–21 dig carries explicit slug + deck rows — stamp those first.
  for (const dig of digs) {
    for (const [code, row] of Object.entries(dig.verdict?.ingested ?? {})) {
      const slug = row.slug?.trim().toLowerCase();
      const url = sanitizePublicCitationUrl(row.url);
      if (!slug || !url) continue;
      sealed.set(slug, {
        label: `Canal — Pieces ${code.toUpperCase()} (Tier One)`,
        url,
      });
    }
    for (const [code, deck] of Object.entries(dig.decks ?? {})) {
      const url = sanitizePublicCitationUrl(
        (typeof deck.url === "string" ? deck.url : undefined) ??
          dig.urls?.[code],
      );
      if (!url) continue;
      const value = `OPTCG Starter ${code.toUpperCase()} (Tier One Pieces)`;
      for (const row of deck.rows ?? []) {
        const pk = onepiecePrintKey(row.id)?.toLowerCase();
        if (!pk || inserts.has(pk)) continue;
        inserts.set(pk, { label: "Insert starter", value, url });
      }
      // ST13–28 qty maps: cardId → count.
      for (const [cardId, qty] of Object.entries(deck)) {
        if (cardId === "url" || cardId === "rows") continue;
        if (typeof qty !== "number") continue;
        const pk = onepiecePrintKey(cardId)?.toLowerCase();
        if (!pk || inserts.has(pk)) continue;
        inserts.set(pk, { label: "Insert starter", value, url });
      }
    }
  }

  // ST29+ digs (and JA twins): bridge dig URLs → products-contents SKUs.
  const products = loadProductsContents();
  for (const [slug, sku] of Object.entries(products?.skus ?? {})) {
    const skuUrl = firstHttpUrl(sku.source);
    if (!skuUrl) continue;
    const hit = digUrlForSkuSource(skuUrl, digUrls);
    if (!hit) continue;
    const key = slug.trim().toLowerCase();
    if (!sealed.has(key)) {
      sealed.set(key, {
        label: `Canal — Pieces ${hit.code} (Tier One)`,
        url: hit.url,
      });
    }
    const value = `OPTCG Starter ${hit.code} (Tier One Pieces)`;
    for (const printKey of sku.guaranteedPrintKeys ?? []) {
      const pk = printKey.trim().toLowerCase();
      if (!pk || inserts.has(pk)) continue;
      inserts.set(pk, { label: "Insert starter", value, url: hit.url });
    }
  }

  // ST13–28: products often lack Tier One URLs — match dig codes onto starter slugs.
  for (const dig of digs) {
    for (const [code, urlRaw] of Object.entries(dig.urls ?? {})) {
      const url = sanitizePublicCitationUrl(urlRaw);
      if (!url) continue;
      const label = `Canal — Pieces ${code.toUpperCase()} (Tier One)`;
      for (const slug of Object.keys(products?.skus ?? {})) {
        const key = slug.trim().toLowerCase();
        if (!slugMatchesStarterCode(key, code) || sealed.has(key)) continue;
        sealed.set(key, { label, url });
      }
    }
  }

  sealedBySlug = sealed;
  insertByPrintKey = inserts;
  return { sealed, inserts };
}

export function onepieceSealedDistributionCitation(
  slug: string | null | undefined,
): { label: string; url: string } | null {
  const key = slug?.trim().toLowerCase() || "";
  if (!key) return null;
  const hit = ensureMaps().sealed.get(key);
  if (hit) return hit;

  // ST36: dig attests the Tier One page exists but has no Pieces table —
  // still stamp Distribution (membership / product listing), never Insert qty.
  if (key.startsWith("st36-")) {
    const digUrls = collectDigProofUrls(loadDigs());
    for (const [url, code] of digUrls) {
      if (code !== "ST36") continue;
      return {
        label: "Canal — ST36 (Tier One, sans table Pieces)",
        url,
      };
    }
  }
  return null;
}

export function onepiecePrintFacts(
  row: LocalPrintSearchRow,
  providerId: string,
): MetadataFact[] {
  const insert = ensureMaps().inserts.get(row.printKey.trim().toLowerCase());
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
