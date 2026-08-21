/**
 * Bandai CCG titles from narutocards.ca set pages.
 * Staging ledger only — no faces, no Kayou, no set 29.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "./packs";
import {
  mergeNarutoCardsCaIntoIndex,
  narutoCardsCaSetsToScrape,
  parseNarutoCardsCaSetHtml,
  type NarutoCardsCaCard,
} from "./parseNarutoCardsCa";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";

export const NARUTO_STAGING_NARUTOCARDS_CA = path.join(
  "staging",
  "narutocards-ca",
);
const ORIGIN = "https://www.narutocards.ca";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const DEFAULT_DELAY_MS = 250;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function packRoot(dataDir?: string): string {
  return path.join(dataDir ?? dataRoot(), NARUTO_PACK_ID);
}

export function narutoCardsCaLedgerPath(packDir?: string): string {
  return path.join(
    packDir ?? packRoot(),
    NARUTO_STAGING_NARUTOCARDS_CA,
    "cards.json",
  );
}

export function loadNarutoCardsCaLedger(packDir?: string): NarutoCardsCaCard[] {
  const file = narutoCardsCaLedgerPath(packDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { cards?: unknown };
    if (!Array.isArray(raw.cards)) return [];
    return raw.cards.filter((row): row is NarutoCardsCaCard => {
      if (!row || typeof row !== "object") return false;
      const card = row as NarutoCardsCaCard;
      return (
        typeof card.number === "string" &&
        typeof card.name === "string" &&
        typeof card.setCode === "string"
      );
    });
  } catch {
    return [];
  }
}

export function mergeNarutoCardsCaLedgerIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  packDir?: string;
}) {
  return mergeNarutoCardsCaIntoIndex({
    prints: input.prints,
    titles: input.titles,
    cards: loadNarutoCardsCaLedger(input.packDir),
  });
}

export type ScrapeNarutoCardsCaOptions = {
  force?: boolean;
  delayMs?: number;
  root?: string;
  limitSets?: number;
};

export async function scrapeNarutoCardsCaTitles(
  opts: ScrapeNarutoCardsCaOptions = {},
): Promise<{ written: number; sets: number }> {
  const packDir = opts.root ? packRoot(opts.root) : undefined;
  const dest = narutoCardsCaLedgerPath(packDir);
  if (!opts.force && existsSync(dest)) {
    const existing = loadNarutoCardsCaLedger(packDir);
    if (existing.length) {
      console.log(
        `── narutocards.ca titles : ${existing.length} déjà en staging`,
      );
      return { written: existing.length, sets: 0 };
    }
  }
  const delay = opts.delayMs ?? DEFAULT_DELAY_MS;
  const sets = narutoCardsCaSetsToScrape().slice(0, opts.limitSets);
  const byNumber = new Map<string, NarutoCardsCaCard>();

  for (const set of sets) {
    const url = `${ORIGIN}/sets/bandai-ccg/${set.slug}`;
    try {
      const res = await httpGet<string>(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        responseType: "text",
        timeout: 25_000,
        validateStatus: (status) => status === 200,
      });
      const html = typeof res.data === "string" ? res.data : "";
      for (const row of parseNarutoCardsCaSetHtml(html, set.setCode)) {
        if (!byNumber.has(row.number)) byNumber.set(row.number, row);
      }
    } catch {
      // Keep going — one dead set must not drop the rest.
    }
    console.log(
      `   narutocards.ca ${set.setCode} → ${[...byNumber.values()].filter((c) => c.setCode === set.setCode).length} titres`,
    );
    await sleep(delay);
  }

  const cards = [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `${JSON.stringify(
      {
        source: ORIGIN,
        generatedAt: new Date().toISOString(),
        ingest: "titles",
        skip: ["kayou", "bandai-ccg-29"],
        cards,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`── narutocards.ca titles : ${cards.length} écrits`);
  return { written: cards.length, sets: sets.length };
}
