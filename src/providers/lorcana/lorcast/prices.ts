/**
 * Lorcast USD parsing + gap-fill price ledger.
 *
 * The set-cards catalogue already ships `prices` / `tcgplayer_id`, but the art
 * gap-fill path used to drop them. Persist fill rows so barcode price refresh
 * can serve USD without a second HTTP round-trip for Lorcast-only prints.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

export type LorcastUsdPrices = {
  /** Market USD in cents. */
  usd: number | null;
  /** Foil market USD in cents. */
  usdFoil: number | null;
};

export type LorcastFillPriceRow = {
  printKey: string;
  setCode: string;
  collectorNumber: string;
  name: string;
  tcgplayerId: number | null;
  prices: LorcastUsdPrices;
};

export type LorcastFillPriceLedger = {
  version: 1;
  updatedAt: string;
  /** Keyed by printKey. */
  byPrintKey: Record<string, LorcastFillPriceRow>;
};

export function lorcastUsdToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return Math.round(value * 100);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100);
  }
  return null;
}

export function lorcastPricesFromRaw(raw: {
  usd?: unknown;
  usd_foil?: unknown;
} | null | undefined): LorcastUsdPrices {
  return {
    usd: lorcastUsdToCents(raw?.usd),
    usdFoil: lorcastUsdToCents(raw?.usd_foil),
  };
}

export function lorcastFillPriceLedgerPath(
  root: string = dataRoot(),
): string {
  return path.join(root, "lorcana", "lorcast-fill-prices.json");
}

export function readLorcastFillPriceLedger(
  ledgerPath: string = lorcastFillPriceLedgerPath(),
): LorcastFillPriceLedger {
  if (!existsSync(ledgerPath)) {
    return { version: 1, updatedAt: new Date(0).toISOString(), byPrintKey: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(ledgerPath, "utf8")) as Partial<
      LorcastFillPriceLedger
    >;
    if (raw?.version !== 1 || !raw.byPrintKey || typeof raw.byPrintKey !== "object") {
      return {
        version: 1,
        updatedAt: new Date(0).toISOString(),
        byPrintKey: {},
      };
    }
    return {
      version: 1,
      updatedAt:
        typeof raw.updatedAt === "string"
          ? raw.updatedAt
          : new Date(0).toISOString(),
      byPrintKey: raw.byPrintKey,
    };
  } catch {
    return { version: 1, updatedAt: new Date(0).toISOString(), byPrintKey: {} };
  }
}

export function writeLorcastFillPriceLedger(
  rows: readonly LorcastFillPriceRow[],
  ledgerPath: string = lorcastFillPriceLedgerPath(),
): LorcastFillPriceLedger {
  const prev = readLorcastFillPriceLedger(ledgerPath);
  const byPrintKey = { ...prev.byPrintKey };
  for (const row of rows) {
    if (row.prices.usd == null && row.prices.usdFoil == null) continue;
    byPrintKey[row.printKey] = row;
  }
  const ledger: LorcastFillPriceLedger = {
    version: 1,
    updatedAt: new Date().toISOString(),
    byPrintKey,
  };
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return ledger;
}

export function lorcastFillPriceRowForPrint(input: {
  printKey: string;
  setCode: string;
  collectorNumber: string;
  name: string;
  tcgplayerId: number | null;
  prices: LorcastUsdPrices;
}): LorcastFillPriceRow | null {
  if (input.prices.usd == null && input.prices.usdFoil == null) return null;
  return {
    printKey: input.printKey,
    setCode: input.setCode,
    collectorNumber: input.collectorNumber,
    name: input.name,
    tcgplayerId: input.tcgplayerId,
    prices: input.prices,
  };
}
