/**
 * Media types identified by print rather than by barcode.
 *
 * Client-safe mirror of the registry: `providerRegistry` pulls native adapters
 * and cannot be imported from a `use client` component. `printSearchTypes.test`
 * keeps this list equal to the modules that implement `searchPrints`, so a new
 * game plugging in cannot silently leave the picker unreachable.
 */
export const PRINT_SEARCH_MEDIA_TYPES = ["tcg"] as const;

export function usesPrintSearch(type: string | null | undefined): boolean {
  if (!type) return false;
  return (PRINT_SEARCH_MEDIA_TYPES as readonly string[]).includes(type);
}
