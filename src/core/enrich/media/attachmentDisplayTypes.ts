import type { AttachmentType } from "@/generated/prisma/browser";
import { resolveAttachmentSemantics } from "@/core/enrich/media/attachmentDisplayLabels";
import type { LocalePreferenceOptions } from "@/core/locale/preference";

export interface AttachmentImageMetrics {
  width?: number;
  height?: number;
  format?: string;
  /** Average RGB luminance sampled from the asset (0–255). */
  meanLuminance?: number;
  /** Share of sampled pixels below the dark-luminance threshold. */
  darkPixelRatio?: number;
}

export type ScoredAttachmentInput = {
  type: AttachmentType;
  url: string;
  role?: string | null;
  source?: string | null;
  title?: string | null;
  providerLabel?: string | null;
  /**
   * Contributor source ids collected when several providers share this URL.
   * Display-only — formatted by `getAttachmentGalleryLabels`.
   */
  sourceNames?: string[] | null;
  /**
   * SteamGridDB-style cover sources — enables style/variant chip labels
   * in `getAttachmentGalleryLabels` (stamped via provider traits).
   */
  gridStyleCoverLabelsSource?: boolean;
  /**
   * Provider-declared cover traits, stamped server-side (the scorer is client-safe
   * and cannot read the registry). `isFullWrapCoverSource` marks a full front+back
   * wrap (penalised). See `@/core/catalog/sourceTraits`.
   */
  isFullWrapCoverSource?: boolean;
  strictShelfPlatformCoverSource?: boolean;
  /** Provider-declared game-media gallery source; kept visible on platform shelves. */
  isGameMediaGallerySource?: boolean;
  providerImageScoreAdjustment?: number;
  /**
   * Provider-declared, URL-derived source context of the image
   * (catalog / listing_photo / user_photo). Stamped server-side from
   * `ProviderInfo.coverProvenanceRules`; drives the provenance tier in
   * `rankCoversForDisplay` so a photographed copy ranks below catalog art of the
   * same region. See `@/core/enrich/media/coverProvenance`.
   */
  coverProvenance?: string | null;
  /**
   * Platform this cover belongs to, persisted at enrichment from the provider's
   * original image URL (before localization strips the signal). Read as an
   * authoritative platform signal by the mismatch/alignment detection so a
   * foreign-console cover is recognised even after its URL became a local path.
   * See the `platformKey` column in `prisma/schema.prisma`.
   */
  platformKey?: string | null;
};

import type { Locale } from "@/types/i18n";

export type AttachmentDisplayScoreOptions = LocalePreferenceOptions & {
  /** Shelf / requested game platform — boosts matching covers, penalises mismatches. */
  requestedPlatformKey?: string | null;
  uiLocale?: Locale | null;
  /**
   * Loose game copies: prefer disc / support art as the default cover instead of
   * the box front (display-time only — catalog metadata.imageUrl stays the box).
   */
  preferDiscCover?: boolean;
  /**
   * Loose hardware: prefer PriceCharting "System Only" / console shots over box
   * fronts (display-time only).
   */
  preferSystemOnlyCover?: boolean;
};

export interface AttachmentDisplayScoreDetails {
  score: number;
  signals: string[];
  width?: number;
  height?: number;
  aspectRatio?: number;
  format?: string;
}

export const DISPLAY_ATTACHMENT_BASE_SCORE: Partial<
  Record<AttachmentType, number>
> = {
  cover: 620,
  artwork: 430,
  image: 330,
  screenshot: 230,
  background: 190,
  logo: 120,
  audio: 20,
};

export const DISPLAY_COVER_PRIORITY_ORDER: AttachmentType[] = [
  "cover",
  "artwork",
  "image",
  "screenshot",
  "background",
  "logo",
];

export const COVER_FRIENDLY_TYPES = new Set<AttachmentType>([
  "cover",
  "artwork",
  "image",
]);

export function attachmentSemantics(attachment: ScoredAttachmentInput) {
  return resolveAttachmentSemantics({
    type: attachment.type,
    role: attachment.role,
    title: attachment.title,
    source: attachment.source,
  });
}
