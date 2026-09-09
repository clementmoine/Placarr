/**
 * Resolve FR titles/rarities from cached Manga-News deck HTML → print_titles rows.
 * Reads `staging/manga-news/` (no network).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { narutoLedgerNumber, narutoNumbersEqual } from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { NARUTO_PACK_ID } from "../indexStore";
import {
  MANGA_NEWS_DECKS,
  htmlToChecklistText,
  parseMangaNewsChecklistText,
  type MangaNewsChecklistLine,
} from "../parse/parseMangaNewsChecklist";

export type MangaNewsTitleHit = {
  number: string;
  name: string;
  rarity: string | null;
  /** Deck setHint that contributed this row, e.g. s1 */
  setHint: string;
};

function scoreName(name: string): number {
  // Prefer fuller MN names over truncated "…" endings.
  let s = name.length;
  if (/[.…]$/.test(name) || name.includes("...")) s -= 40;
  return s;
}

/**
 * Collapse MN lines for one collector number, preferring a matching setHint
 * then the fullest name.
 */
export function pickTitleForNumber(
  lines: readonly MangaNewsTitleHit[],
  preferSetHint?: string | null,
): { name: string; rarity: string | null; setHint: string } | null {
  if (lines.length === 0) return null;
  const preferred = preferSetHint
    ? lines.filter((l) => l.setHint === preferSetHint)
    : [];
  const pool = preferred.length ? preferred : [...lines];
  pool.sort((a, b) => scoreName(b.name) - scoreName(a.name));
  const best = pool[0]!;
  return { name: best.name, rarity: best.rarity, setHint: best.setHint };
}

function mangaNewsCacheDir(override?: string): string {
  return (
    override ?? path.join(dataRoot(), NARUTO_PACK_ID, "staging", "manga-news")
  );
}

export function loadMangaNewsTitleHitsFromCache(opts?: {
  cacheDir?: string;
}): MangaNewsTitleHit[] {
  const cacheDir = mangaNewsCacheDir(opts?.cacheDir);
  // Prefer staging; fall back to legacy checklist/ once during migration.
  const legacy = path.join(
    dataRoot(),
    NARUTO_PACK_ID,
    "checklist",
    "manga-news",
  );
  const dir = existsSync(cacheDir)
    ? cacheDir
    : existsSync(legacy)
      ? legacy
      : cacheDir;
  const out: MangaNewsTitleHit[] = [];

  for (const deck of MANGA_NEWS_DECKS) {
    if (deck.setHint === "ns") continue;
    const file = path.join(dir, `${deck.slug}.html`);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, "utf8");
    const lines = parseMangaNewsChecklistText(htmlToChecklistText(html));
    for (const line of lines) {
      out.push(titleHitFromLine(line, deck.setHint));
    }
  }
  return out;
}

export function titleHitFromLine(
  line: MangaNewsChecklistLine,
  setHint: string,
): MangaNewsTitleHit {
  return {
    number: line.number,
    name: line.name,
    rarity: line.rarity === "unknown" ? null : line.rarity,
    setHint,
  };
}

export function titlesForPrints(
  prints: readonly NarutoPrintRow[],
  hits: readonly MangaNewsTitleHit[],
  lang = "fr",
): NarutoTitleRow[] {
  const byNumber = new Map<string, MangaNewsTitleHit[]>();
  for (const hit of hits) {
    const list = byNumber.get(hit.number) ?? [];
    list.push(hit);
    byNumber.set(hit.number, list);
  }

  const titles: NarutoTitleRow[] = [];
  for (const print of prints) {
    const list =
      byNumber.get(print.number) ??
      byNumber.get(narutoLedgerNumber(print.number) ?? "") ??
      [...byNumber.entries()].find(([n]) =>
        narutoNumbersEqual(n, print.number),
      )?.[1];
    if (!list?.length) continue;
    const picked = pickTitleForNumber(list, print.setCode);
    if (!picked) continue;
    titles.push({
      printKey: print.printKey,
      lang,
      fullName: picked.name,
      rarity: picked.rarity,
    });
  }
  return titles;
}
