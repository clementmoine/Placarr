import type { Requirement, TargetMode } from "./types";

export type RequirementInputRow = {
  /** Identité de ligne checklist (`printKey` ou `printKey|finish`). */
  rowId: string;
  printKey: string;
  finish?: string | null;
  /** Cote du print (partagée entre finitions en base-set). */
  priceCents: number | null;
  owned: boolean;
  rarity?: string | null;
};

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function normalizeRarity(value: string | null | undefined): string | null {
  const v = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  return v ? v : null;
}

/**
 * Construit les trous selon le mode.
 *
 * - **base-set** : un trou par `printKey` (toute finition accepte) ;
 *   prix = min des cotes des lignes de ce print.
 * - **master-set** : un trou par `rowId` (print×finish).
 *
 * `requiredCopies = 1`, seuls les manquants sont renvoyés.
 */
export function buildRequirements(input: {
  mode: TargetMode;
  rows: readonly RequirementInputRow[];
}): Requirement[] {
  if (input.mode === "master-set") {
    return input.rows
      .filter((row) => !row.owned)
      .map((row) => ({
        id: row.rowId,
        acceptedPrints: [row.printKey],
        requiredCopies: 1,
        ownedCopies: 0,
        priceCents: validPrice(row.priceCents),
        rarity: row.rarity ?? null,
      }));
  }

  const byPrint = new Map<
    string,
    { prices: number[]; anyMissing: boolean; rarity: string | null }
  >();
  for (const row of input.rows) {
    const key = row.printKey.trim();
    if (!key) continue;
    let bucket = byPrint.get(key);
    if (!bucket) {
      bucket = { prices: [], anyMissing: false, rarity: row.rarity ?? null };
      byPrint.set(key, bucket);
    }
    if (!row.owned) bucket.anyMissing = true;
    const price = validPrice(row.priceCents);
    if (price != null) bucket.prices.push(price);
  }

  const out: Requirement[] = [];
  for (const [printKey, bucket] of byPrint) {
    if (!bucket.anyMissing) continue;
    out.push({
      id: printKey,
      acceptedPrints: [printKey],
      requiredCopies: 1,
      ownedCopies: 0,
      priceCents: bucket.prices.length > 0 ? Math.min(...bucket.prices) : null,
      rarity: bucket.rarity,
    });
  }
  return out;
}

function validPrice(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}

type PriceRarityRef = {
  priceCents: number | null;
  rarity?: string | null;
};

/**
 * Médiane de rareté (sinon globale) parmi des cotes de référence.
 * `null` si aucune référence utilisable.
 */
export function imputePriceCents(input: {
  rarity?: string | null;
  reference: readonly PriceRarityRef[];
}): number | null {
  const byRarity = new Map<string, number[]>();
  const all: number[] = [];
  for (const row of input.reference) {
    const price = validPrice(row.priceCents);
    if (price == null) continue;
    all.push(price);
    const rarity = normalizeRarity(row.rarity);
    if (!rarity) continue;
    const bag = byRarity.get(rarity) ?? [];
    bag.push(price);
    byRarity.set(rarity, bag);
  }
  const rarity = normalizeRarity(input.rarity);
  const sameRarity = rarity ? median(byRarity.get(rarity) ?? []) : null;
  return sameRarity ?? median(all);
}

/**
 * Trous sans cote → médiane des cotes de **même rareté** (sur tout le set,
 * possédées comprises), sinon médiane globale. Marqués `priceImputed`.
 * Sans aucune cote de référence : le trou reste `null` (exclu, flag).
 */
export function imputeRequirementPrices(input: {
  requirements: readonly Requirement[];
  /** Référence : toutes les lignes du set avec leur cote et rareté. */
  reference: readonly PriceRarityRef[];
}): Requirement[] {
  return input.requirements.map((req) => {
    if (req.priceCents != null) return req;
    const imputed = imputePriceCents({
      rarity: req.rarity,
      reference: input.reference,
    });
    if (imputed == null) return req;
    return { ...req, priceCents: imputed, priceImputed: true };
  });
}
