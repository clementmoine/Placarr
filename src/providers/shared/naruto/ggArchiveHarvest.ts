/**
 * Shared harvest of narutocardgame.gg archive pages (cards + prices staging).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { packStagingDir } from "@/lib/packPaths";
import {
  ggArchiveIndexUrl,
  ggArchivePricesUrl,
  parseGgCardIndex,
  type GgArchiveLine,
  type GgCard,
} from "@/providers/narutocarddass/parse/parseNarutoCardGameGg";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export const GG_STAGING_FOLDER = "narutocardgame-gg";

export function ggPackStagingDir(packId: string): string {
  return path.join(packStagingDir(packId), GG_STAGING_FOLDER);
}

export async function fetchGgArchiveCards(
  line: GgArchiveLine,
): Promise<GgCard[]> {
  const response = await httpGet(ggArchiveIndexUrl(line), {
    headers: { "User-Agent": UA },
    timeout: 90_000,
  });
  const html = String((response as { data?: unknown }).data ?? "");
  return parseGgCardIndex(html, line);
}

export function writeGgArchiveIndex(
  packId: string,
  line: GgArchiveLine,
  cards: readonly GgCard[],
): string {
  const dir = ggPackStagingDir(packId);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "cards.json");
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        source: ggArchiveIndexUrl(line),
        line,
        observed: new Date().toISOString().slice(0, 10),
        cards: cards.length,
        rows: cards,
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

/**
 * Card detail path on gg prices tables:
 * - kayou/mythos: `/archive/{line}/cards/{slug}`
 * - classic-ccg: `/archive/classic-ccg/{set}/{prefix}{n}-{slug}` (no `/cards/`)
 */
const GG_CARD_HREF_RE =
  /href="(\/archive\/[^"/]+\/(?:cards\/[^"/]+|[^"/]+\/[a-z][a-z0-9]*\d+[a-z0-9-]*))"/i;

const GG_PRICE_RE = /(\$[\d,.]+|€[\d,.]+|[\d,.]+\s*USD)/i;

/** Parse price table rows from gg /prices HTML (best-effort). */
export function parseGgPricesHtml(html: string): {
  name: string;
  price: string;
  href?: string;
  number?: string;
}[] {
  const rows: {
    name: string;
    price: string;
    href?: string;
    number?: string;
  }[] = [];
  const seen = new Set<string>();

  // Preferred: one <tr> per card (Card | Number | Lowest price | Details).
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const body = tr[1] ?? "";
    const href = body.match(GG_CARD_HREF_RE)?.[1];
    if (!href || href.endsWith("/prices")) continue;
    const price = body.match(GG_PRICE_RE)?.[1];
    if (!price) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const number = body.match(
      />([A-Z]{1,6}\d{0,3}[-–][A-Z0-9][-A-Z0-9]*|[a-z]\d{2,4})<\/td>/i,
    )?.[1];
    const name =
      body.match(/<span[^>]*>([^<]+)<\/span>/i)?.[1]?.trim() ||
      href.split("/").pop() ||
      href;
    rows.push({
      name,
      price: price.replace(/\s+/g, " ").trim(),
      href,
      ...(number ? { number } : {}),
    });
  }
  if (rows.length > 0) return rows;

  // Fallback: card link then price within a wide window (img src can be long).
  const re = new RegExp(
    `${GG_CARD_HREF_RE.source}[^>]*>[\\s\\S]{0,1200}?${GG_PRICE_RE.source}`,
    "gi",
  );
  for (const m of html.matchAll(re)) {
    const href = m[1]!;
    if (href.endsWith("/prices") || seen.has(href)) continue;
    seen.add(href);
    rows.push({
      name: href.split("/").pop() ?? href,
      price: m[2]!.replace(/\s+/g, " ").trim(),
      href,
    });
  }
  return rows;
}

export async function harvestGgArchivePrices(input: {
  packId: string;
  line: GgArchiveLine;
}): Promise<{ rows: number; file: string }> {
  const response = await httpGet(ggArchivePricesUrl(input.line), {
    headers: { "User-Agent": UA },
    timeout: 90_000,
  });
  const html = String((response as { data?: unknown }).data ?? "");
  const rows = parseGgPricesHtml(html);
  const dir = ggPackStagingDir(input.packId);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "prices.json");
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        source: ggArchivePricesUrl(input.line),
        line: input.line,
        observed: new Date().toISOString().slice(0, 10),
        rows,
      },
      null,
      2,
    )}\n`,
  );
  return { rows: rows.length, file };
}

export async function harvestGgArchiveCards(input: {
  packId: string;
  line: GgArchiveLine;
}): Promise<{ cards: number; file: string }> {
  const cards = await fetchGgArchiveCards(input.line);
  const file = writeGgArchiveIndex(input.packId, input.line, cards);
  return { cards: cards.length, file };
}
