/**
 * Seed local MTG index from a Scryfall bulk JSON dump.
 *
 * Language is never part of the printKey — every paper lang Scryfall ships
 * lands as titles + artUrl on the same `mtg:{set}-{collector}` identity.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildPrintKey } from "@/core/identify/printKey";
import { packCardsIndexPath } from "@/lib/packPaths";
import { isCatalogueLang } from "@/providers/shared/cardCatalogue/catalogueLangs";
import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { MTG_PACK_ID } from "./pack";
import { mtgPrintIdentity } from "./printKey";
import {
  scryfallFrontImageUrl,
  scryfallFrontName,
  type ScryfallCard,
} from "./scryfallBulk";

export type MtgFinishesMap = Record<string, string[]>;

/** printKey → lang → CDN face URL */
export type MtgArtUrlMap = Record<string, Record<string, string>>;

/** Magic oracle / primary language is English. */
export const MTG_ORIGINAL_LANGS = ["en"] as const;

const SKIP_LAYOUTS = new Set([
  "art_series",
  "reversible_card",
  "double_faced_token",
]);

export function normalizeScryfallLang(lang?: string | null): string | null {
  const code = (lang ?? "").trim().toLowerCase();
  if (!code || code === "unknown") return null;
  return code;
}

function shouldKeepPaper(card: ScryfallCard): boolean {
  if (card.digital) return false;
  if (card.layout && SKIP_LAYOUTS.has(card.layout)) return false;
  if (!card.set || !card.collector_number) return false;
  if (!normalizeScryfallLang(card.lang)) return false;
  return true;
}

function shouldKeepTitleLang(lang: string): boolean {
  return isCatalogueLang(lang, MTG_ORIGINAL_LANGS);
}

export function finishesPath(): string {
  return path.join(
    process.cwd(),
    "data",
    MTG_PACK_ID,
    "curated",
    "finishes.json",
  );
}

export function artUrlsPath(): string {
  return path.join(
    process.cwd(),
    "data",
    MTG_PACK_ID,
    "curated",
    "art-urls.json",
  );
}

export function loadMtgFinishesMap(): MtgFinishesMap {
  const p = finishesPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as MtgFinishesMap;
  } catch {
    return {};
  }
}

type SeedPrint = {
  printKey: string;
  setCode: string;
  number: string;
  cardType: string;
  sourceUrl?: string | null;
  titles: { lang: string; fullName: string; rarity?: string | null }[];
};

/** Merge one Scryfall row into the in-memory seed maps (pure, testable). */
export function mergeScryfallCardIntoSeed(
  card: ScryfallCard,
  byKey: Map<string, SeedPrint>,
  finishes: MtgFinishesMap,
  artByKey: MtgArtUrlMap,
  opts: { titlesOnlyCatalogueLangs?: boolean } = {},
): "kept" | "skipped" {
  if (!shouldKeepPaper(card)) return "skipped";
  const lang = normalizeScryfallLang(card.lang)!;
  const titlesOnly = opts.titlesOnlyCatalogueLangs !== false;
  // Pass 1: catalogue langs only. Pass 2 (exclusives): any remaining print.
  if (titlesOnly && !shouldKeepTitleLang(lang)) return "skipped";

  const identity = mtgPrintIdentity(card.set, card.collector_number);
  const printKey = identity ? buildPrintKey(identity) : null;
  if (!identity || !printKey) return "skipped";

  // Exclusives-only pass: skip when EN/FR already owns the print.
  // Multi-lang exclusives (4bb ja/es/ko…) must still merge sibling langs.
  if (!titlesOnly && byKey.has(printKey)) {
    const existing = byKey.get(printKey)!;
    const hasCatalogueTitle = existing.titles.some((t) =>
      shouldKeepTitleLang(t.lang),
    );
    if (hasCatalogueTitle) return "skipped";
  }
  const setCode = identity.set;
  const number = identity.number;
  const title = {
    lang,
    fullName: scryfallFrontName(card),
    rarity: card.rarity?.trim() || null,
  };
  const existing = byKey.get(printKey);
  if (existing) {
    const idx = existing.titles.findIndex((t) => t.lang === lang);
    if (idx >= 0) existing.titles[idx] = title;
    else existing.titles.push(title);
  } else {
    byKey.set(printKey, {
      printKey,
      setCode,
      number,
      cardType: setCode,
      sourceUrl: `https://scryfall.com/card/${setCode}/${encodeURIComponent(card.collector_number!)}/${lang}`,
      titles: [title],
    });
  }

  if (Array.isArray(card.finishes) && card.finishes.length) {
    if (lang === "en" || !finishes[printKey]) {
      finishes[printKey] = card.finishes.map((f) => f.trim().toLowerCase());
    }
  }

  const art = scryfallFrontImageUrl(card);
  if (art) {
    const slot = (artByKey[printKey] ??= {});
    slot[lang] = art;
  }
  return "kept";
}

export async function seedMtgFromScryfallBulk(
  index: LocalPrintsIndex,
  bulkPath: string,
): Promise<{
  prints: number;
  titles: number;
  artUrls: number;
  langs: number;
  skipped: number;
}> {
  const { createReadStream } = await import("node:fs");
  const { createInterface } = await import("node:readline");

  const byKey = new Map<string, SeedPrint>();
  const finishes: MtgFinishesMap = {};
  const artByKey: MtgArtUrlMap = {};
  let skipped = 0;
  const langsSeen = new Set<string>();

  const rl = createInterface({
    input: createReadStream(bulkPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let card: ScryfallCard;
    try {
      card = JSON.parse(trimmed) as ScryfallCard;
    } catch {
      skipped += 1;
      continue;
    }
    const result = mergeScryfallCardIntoSeed(card, byKey, finishes, artByKey, {
      titlesOnlyCatalogueLangs: true,
    });
    if (result === "skipped") {
      skipped += 1;
      continue;
    }
    const lang = normalizeScryfallLang(card.lang);
    if (lang) langsSeen.add(lang);
  }

  // Second pass: paper exclusives that never had en/fr (e.g. JP-only promos).
  const rl2 = createInterface({
    input: createReadStream(bulkPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl2) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let card: ScryfallCard;
    try {
      card = JSON.parse(trimmed) as ScryfallCard;
    } catch {
      continue;
    }
    const result = mergeScryfallCardIntoSeed(card, byKey, finishes, artByKey, {
      titlesOnlyCatalogueLangs: false,
    });
    if (result === "kept") {
      const lang = normalizeScryfallLang(card.lang);
      if (lang) langsSeen.add(lang);
    }
  }

  const unique = [...byKey.values()];
  const written = index.writePrints(unique);

  const finDir = path.dirname(finishesPath());
  mkdirSync(finDir, { recursive: true });
  writeFileSync(finishesPath(), JSON.stringify(finishes, null, 2) + "\n");
  writeFileSync(artUrlsPath(), JSON.stringify(artByKey, null, 2) + "\n");

  let artUrlCount = 0;
  for (const byLang of Object.values(artByKey)) {
    artUrlCount += Object.keys(byLang).length;
  }

  return {
    prints: written.prints,
    titles: written.titles,
    artUrls: artUrlCount,
    langs: langsSeen.size,
    skipped,
  };
}

/** Patch `cards-index.json` langs.*.artUrl from the seed map. */
export function applyMtgScryfallArtUrls(): { patched: number } {
  if (!existsSync(artUrlsPath())) return { patched: 0 };
  const raw = JSON.parse(readFileSync(artUrlsPath(), "utf8")) as Record<
    string,
    Record<string, string> | string
  >;
  const indexPath = packCardsIndexPath(MTG_PACK_ID);
  if (!existsSync(indexPath)) return { patched: 0 };
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    cards: Record<
      string,
      { langs?: Record<string, { art?: string; artUrl?: string; name?: string }> }
    >;
  };
  let patched = 0;
  for (const [printKey, langsOrUrl] of Object.entries(raw)) {
    const entry = index.cards[printKey];
    if (!entry?.langs) continue;
    const byLang: Record<string, string> =
      typeof langsOrUrl === "string" ? { en: langsOrUrl } : langsOrUrl;
    for (const [lang, url] of Object.entries(byLang)) {
      if (!url?.trim()) continue;
      const slot = entry.langs[lang] ?? {};
      if (slot.art?.trim()) continue; // local file wins
      if (slot.artUrl === url) continue;
      slot.artUrl = url;
      entry.langs[lang] = slot;
      patched += 1;
    }
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  return { patched };
}
