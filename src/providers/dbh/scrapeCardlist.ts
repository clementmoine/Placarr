/**
 * Scrape Dragon Ball Heroes cardlists from carddass.com/dbh.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import { dbhCuratedDir } from "./pack";
import { parseDbhPrinted } from "./printKey";

const ORIGIN = "https://www.carddass.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type DbhCard = {
  printed: string;
  set: string;
  number: string;
  nameJa: string;
  rarity?: string;
  categoryId: string;
  categoryLabel: string;
  faceUrl: string;
};

const sleep = (ms: number) =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

async function fetchHtml(url: string): Promise<string> {
  const res = await httpGet<string>(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html",
      "Accept-Language": "ja,en;q=0.8",
    },
    responseType: "text",
    timeout: 45_000,
    validateStatus: (s) => s === 200,
  });
  return typeof res.data === "string" ? res.data : "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Discover category ids from the cardlist hub. */
export function parseDbhCategories(
  html: string,
): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();
  const re =
    /href="\/dbh\/cardlist\/\?search=true&category=(\d+)"[^>]*>([^<]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1]!;
    const label = decodeEntities(m[2]!).trim();
    if (seen.has(id) || !label) continue;
    seen.add(id);
    out.push({ id, label });
  }
  return out;
}

export function parseDbhCategoryCards(
  html: string,
  categoryId: string,
  categoryLabel: string,
): DbhCard[] {
  const cards: DbhCard[] = [];
  const seen = new Set<string>();
  // <li>H1-01</li><li>孫悟空</li> near dummys/H1-01.jpg and rare stars
  const blockRe =
    /dummys\/([^"']+\.(?:jpg|png))[^>]*>[\s\S]*?<div class="rare">([^<]*)<\/div>[\s\S]*?<li>([^<]+)<\/li>\s*<li>([^<]+)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const file = m[1]!;
    const rarity = decodeEntities(m[2]!).trim();
    const printedRaw = decodeEntities(m[3]!).trim();
    const nameJa = decodeEntities(m[4]!).trim();
    const parsed = parseDbhPrinted(printedRaw);
    if (!parsed || !nameJa) continue;
    if (seen.has(parsed.printed)) continue;
    seen.add(parsed.printed);
    cards.push({
      printed: parsed.printed,
      set: parsed.set,
      number: parsed.number,
      nameJa,
      rarity: rarity || undefined,
      categoryId,
      categoryLabel,
      faceUrl: `${ORIGIN}/dbh/image/cardlist/dummys/${file}`,
    });
  }
  // Fallback looser: just <li>CODE</li><li>NAME</li>
  if (!cards.length) {
    const loose =
      /<li>([A-Z0-9][A-Z0-9-]*-[A-Z0-9]+)<\/li>\s*<li>([^<]{1,40})<\/li>/gi;
    while ((m = loose.exec(html))) {
      const printedRaw = m[1]!;
      const nameJa = decodeEntities(m[2]!).trim();
      const parsed = parseDbhPrinted(printedRaw);
      if (!parsed || !nameJa || seen.has(parsed.printed)) continue;
      seen.add(parsed.printed);
      cards.push({
        printed: parsed.printed,
        set: parsed.set,
        number: parsed.number,
        nameJa,
        categoryId,
        categoryLabel,
        faceUrl: `${ORIGIN}/dbh/image/cardlist/dummys/${parsed.printed}.jpg`,
      });
    }
  }
  return cards;
}

export async function scrapeDbhCardlists(
  opts: { delayMs?: number; maxCategories?: number } = {},
): Promise<{ cards: DbhCard[]; outPath: string; categories: number }> {
  const delayMs = opts.delayMs ?? 400;
  const hub = await fetchHtml(`${ORIGIN}/dbh/cardlist/?search=true`);
  let categories = parseDbhCategories(hub);
  if (opts.maxCategories && opts.maxCategories > 0) {
    categories = categories.slice(0, opts.maxCategories);
  }

  const byPrinted = new Map<string, DbhCard>();
  for (const cat of categories) {
    const url = `${ORIGIN}/dbh/cardlist/?search=true&category=${cat.id}`;
    try {
      const html = await fetchHtml(url);
      for (const card of parseDbhCategoryCards(html, cat.id, cat.label)) {
        if (!byPrinted.has(card.printed)) byPrinted.set(card.printed, card);
      }
      console.log(
        `── DBH ${cat.label} (${cat.id}) — ${byPrinted.size} unique so far`,
      );
    } catch (err) {
      console.warn(
        `── DBH category ${cat.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
    await sleep(delayMs);
  }

  const cards = [...byPrinted.values()].sort((a, b) =>
    a.printed.localeCompare(b.printed),
  );
  const outPath = path.join(dbhCuratedDir(), "sources", "carddass-dbh.json");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        source: "carddass.com/dbh/cardlist",
        lang: "ja",
        observed: new Date().toISOString().slice(0, 10),
        url: `${ORIGIN}/dbh/cardlist/`,
        categories: categories.length,
        cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { cards, outPath, categories: categories.length };
}
