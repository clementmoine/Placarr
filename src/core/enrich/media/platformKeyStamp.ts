import { deriveAttachmentPlatformKeyFromUrl } from "@/core/enrich/media/attachmentDisplayScore";
import {
  detectVideoGamePlatformKey,
  isVideoGamePlatformKey,
  type VideoGamePlatformKey,
} from "@/core/identify/platforms/platforms";
import type { MetadataAttachment, MetadataResult } from "@/types/metadataProvider";

export function normalizeVideoGamePlatformKey(
  value?: string | null,
): VideoGamePlatformKey | undefined {
  if (!value) return undefined;
  if (isVideoGamePlatformKey(value)) return value;
  return detectVideoGamePlatformKey(value);
}

/**
 * Stamp a fallback platform key onto attachments that lack one, except strict
 * shelf-platform catalog sources whose remote URL no longer carries a signal
 * (localized /uploads paths).
 */
export function stampAttachmentsMissingPlatformKey<T extends MetadataAttachment>(
  attachments: readonly T[],
  fallbackPlatformKey?: string | null,
): T[] {
  const normalized = normalizeVideoGamePlatformKey(fallbackPlatformKey);
  if (!normalized) return [...attachments];
  return attachments.map((attachment) => {
    if (attachment.platformKey) return attachment;
    const explicitPlatform =
      (attachment.title
        ? detectVideoGamePlatformKey(attachment.title)
        : undefined) ??
      (attachment.role
        ? detectVideoGamePlatformKey(attachment.role)
        : undefined);
    if (explicitPlatform && explicitPlatform !== normalized) return attachment;
    if (
      attachment.strictShelfPlatformCoverSource === true &&
      !deriveAttachmentPlatformKeyFromUrl(attachment.url)
    ) {
      return attachment;
    }
    return { ...attachment, platformKey: normalized };
  });
}

/** Stamp a resolved platform key onto attachments that do not already have one. */
export function stampAttachmentPlatformKeys<T extends MetadataAttachment>(
  attachments: readonly T[] | undefined,
  platformKey?: string | null,
): T[] | undefined {
  if (!attachments?.length) return attachments as T[] | undefined;
  const normalized = normalizeVideoGamePlatformKey(platformKey);
  if (!normalized) return [...attachments];
  return attachments.map((attachment) =>
    attachment.platformKey
      ? attachment
      : { ...attachment, platformKey: normalized },
  );
}

/** Ensure metadata and its attachments share the same resolved platform key. */
export function withMetadataPlatformKeys(
  metadata: MetadataResult,
  platformKey?: string | null,
): MetadataResult {
  const resolved =
    normalizeVideoGamePlatformKey(platformKey) ??
    normalizeVideoGamePlatformKey(metadata.platformKey);
  if (!resolved) return metadata;
  return {
    ...metadata,
    platformKey: metadata.platformKey ?? resolved,
    attachments: stampAttachmentPlatformKeys(metadata.attachments, resolved),
  };
}

/** Resolve a game cover platform from request context and product signals. */
export function resolveGameAttachmentPlatformKey(input: {
  requestedPlatform?: string | null;
  shelfName?: string | null;
  title?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
}): VideoGamePlatformKey | undefined {
  const explicitRequested = normalizeVideoGamePlatformKey(
    input.requestedPlatform,
  );
  const fromTitle = input.title
    ? detectVideoGamePlatformKey(input.title)
    : undefined;
  const fromProductUrl = deriveAttachmentPlatformKeyFromUrl(input.productUrl);
  const fromImageUrl = deriveAttachmentPlatformKeyFromUrl(input.imageUrl);

  // Product URL/image/title win over request context. Shelf inference is
  // intentionally excluded: a retailer hit with an ambiguous slug must not inherit
  // psvita from the shelf and masquerade as a Vita cover.
  if (fromProductUrl) return fromProductUrl;
  if (fromImageUrl) return fromImageUrl;
  if (fromTitle) return fromTitle;
  return explicitRequested;
}

/** Map a list of provider platform labels to a key when unambiguous. */
export function solePlatformKeyFromNames(
  names: readonly string[],
): VideoGamePlatformKey | undefined {
  const keys = new Set<VideoGamePlatformKey>();
  for (const name of names) {
    const key = detectVideoGamePlatformKey(name);
    if (key) keys.add(key);
  }
  return keys.size === 1 ? [...keys][0] : undefined;
}
