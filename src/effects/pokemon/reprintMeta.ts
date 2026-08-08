/**
 * Generated reprint hints for TCGdex Shiny Vault splits (`*sv`).
 * @see reprintMeta.json — regenerate via audit-map `--write-reprint-meta`.
 */

import reprintMetaJson from "./reprintMeta.json";

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

const META = reprintMetaJson as ReprintMetaFile;

export function reprintMetaForTcgdexSet(
  setId: string | null | undefined,
): ReprintMetaEntry | null {
  const raw = setId?.trim().toLowerCase() ?? "";
  if (!raw) return null;
  return META.byTcgdexSet[raw] ?? null;
}

export function listReprintMetaSets(): string[] {
  return Object.keys(META.byTcgdexSet).sort();
}
