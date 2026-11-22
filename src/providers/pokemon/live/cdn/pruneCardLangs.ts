/**
 * Drop Live card trees for locales outside the wanted set.
 *
 * Only the Live dump layout `data/pokemon/cards/{set}/{lang}/{num}/…` is
 * pruned: a full six-locale dump is tens of GB. Paper harvests sit lang-first
 * (`cards/{lang}/{set}/…`) in the same folder and are never touched — read
 * as set-first, `fr/2012bw` looked like set `fr` + locale `2012bw`, and the
 * whole paper corpus was deleted at the end of a Live Sync.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

export type PrunePokemonCardLangsResult = {
  removedDirs: number;
  removedBytes: number;
  keptLangs: string[];
  removedLangs: string[];
};

function dirBytes(root: string): number {
  let total = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        total += statSync(full).size;
      } catch {
        /* race */
      }
    }
  }
  return total;
}

function looksLikeLang(name: string): boolean {
  return /^(?:[a-z]{2}(?:-[a-z]{2})?|ptbr)$/i.test(name.trim());
}

/**
 * Top-level `cards/` entry that is a language (lang-first paper tree), not a
 * set: locale-shaped name whose children are sets, not locales (`ec/fr/…`
 * is the e-Card set, `fr/2012bw/…` is the French paper tree).
 */
function isLangFirstRoot(dir: string, name: string): boolean {
  if (!looksLikeLang(name)) return false;
  try {
    return !readdirSync(dir).some((child) => looksLikeLang(child));
  } catch {
    return true;
  }
}

export function pokemonCardsRoot(repoRoot = dataRoot()): string {
  return path.join(repoRoot, "pokemon", "cards");
}

/**
 * Delete `cards/{set}/{lang}` when `lang` is not in `keepLangs`.
 * Unknown / empty keep list → no-op (never wipe the tree by accident).
 */
export function prunePokemonCardLangs(input: {
  keepLangs: readonly string[];
  cardsRoot?: string;
  /** When false, only report what would be removed. */
  apply?: boolean;
}): PrunePokemonCardLangsResult {
  const keep = new Set(
    input.keepLangs.map((l) => l.trim().toLowerCase()).filter(Boolean),
  );
  const empty: PrunePokemonCardLangsResult = {
    removedDirs: 0,
    removedBytes: 0,
    keptLangs: [...keep].sort(),
    removedLangs: [],
  };
  if (keep.size === 0) return empty;

  const root = input.cardsRoot ?? pokemonCardsRoot();
  if (!existsSync(root)) return empty;

  const apply = input.apply !== false;
  const removedLangs = new Set<string>();
  let removedDirs = 0;
  let removedBytes = 0;

  for (const setName of readdirSync(root)) {
    const setDir = path.join(root, setName);
    if (isLangFirstRoot(setDir, setName)) continue;
    let setStat;
    try {
      setStat = statSync(setDir);
    } catch {
      continue;
    }
    if (!setStat.isDirectory()) continue;

    for (const langName of readdirSync(setDir)) {
      const lang = langName.trim().toLowerCase();
      if (!lang || keep.has(lang)) continue;
      const langDir = path.join(setDir, langName);
      let langStat;
      try {
        langStat = statSync(langDir);
      } catch {
        continue;
      }
      if (!langStat.isDirectory()) continue;

      // Byte walk is expensive on multi-GB trees — skip when deleting.
      if (!apply) removedBytes += dirBytes(langDir);
      removedLangs.add(lang);
      removedDirs += 1;
      if (apply) {
        rmSync(langDir, { recursive: true, force: true });
      }
    }
  }

  return {
    removedDirs,
    removedBytes,
    keptLangs: [...keep].sort(),
    removedLangs: [...removedLangs].sort(),
  };
}
