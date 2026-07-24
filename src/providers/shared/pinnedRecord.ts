/**
 * Shared helpers for metadata adapters that can refresh a known fiche
 * without re-seeking by title/barcode.
 */

export function pinnedProviderRecordUrl(
  ctx: {
    providerRecordUrls?: Record<string, string>;
  },
  providerId: string,
): string | undefined {
  const url = ctx.providerRecordUrls?.[providerId]?.trim();
  return url || undefined;
}

export function pinnedProviderRecordId(
  ctx: {
    externalIds?: Record<string, string | null>;
  },
  providerId: string,
): string | undefined {
  const id = ctx.externalIds?.[providerId]?.trim();
  return id || undefined;
}
