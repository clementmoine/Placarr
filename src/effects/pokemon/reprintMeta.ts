/**
 * Generated reprint hints for TCGdex Shiny Vault splits (`*sv`).
 * @see data/pokemon/reprintMeta.json — regenerate via audit-map `--write-reprint-meta`.
 */

import { loadReprintMeta } from "@/lib/foilMetaLoad";

export type ReprintMetaEntry = {
  parentTcgdex: string;
  parentLive: string;
  /** Live num = svOffset + SV# (SV001 → offset+1). */
  svOffset: number;
  parentCardTotal: number;
  vaultCardTotal: number;
};

export type ReprintMetaFile = {
  generatedAt: string;
  source: string;
  byTcgdexSet: Record<string, ReprintMetaEntry>;
};

function meta(): ReprintMetaFile {
  const raw = loadReprintMeta() as Partial<ReprintMetaFile>;
  return {
    generatedAt: raw.generatedAt ?? "",
    source: raw.source ?? "",
    byTcgdexSet: raw.byTcgdexSet ?? {},
  };
}

export function reprintMetaForTcgdexSet(
  setId: string | null | undefined,
): ReprintMetaEntry | null {
  const raw = setId?.trim().toLowerCase() ?? "";
  if (!raw) return null;
  return meta().byTcgdexSet[raw] ?? null;
}

export function listReprintMetaSets(): string[] {
  return Object.keys(meta().byTcgdexSet).sort();
}
