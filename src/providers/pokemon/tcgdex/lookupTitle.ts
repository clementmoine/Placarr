/**
 * Set+num title lookup against local `prints.sqlite` (TCGdex harvest).
 *
 * Used by Live cards-index rebuild to name McDo / Black Star tiles that are
 * absent or gappy in `catalog.sqlite` live_cards. Matching is numeric on
 * `local_id` (folder `001` ↔ `1` / `BW29` / `SM108`).
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { liveSetToTcgdexSets } from "@/effects/pokemon/setAliases";
import type { ResolvedIndexTitle } from "@/providers/shared/cardCatalogue/attachIndexTitles";

export type TcgdexTitleHit = {
  setId: string;
  localId: string;
  lang: string;
  name: string;
};

export type TcgdexNameLookup = {
  /** `${setId}\0${numericLocalId}` → titles by lang (then any). */
  bySetNum: Map<string, TcgdexTitleHit[]>;
};

function digitsOnly(raw: string): string | null {
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  // Strip leading zeros but keep a lone zero.
  const n = digits.replace(/^0+(?=\d)/, "");
  return n || "0";
}

function setNumKey(setId: string, numericLocalId: string): string {
  return `${setId.toLowerCase()}\0${numericLocalId}`;
}

/** Soft-empty when `prints.sqlite` is missing or has no prints table. */
export function loadTcgdexNameLookup(dbPath: string): TcgdexNameLookup {
  const bySetNum = new Map<string, TcgdexTitleHit[]>();
  if (!existsSync(dbPath)) return { bySetNum };

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const has = db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='prints'`,
      )
      .get() as { ok?: number } | undefined;
    if (!has?.ok) return { bySetNum };

    const rows = db
      .prepare(
        `SELECT p.set_id AS setId, p.local_id AS localId,
                t.lang AS lang, t.name AS name
           FROM prints p
           JOIN print_titles t ON t.print_key = p.print_key`,
      )
      .all() as TcgdexTitleHit[];

    for (const row of rows) {
      const setId = String(row.setId ?? "")
        .trim()
        .toLowerCase();
      const localId = String(row.localId ?? "").trim();
      const lang = String(row.lang ?? "")
        .trim()
        .toLowerCase();
      const name = String(row.name ?? "").trim();
      if (!setId || !localId || !lang || !name) continue;
      const numeric = digitsOnly(localId);
      if (!numeric) continue;
      const key = setNumKey(setId, numeric);
      const list = bySetNum.get(key) ?? [];
      list.push({ setId, localId, lang, name });
      bySetNum.set(key, list);
    }
  } finally {
    db.close();
  }
  return { bySetNum };
}

/**
 * Candidate TCGdex set ids for a Live catalogue folder stem.
 * Always includes the stem itself (McDo years are identity), then aliases,
 * plus `${stem}-fr` for year McDo when asking French.
 */
export function tcgdexSetCandidatesForLiveStem(
  liveSet: string,
  wantLang: string,
): string[] {
  const stem = liveSet.trim().toLowerCase();
  if (!stem) return [];
  const out: string[] = [stem];
  const aliased = liveSetToTcgdexSets().get(stem) ?? [];
  for (const id of aliased) {
    const low = id.trim().toLowerCase();
    if (low && !out.includes(low)) out.push(low);
  }
  if (wantLang === "fr" && /^\d{4}/.test(stem)) {
    const fr = `${stem}-fr`;
    if (!out.includes(fr)) out.push(fr);
  }
  return out;
}

function pickTitle(
  hits: readonly TcgdexTitleHit[],
  wantLang: string,
): { name: string; lang: string } | null {
  const want = wantLang.toLowerCase();
  const exact = hits.find((h) => h.lang === want);
  if (exact) return { name: exact.name, lang: exact.lang };
  const en = hits.find((h) => h.lang === "en");
  if (en) return { name: en.name, lang: en.lang };
  const any = hits[0];
  return any ? { name: any.name, lang: any.lang } : null;
}

/**
 * Resolve a Live bundle stem (`2011bw_en_001`, `bwbsp_fr_029`) against TCGdex.
 */
export function resolveTcgdexIndexName(
  stem: string,
  lookup: TcgdexNameLookup,
): ResolvedIndexTitle | null {
  const m = /^([a-z0-9.-]+)_([a-z]{2,4})_(\d{3})(?:_[a-z]+)?$/i.exec(
    stem.trim(),
  );
  if (!m) return null;
  const liveSet = m[1]!.toLowerCase();
  const lang = m[2]!.toLowerCase();
  const numeric = digitsOnly(m[3]!);
  if (!numeric) return null;

  for (const setId of tcgdexSetCandidatesForLiveStem(liveSet, lang)) {
    const hits = lookup.bySetNum.get(setNumKey(setId, numeric)) ?? [];
    if (!hits.length) continue;
    const picked = pickTitle(hits, lang);
    if (!picked) continue;
    if (picked.lang === lang) {
      return {
        kind: "fallback",
        name: picked.name,
        catalogue: "show",
        from: "tcgdex",
      };
    }
    return {
      kind: "fallback",
      name: picked.name,
      catalogue: "show",
      from: picked.lang,
    };
  }
  return null;
}
