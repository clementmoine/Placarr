/**
 * Bandai USA CCG titles from collectorscomet.com ui-api.
 * Staging ledger only — no faces, no marketplace listings crawl.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import ledger from "../curated/sources/collectors-comet.json";
import { NARUTO_PACK_ID } from "../packs";
import {
  parseCollectorsCometProduct,
  type CollectorsCometCard,
} from "../parse/parseCollectorsComet";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { mergeCollectorsCometIntoIndex } from "../parse/parseCollectorsComet";

export const NARUTO_STAGING_COLLECTORS_COMET = path.join(
  "staging",
  "collectors-comet",
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 120;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type CometEdition = { id: string; name: string };
type CometProduct = { name: string; number: string };

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function collectorsCometLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_COLLECTORS_COMET,
    "cards.json",
  );
}

export function loadCollectorsCometLedger(
  packDir?: string,
): CollectorsCometCard[] {
  const file = collectorsCometLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is CollectorsCometCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as CollectorsCometCard;
      return (
        typeof card.number === "string" &&
        typeof card.name === "string" &&
        typeof card.setCode === "string" &&
        typeof card.printedRef === "string"
      );
    });
  } catch {
    return [];
  }
}

export function mergeCollectorsCometLedgerIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  return mergeCollectorsCometIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: loadCollectorsCometLedger(input.packDir),
  });
}

export type ScrapeCollectorsCometOptions = {
  force?: boolean;
  delayMs?: number;
  root?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await httpGet<T>(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeoutMs: 30_000,
  });
  return res.data;
}

export async function scrapeCollectorsCometTitles(
  opts: ScrapeCollectorsCometOptions = {},
): Promise<{ written: number; editions: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = collectorsCometLedgerPath(packDir);
  if (!opts.force && existsSync(dest)) {
    const existing = loadCollectorsCometLedger(packDir);
    if (existing.length) {
      console.log(
        `── collectorscomet titles : ${existing.length} déjà en staging`,
      );
      return { written: existing.length, editions: 0 };
    }
  }

  const delay = opts.delayMs ?? DEFAULT_DELAY_MS;
  const editions = await fetchJson<CometEdition[]>(ledger.urls.editions);
  const byNumber = new Map<string, CollectorsCometCard>();

  for (const edition of editions) {
    await sleep(delay);
    const products = await fetchJson<CometProduct[]>(
      `${ledger.urls.products}${edition.id}`,
    );
    for (const product of products) {
      const row = parseCollectorsCometProduct(product, edition.name);
      if (!row || byNumber.has(row.number)) continue;
      byNumber.set(row.number, row);
    }
  }

  const cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    JSON.stringify(
      {
        source: ledger.source,
        generatedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `── collectorscomet titles : ${cards.length} cartes (${editions.length} éditions)`,
  );
  return { written: cards.length, editions: editions.length };
}
