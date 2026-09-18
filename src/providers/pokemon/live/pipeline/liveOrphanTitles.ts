/**
 * Curated titles for Live CDN stems that have art but no Malie / TCGdex name.
 *
 * Keep this ledger tiny — each entry needs a visual / official observation in
 * the JSON note. Prefer fixing upstream harvest when the gap closes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { ResolvedIndexTitle } from "@/providers/shared/cardCatalogue/attachIndexTitles";

export type LiveOrphanTitleRow = {
  en?: string;
  fr?: string;
};

export type LiveOrphanTitleLedger = {
  titles?: Readonly<Record<string, LiveOrphanTitleRow>>;
};

function curatedPath(): string {
  return path.join(
    process.cwd(),
    "src",
    "providers",
    "pokemontcglive",
    "curated",
    "sources",
    "live-orphan-titles.json",
  );
}

export function loadLiveOrphanTitles(
  filePath = curatedPath(),
): Readonly<Record<string, LiveOrphanTitleRow>> {
  try {
    const raw = JSON.parse(
      readFileSync(filePath, "utf8"),
    ) as LiveOrphanTitleLedger;
    return raw.titles ?? {};
  } catch {
    return {};
  }
}

/**
 * Resolve `set_lang_num` against the curated orphan ledger.
 * Exact stem first; then same set+num with the requested lang's title.
 */
export function resolveLiveOrphanIndexName(
  stem: string,
  titles: Readonly<Record<string, LiveOrphanTitleRow>> = loadLiveOrphanTitles(),
): ResolvedIndexTitle | null {
  const key = stem.trim().toLowerCase();
  if (!key) return null;

  const exact = titles[key];
  if (exact) {
    const m = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i.exec(key);
    const lang = m?.[2]?.toLowerCase() ?? "en";
    const localized =
      lang === "fr"
        ? exact.fr?.trim() || exact.en?.trim()
        : exact.en?.trim() || exact.fr?.trim();
    if (!localized) return null;
    if (lang === "fr" && exact.fr?.trim()) {
      return { kind: "attested", name: exact.fr.trim() };
    }
    if (lang === "en" && exact.en?.trim()) {
      return { kind: "attested", name: exact.en.trim() };
    }
    return {
      kind: "fallback",
      name: localized,
      catalogue: "show",
      from: exact.en?.trim() ? "en" : "fr",
    };
  }

  const m = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i.exec(key);
  if (!m) return null;
  const set = m[1]!.toLowerCase();
  const lang = m[2]!.toLowerCase();
  const num = m[3]!;
  const sibling = titles[`${set}_en_${num}`] ?? titles[`${set}_fr_${num}`];
  if (!sibling) return null;
  if (lang === "fr" && sibling.fr?.trim()) {
    return { kind: "attested", name: sibling.fr.trim() };
  }
  if (sibling.en?.trim()) {
    return lang === "en"
      ? { kind: "attested", name: sibling.en.trim() }
      : {
          kind: "fallback",
          name: sibling.en.trim(),
          catalogue: "show",
          from: "en",
        };
  }
  if (sibling.fr?.trim()) {
    return {
      kind: "fallback",
      name: sibling.fr.trim(),
      catalogue: "show",
      from: "fr",
    };
  }
  return null;
}
