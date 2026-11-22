/**
 * Coleka listing HTML: later pages trip a verify wall on a direct GET.
 * Cached wall HTML is stale — refetch through FlareSolverr.
 *
 * Community edits listings over time; a forever cache would freeze old HTML.
 * Default max-age refreshes good caches after a day (override via opts).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";

import { colekaHtmlIsVerifyWall } from "./verifyWall";

/** Fresh enough for community listing edits without hammering Flare. */
export const COLEKA_LISTING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function cacheIsFresh(dest: string, maxAgeMs: number): boolean {
  if (maxAgeMs <= 0) return true;
  try {
    return Date.now() - statSync(dest).mtimeMs <= maxAgeMs;
  } catch {
    return false;
  }
}

export async function fetchColekaListingHtml(
  url: string,
  dest: string,
  force: boolean,
  opts: { maxAgeMs?: number } = {},
): Promise<string | null> {
  const maxAgeMs = opts.maxAgeMs ?? COLEKA_LISTING_MAX_AGE_MS;
  if (!force && existsSync(dest) && cacheIsFresh(dest, maxAgeMs)) {
    const cached = readFileSync(dest, "utf8");
    if (cached.length > 400 && !colekaHtmlIsVerifyWall(cached)) return cached;
  }
  const html = await fetchTextWithFlareFallback(url, {
    flareMaxTimeoutMs: 60_000,
  });
  if (!html || html.length < 400 || colekaHtmlIsVerifyWall(html)) {
    if (existsSync(dest)) {
      const cached = readFileSync(dest, "utf8");
      if (cached.length > 400 && !colekaHtmlIsVerifyWall(cached)) return cached;
    }
    return null;
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, html, "utf8");
  return html;
}

/**
 * Quand une page de listing manque (mur Coleka, page absente), garde les
 * cartes déjà relevées dans `cards.json` du staging : une lecture partielle
 * ne doit pas faire disparaître de l'index des cartes attestées (Sage's
 * Legacy FR, 2026-11-22 : 72 singles sur 120, 48 titres FR perdus). Une
 * lecture complète fait foi.
 */
export function keepStagedListingCards<T extends { number: string }>(
  byNumber: Map<string, T>,
  stagedCardsJson: string,
  pagesMissing: number,
): void {
  if (pagesMissing <= 0 || !existsSync(stagedCardsJson)) return;
  let staged: { cards?: T[] };
  try {
    staged = JSON.parse(readFileSync(stagedCardsJson, "utf8")) as {
      cards?: T[];
    };
  } catch {
    return;
  }
  for (const card of staged.cards ?? []) {
    if (card?.number && !byNumber.has(card.number)) {
      byNumber.set(card.number, card);
    }
  }
}
