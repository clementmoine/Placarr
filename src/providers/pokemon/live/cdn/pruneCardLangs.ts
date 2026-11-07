/**
 * Drop Live/paper card trees for locales outside the wanted set.
 *
 * Layout: `data/pokemon/cards/{set}/{lang}/{num}/…`. A full six-locale dump
 * is tens of GB; catalogue ingest only needs the languages we actually serve.
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
