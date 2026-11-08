/**
 * Normalize / merge sealed-product GTINs (EAN / UPC / JAN / GTIN).
 *
 * Ledger digs already carry `ean`/`upc`/`jan`/`barcode`; ingest used to drop
 * them. These helpers are the single gate before `SealedProductEntry.barcodes`
 * and the sqlite `product_barcodes` index.
 */
import {
  barcodeMatchKey,
  normalizeProductBarcode,
} from "@/core/identify/normalize";

/** Ledger / dig field names that may hold a retail GTIN. */
const LEDGER_BARCODE_FIELDS = [
  "ean",
  "upc",
  "jan",
  "gtin",
  "barcode",
] as const;

/**
 * GS1 / EAN check digit (mod-10, weights 3/1 from the right of the body).
 * Applies to EAN-8, UPC-A (12), EAN-13, GTIN-14.
 */
export function gs1CheckDigitValid(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  const body = digits.slice(0, -1);
  const expected = Number(digits.slice(-1));
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  const calc = (10 - (sum % 10)) % 10;
  return calc === expected;
}

/**
 * ISSN serials encoded as EAN-13 use GS1 prefix 977 (often pasted as a
 * "GTIN" on CardGameClub / magazine digs). Valid check digit ≠ product barcode.
 */
export function isIssnShapedBarcode(digits: string): boolean {
  const key = barcodeMatchKey(digits);
  return Boolean(key && key.startsWith("977"));
}

/**
 * Digits-only sealed GTIN, or null when junk / bad check / ISSN-shaped.
 * Accepts standard lengths 8 / 12 / 13 / 14 only.
 *
 * Bandai product ledgers often store JAN as 13 digits + trailing `000`
 * (16 digits). Prefer the leading EAN-13 when that form checks out.
 */
export function normalizeSealedBarcode(raw?: string | null): string | null {
  // Digits only — do not use normalizeProductBarcode first: Bandai digs pad
  // JAN as 13+`000` (16 digits), which that helper rejects as too long.
  const digitsOnly =
    typeof raw === "string" || typeof raw === "number"
      ? String(raw).replace(/\D/g, "")
      : "";
  if (!digitsOnly) return null;
  const candidates =
    digitsOnly.length === 16 && digitsOnly.endsWith("000")
      ? [digitsOnly.slice(0, 13), digitsOnly]
      : [digitsOnly];
  for (const digits of candidates) {
    // Re-enter the shared cleaner for 8–14 shapes (leading-zero UPC, etc.).
    const cleaned = normalizeProductBarcode(digits) ?? digits;
    if (![8, 12, 13, 14].includes(cleaned.length)) continue;
    if (!gs1CheckDigitValid(cleaned)) continue;
    if (isIssnShapedBarcode(cleaned)) continue;
    return cleaned;
  }
  return null;
}

/** Prefer retail shapes: EAN-13 > UPC-A > GTIN-14 > EAN-8. */
function sealedBarcodeFormRank(digits: string): number {
  switch (digits.length) {
    case 13:
      return 4;
    case 12:
      return 3;
    case 14:
      return 2;
    case 8:
      return 1;
    default:
      return 0;
  }
}

/** Dedupe via {@link barcodeMatchKey}; keep the best retail form per key. */
export function mergeSealedBarcodes(
  existing: readonly (string | null | undefined)[] | null | undefined,
  incoming: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  const byKey = new Map<string, string>();
  for (const raw of [...(existing ?? []), ...(incoming ?? [])]) {
    const normalized = normalizeSealedBarcode(raw);
    if (!normalized) continue;
    const key = barcodeMatchKey(normalized);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || sealedBarcodeFormRank(normalized) > sealedBarcodeFormRank(prev)) {
      byKey.set(key, normalized);
    }
  }
  return [...byKey.values()];
}

/**
 * Pull candidate GTINs from a ledger / dig row (`ean`, `upc`, `jan`, `gtin`,
 * `barcode`). Invalid / ISSN-shaped values are dropped.
 */
export function collectBarcodesFromLedgerRow(
  row: Record<string, unknown>,
): string[] {
  const raw: string[] = [];
  for (const field of LEDGER_BARCODE_FIELDS) {
    const value = row[field];
    if (typeof value === "string" || typeof value === "number") {
      raw.push(String(value));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" || typeof item === "number") {
          raw.push(String(item));
        }
      }
    }
  }
  return mergeSealedBarcodes([], raw);
}

/** Match-key form stored in `product_barcodes.barcode` for O(1) lookup. */
export function sealedBarcodeIndexKey(raw?: string | null): string | null {
  const normalized = normalizeSealedBarcode(raw);
  if (!normalized) return null;
  const key = barcodeMatchKey(normalized);
  return key || null;
}
