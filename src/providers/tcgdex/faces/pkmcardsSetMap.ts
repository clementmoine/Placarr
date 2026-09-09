/**
 * Map pkmcards official abbr (`pbl`) → local Live stem (`me5`).
 *
 * TCGdex `officialAbbr` + on-disk `data/pokemon/cards/` decide the folder.
 * No inventing stems: unmapped abbr → null (honest skip).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { packCardsDir, packStagingDir } from "@/lib/packPaths";

export type PkmcardsSetResolve = {
  abbr: string;
  tcgdexId: string | null;
  liveStem: string | null;
};

type LogoSet = {
  id?: string;
  officialAbbr?: string | null;
};

function liveStems(cardsRoot: string): Set<string> {
  if (!existsSync(cardsRoot)) return new Set();
  return new Set(
    readdirSync(cardsRoot).filter((name) => {
      try {
        return statSync(path.join(cardsRoot, name)).isDirectory();
      } catch {
        return false;
      }
    }),
  );
}

function tcgdexIdCandidates(id: string): string[] {
  const raw = id.trim().toLowerCase();
  const dotted = raw.replace(/\./g, "-");
  const out = new Set<string>([raw, dotted, raw.replace(/\./g, "")]);
  // me05 → me5, sv05 → sv5 (Live folder convention)
  const me = /^me0(\d+)$/.exec(dotted);
  if (me) out.add(`me${me[1]}`);
  const sv = /^sv0(\d+)$/.exec(dotted);
  if (sv) out.add(`sv${sv[1]}`);
  const meDot = /^me0(\d+)/.exec(dotted);
  if (meDot) out.add(dotted.replace(/^me0/, "me"));
  return [...out];
}

function loadLogoSets(): LogoSet[] {
  const file = path.join(packStagingDir("pokemon"), "tcgdex-set-logos.json");
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      sets?: LogoSet[];
    };
    return Array.isArray(raw.sets) ? raw.sets : [];
  } catch {
    return [];
  }
}

/**
 * Build abbr → live stem once per process / cardsRoot.
 */
export function buildPkmcardsAbbrToLiveStem(
  cardsRoot = packCardsDir("pokemon"),
): Map<string, PkmcardsSetResolve> {
  const live = liveStems(cardsRoot);
  const map = new Map<string, PkmcardsSetResolve>();

  for (const set of loadLogoSets()) {
    const abbr = set.officialAbbr?.trim().toLowerCase();
    if (!abbr) continue;
    const tcgdexId = typeof set.id === "string" ? set.id : null;
    const candidates = [
      abbr,
      ...(tcgdexId ? tcgdexIdCandidates(tcgdexId) : []),
    ];
    const liveStem = candidates.find((c) => live.has(c)) ?? null;
    map.set(abbr, { abbr, tcgdexId, liveStem });
  }

  // Abbr that already matches a Live folder even without a logo row.
  for (const stem of live) {
    if (!map.has(stem)) {
      map.set(stem, { abbr: stem, tcgdexId: null, liveStem: stem });
    }
  }

  return map;
}

export function resolvePkmcardsAbbrToLiveStem(
  abbr: string,
  cardsRoot = packCardsDir("pokemon"),
  cache?: Map<string, PkmcardsSetResolve>,
): string | null {
  const key = abbr.trim().toLowerCase();
  if (!key) return null;
  const table = cache ?? buildPkmcardsAbbrToLiveStem(cardsRoot);
  return table.get(key)?.liveStem ?? (liveStems(cardsRoot).has(key) ? key : null);
}
