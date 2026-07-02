import type {
  BarcodeLookupType,
  BarcodeSourceContext,
  BarcodeSourceContribution,
} from "@/types/providerModule";
import type { SourceProduct } from "@/lib/barcode/evidence/types";

/**
 * Shared `buildBarcodeSources` helpers for marketplace/aggregator providers,
 * which contribute their listings to SEVERAL media types under different scoping
 * rules. A leaf module (no registry import) so provider modules can use it
 * without a cycle. The scoping mirrors the former central assembler exactly.
 */

/**
 * Marketplace listings disambiguate the item type, so they feed every media type
 * the scan could plausibly be: the requested type, or — when the type is unknown
 * — all non-book types for a non-book barcode (and books only for an ISBN).
 * Mirrors `type === X ? listings : !isBook ? listings : []` (books: `type ===
 * "books" || (!type && isBook)`).
 */
export function marketplaceContributions(
  label: string,
  products: SourceProduct[],
  ctx: BarcodeSourceContext,
  types: readonly BarcodeLookupType[],
): BarcodeSourceContribution[] {
  if (!products.length) return [];
  const out: BarcodeSourceContribution[] = [];
  for (const mediaType of types) {
    const applies =
      mediaType === "books"
        ? ctx.type === "books" || (!ctx.type && ctx.isBook)
        : ctx.type === mediaType || !ctx.isBook;
    if (applies) out.push({ mediaType, label, products });
  }
  return out;
}

/**
 * Aggregator (e.g. LeDenicheur) listings: fed to a type only when it's the
 * requested type, or — when the type is UNKNOWN — the one type matching the
 * barcode's book-ness. Mirrors `type === X || (!type && <bookness>)`.
 */
export function gatedContributions(
  label: string,
  products: SourceProduct[],
  ctx: BarcodeSourceContext,
  types: readonly BarcodeLookupType[],
): BarcodeSourceContribution[] {
  if (!products.length) return [];
  const out: BarcodeSourceContribution[] = [];
  for (const mediaType of types) {
    const matchesUnknown =
      !ctx.type && (mediaType === "books" ? ctx.isBook : !ctx.isBook);
    if (ctx.type === mediaType || matchesUnknown) {
      out.push({ mediaType, label, products });
    }
  }
  return out;
}

/**
 * Per-type scoped lists (e.g. ChasseAuxLivres' category feeds): the explicit
 * per-type list when that type is requested, the generic list when the type is
 * unknown, else nothing. Mirrors the former `pickProductsForScope`.
 */
export function scopedContribution<T extends SourceProduct>(
  label: string,
  mediaType: BarcodeLookupType,
  explicit: T[],
  generic: T[],
  ctx: BarcodeSourceContext,
): BarcodeSourceContribution[] {
  let products: T[] = [];
  if (ctx.type === mediaType) products = explicit;
  else if (!ctx.type && !ctx.isBook) products = generic;
  else if (!ctx.type && mediaType === "books" && ctx.isBook) products = generic;
  if (!products.length) return [];
  return [{ mediaType, label, products }];
}
