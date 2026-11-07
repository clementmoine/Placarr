/**
 * Fullset.fr set labels stored in `pack_documents` for packs without a
 * `sets` table (YGO / MTG). Pokémon overlays TCGdex `sets.name` instead.
 */
import { existsSync, readFileSync } from "node:fs";

import {
  readPackDocument,
  writePackDocument,
} from "@/providers/shared/sealedProducts/productsSqlite";

import { fullsetSetsLedgerReadPath } from "./harvestSets";
import {
  normalizeFullsetSetRef,
  type FullsetSetsLedger,
} from "./parseSets";

export const FULLSET_SET_LABELS_DOC_KEY = "fullset-set-labels";

export type FullsetSetLabelRow = {
  nameFr: string;
  nameEn: string | null;
  fullsetId: string;
};

export type FullsetSetLabelsDoc = {
  version: 1;
  observed: string;
  source: string;
  /** Lowercase set code → labels. */
  byCode: Record<string, FullsetSetLabelRow>;
};

function readLedger(filePath: string): FullsetSetsLedger | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as FullsetSetsLedger;
    if (!raw || !Array.isArray(raw.sets)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Build + persist label map from a harvested Fullset ledger. */
export function installFullsetSetLabelsFromLedger(
  packId: string,
  ledger: FullsetSetsLedger,
  opts?: { dbPath?: string },
): { codes: number } {
  const byCode: Record<string, FullsetSetLabelRow> = {};
  for (const row of ledger.sets) {
    const ref = normalizeFullsetSetRef(row.ref);
    if (!ref) continue;
    const code = ref.toLowerCase();
    byCode[code] = {
      nameFr: row.nameFr.trim(),
      nameEn: row.nameEn?.trim() || null,
      fullsetId: row.fullsetId,
    };
  }
  const doc: FullsetSetLabelsDoc = {
    version: 1,
    observed: ledger.observed,
    source: ledger.source,
    byCode,
  };
  writePackDocument(packId, FULLSET_SET_LABELS_DOC_KEY, doc, {
    dbPath: opts?.dbPath,
  });
  return { codes: Object.keys(byCode).length };
}

/** Load ledger from disk and install into pack_documents. */
export function installFullsetSetLabelsFromDisk(
  packId: string,
  opts?: { ledgerPath?: string; dbPath?: string },
): { codes: number } | null {
  const ledger = readLedger(
    opts?.ledgerPath ?? fullsetSetsLedgerReadPath(packId),
  );
  if (!ledger) return null;
  return installFullsetSetLabelsFromLedger(packId, ledger, opts);
}

export function readFullsetSetLabels(
  packId: string,
  opts?: { dbPath?: string },
): FullsetSetLabelsDoc | null {
  const raw = readPackDocument<FullsetSetLabelsDoc>(
    packId,
    FULLSET_SET_LABELS_DOC_KEY,
    opts,
  );
  if (!raw || raw.version !== 1 || !raw.byCode) return null;
  return raw;
}

/**
 * Label for a set code. Prefers FR when `language` is fr; else EN; else null
 * (caller falls back to uppercase code).
 */
export function fullsetSetLabel(
  packId: string,
  setCode: string,
  language?: string | null,
  opts?: { dbPath?: string },
): string | null {
  const code = setCode.trim().toLowerCase();
  if (!code) return null;
  const doc = readFullsetSetLabels(packId, opts);
  const row = doc?.byCode[code];
  if (!row) return null;
  const lang = (language ?? "").trim().toLowerCase();
  if (lang.startsWith("fr") && row.nameFr) return row.nameFr;
  if (row.nameEn) return row.nameEn;
  if (row.nameFr) return row.nameFr;
  return null;
}
