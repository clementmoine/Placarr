/**
 * Harvest EN CCG titles from narutocards.net sitemap (slug-derived names).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../packs";
import {
  mergeNarutoCardsNetIntoIndex,
  parseNarutoCardsNetSitemap,
  type NarutoCardsNetCard,
} from "../parse/parseNarutoCardsNet";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import ledger from "../curated/sources/narutocards-net.json";

export const NARUTO_STAGING_NARUTOCARDS_NET = path.join(
  "staging",
  "narutocards-net",
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function narutoCardsNetLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_NARUTOCARDS_NET,
    "cards.json",
  );
}

export function narutoCardsNetSitemapPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_NARUTOCARDS_NET,
    "sitemap.xml",
  );
}

function readNarutoCardsNetLedgerJson(
  packDir?: string,
): NarutoCardsNetCard[] {
  const file = narutoCardsNetLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is NarutoCardsNetCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as NarutoCardsNetCard;
      return (
        typeof card.number === "string" &&
        typeof card.name === "string" &&
        typeof card.printedRef === "string"
      );
    });
  } catch {
    return [];
  }
}

export function parseNarutoCardsNetLedgerFromStaging(
  packDir?: string,
): NarutoCardsNetCard[] {
  const file = narutoCardsNetSitemapPath(packDir);
  if (!existsSync(file)) return [];
  try {
    return parseNarutoCardsNetSitemap(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

export function loadNarutoCardsNetLedger(
  packDir?: string,
): NarutoCardsNetCard[] {
  const fromJson = readNarutoCardsNetLedgerJson(packDir);
  if (fromJson.length > 0) return fromJson;
  const fromSitemap = parseNarutoCardsNetLedgerFromStaging(packDir);
  if (fromSitemap.length > 0) syncNarutoCardsNetLedger(packDir, fromSitemap);
  return fromSitemap;
}

function syncNarutoCardsNetLedger(
  packDir: string | undefined,
  cards: readonly NarutoCardsNetCard[],
): void {
  const root = packDir ?? packRoot();
  mkdirSync(path.join(root, NARUTO_STAGING_NARUTOCARDS_NET), {
    recursive: true,
  });
  writeFileSync(
    narutoCardsNetLedgerPath(root),
    `${JSON.stringify(
      {
        source: ledger.sitemap,
        generatedAt: new Date().toISOString(),
        ingest: "titles-slug-derived",
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export function mergeNarutoCardsNetLedgerIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  return mergeNarutoCardsNetIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: loadNarutoCardsNetLedger(input.packDir),
  });
}

export type ScrapeNarutoCardsNetOptions = {
  force?: boolean;
  root?: string;
};

export async function scrapeNarutoCardsNetTitles(
  opts: ScrapeNarutoCardsNetOptions = {},
): Promise<{ written: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = narutoCardsNetLedgerPath(packDir);
  const sitemapDest = narutoCardsNetSitemapPath(packDir);
  if (!opts.force && existsSync(dest)) {
    const existing = loadNarutoCardsNetLedger(packDir);
    if (existing.length) {
      console.log(
        `── narutocards.net titles : ${existing.length} déjà en staging`,
      );
      return { written: existing.length };
    }
  }

  const res = await httpGet<string>(ledger.sitemap, {
    headers: { "User-Agent": UA, Accept: "application/xml,text/xml" },
    responseType: "text",
    timeout: 45_000,
    validateStatus: (status) => status === 200,
  });
  const xml = typeof res.data === "string" ? res.data : "";
  if (xml.length < 400) {
    throw new Error("narutocards.net sitemap empty or unreachable");
  }
  const cards = parseNarutoCardsNetSitemap(xml);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(sitemapDest, xml, "utf8");
  syncNarutoCardsNetLedger(packDir, cards);
  console.log(`── narutocards.net titles : ${cards.length} écrits (slug-derived)`);
  return { written: cards.length };
}
