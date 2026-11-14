/**
 * Lorcast `/v0/sets` → local `code → name` ledger.
 *
 * Written during gap-fill; checklist promo labels prefer these names when the
 * official Companion has no promo series (P1, DIS, Coconut…).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import type { LorcastSet } from "./catalogue";

export type LorcastSetsLedger = {
  version: 1;
  updatedAt: string;
  /** Uppercased set code → display name. */
  byCode: Record<string, string>;
};

export function lorcastSetsLedgerPath(root: string = dataRoot()): string {
  return path.join(root, "lorcana", "lorcast-sets.json");
}

export function readLorcastSetsLedger(
  ledgerPath: string = lorcastSetsLedgerPath(),
): LorcastSetsLedger {
  if (!existsSync(ledgerPath)) {
    return { version: 1, updatedAt: new Date(0).toISOString(), byCode: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(ledgerPath, "utf8")) as Partial<
      LorcastSetsLedger
    >;
    if (raw?.version !== 1 || !raw.byCode || typeof raw.byCode !== "object") {
      return { version: 1, updatedAt: new Date(0).toISOString(), byCode: {} };
    }
    const byCode: Record<string, string> = {};
    for (const [code, name] of Object.entries(raw.byCode)) {
      const key = code.trim().toUpperCase();
      const label = typeof name === "string" ? name.trim() : "";
      if (key && label) byCode[key] = label;
    }
    return {
      version: 1,
      updatedAt:
        typeof raw.updatedAt === "string"
          ? raw.updatedAt
          : new Date(0).toISOString(),
      byCode,
    };
  } catch {
    return { version: 1, updatedAt: new Date(0).toISOString(), byCode: {} };
  }
}

/** Uppercased code → name (empty when ledger absent). */
export function readLorcastSetNameMap(
  ledgerPath: string = lorcastSetsLedgerPath(),
): Map<string, string> {
  const { byCode } = readLorcastSetsLedger(ledgerPath);
  return new Map(Object.entries(byCode));
}

export function writeLorcastSetsLedger(
  sets: readonly LorcastSet[],
  ledgerPath: string = lorcastSetsLedgerPath(),
): LorcastSetsLedger {
  const byCode: Record<string, string> = {};
  for (const set of sets) {
    const code = set.code.trim().toUpperCase();
    const name = set.name?.trim() ?? "";
    if (!code || !name) continue;
    byCode[code] = name;
  }
  const ledger: LorcastSetsLedger = {
    version: 1,
    updatedAt: new Date().toISOString(),
    byCode,
  };
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return ledger;
}

/**
 * Lorcast display name for a promo/set code, or null when absent / tautological.
 *
 * `CP` (Challenge Promo) aliases `C1` — same nine cards, different numbering.
 */
export function lorcastSetDisplayName(
  code: string,
  setNames: ReadonlyMap<string, string>,
): string | null {
  const key = code.trim().toUpperCase();
  if (!key) return null;
  const direct = setNames.get(key)?.trim() || "";
  const aliased =
    !direct && key === "C1" ? setNames.get("CP")?.trim() || "" : "";
  const name = direct || aliased;
  if (!name) return null;
  // Lorcast sometimes ships `PD1` as both code and name — not a real label.
  if (name.toUpperCase() === key) return null;
  return name;
}
