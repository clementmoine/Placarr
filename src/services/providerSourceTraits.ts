import { PROVIDERS } from "@/services/providerRegistry";

/**
 * Provider-blind cover traits for an attachment `source`.
 *
 * The display scorer (`@/lib/attachmentDisplayScore`) is imported client-side and
 * must not pull in the provider registry, so it cannot read provider-declared
 * cover traits directly. Instead the server stamps those traits onto each
 * attachment (flag-on-attachment) using the helpers here, and the scorer reads
 * the booleans. Keeping the source→trait mapping registry-derived (no provider
 * literals) is what makes the scorer pass the provider-blind guard.
 */

// Canonical provider id for each known `source` token: the provider id itself
// plus any aliases it declares (e.g. a short marketplace handle).
const PROVIDER_ID_BY_SOURCE = new Map<string, string>();
for (const provider of PROVIDERS) {
  PROVIDER_ID_BY_SOURCE.set(provider.id.toLowerCase(), provider.id);
  for (const alias of provider.sourceAliases ?? []) {
    PROVIDER_ID_BY_SOURCE.set(alias.toLowerCase(), provider.id);
  }
}

const REAL_BOX_COVER_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.isRealBoxCover).map(
    (provider) => provider.id,
  ),
);

const FULL_WRAP_COVER_PROVIDER_IDS = new Set(
  PROVIDERS.filter((provider) => provider.fullWrapCover).map(
    (provider) => provider.id,
  ),
);

// Provider id → human display label (registry `info.label`). Used to stamp a
// gallery chip label onto attachments so the client-safe label formatter need
// not carry a provider-id→label map.
const PROVIDER_LABEL_BY_ID = new Map(
  PROVIDERS.map((provider) => [provider.id, provider.label]),
);

/**
 * Resolve an attachment `source` to its canonical provider id. Sources may be a
 * provider id, a declared alias, or carry a "· region" / "/ variant" suffix; the
 * suffix is dropped and the alias resolved. Unknown sources are returned
 * normalised (lower-cased, suffix-stripped) so non-provider tags pass through.
 */
export function canonicalProviderIdForSource(
  source?: string | null,
): string | null {
  if (!source) return null;
  const normalized = source.split(/[·/]/)[0].toLowerCase().trim();
  if (!normalized) return null;
  return PROVIDER_ID_BY_SOURCE.get(normalized) ?? normalized;
}

/**
 * Whether the source provider's cover depicts the real physical box
 * (provider-declared `isRealBoxCover` trait). Stamped onto attachments so the
 * scorer can award the box-cover bonus.
 */
export function isRealBoxCoverSource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && REAL_BOX_COVER_PROVIDER_IDS.has(id);
}

/**
 * Whether the source provider's covers are full front+back wraps
 * (provider-declared `fullWrapCover` trait), which the scorer penalises.
 */
export function isFullWrapCoverSource(source?: string | null): boolean {
  const id = canonicalProviderIdForSource(source);
  return id !== null && FULL_WRAP_COVER_PROVIDER_IDS.has(id);
}

/**
 * Human display label (registry `info.label`) for a provider source, or null for
 * a non-provider tag (barcode/merged/…) or an unknown source. Stamped onto
 * attachments so the gallery label formatter stays registry-free.
 */
export function providerLabelForSource(source?: string | null): string | null {
  const id = canonicalProviderIdForSource(source);
  return (id !== null && PROVIDER_LABEL_BY_ID.get(id)) || null;
}

/**
 * Stamp the provider-declared, registry-derived attachment fields (cover-scoring
 * flags + display label) onto an attachment so the client-safe display scorer
 * and label formatter can read them without importing the registry. Pure:
 * returns a new object, leaving the input untouched.
 */
export function withProviderAttachmentTraits<
  T extends { source?: string | null },
>(
  attachment: T,
): T & {
  isRealBoxCoverSource: boolean;
  isFullWrapCoverSource: boolean;
  providerLabel?: string;
} {
  return {
    ...attachment,
    isRealBoxCoverSource: isRealBoxCoverSource(attachment.source),
    isFullWrapCoverSource: isFullWrapCoverSource(attachment.source),
    providerLabel: providerLabelForSource(attachment.source) ?? undefined,
  };
}
