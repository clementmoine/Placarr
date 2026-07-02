import type { AttachmentType } from "@prisma/client";

import type { FieldEvidenceInput } from "@/services/metadata/evidence";
import type { MetadataObservation } from "@/types/metadataObservation";

export interface MetadataAttachment {
  type: AttachmentType;
  title?: string;
  duration?: number;
  url: string;
  role?: string;
  source?: string;
  /**
   * Factual source context of a cover image (catalog / listing_photo /
   * user_photo). Unlike the trait flags below this IS persisted: it is derived
   * from the provider's original image URL, which is rewritten to a local path on
   * download, so it cannot be recomputed on load. See
   * `@/lib/media/coverProvenance`.
   */
  coverProvenance?: string;
  /**
   * Image metrics measured once at enrichment (sharp) and persisted, so the
   * read-time cover ranking can sort by resolution + exposure without
   * re-decoding files. See `@/lib/media/attachmentDisplayScore`.
   */
  width?: number;
  height?: number;
  meanLuminance?: number;
  darkPixelRatio?: number;
  /**
   * Provider-derived display fields, computed from `source` server-side so the
   * client-safe scorer/label formatter can read them. Not persisted (recomputed
   * on load). See `@/services/provider/sourceTraits`.
   */
  isFullWrapCoverSource?: boolean;
  isGameMediaGallerySource?: boolean;
  isMusicGallerySource?: boolean;
  isCanonicalCoverSource?: boolean;
  providerImageScoreAdjustment?: number;
  providerLabel?: string;
}

export interface MetadataFact {
  kind: string;
  label: string;
  value: string;
  url?: string;
  unit?: string;
  source?: string;
  sourceNames?: string[];
  confidence?: number;
  priority?: number;
  /**
   * Provider-derived display fields, computed from `source`/`label` server-side so
   * the client can filter facts without importing the registry. Not persisted
   * (recomputed on load). See `@/services/provider/sourceTraits`.
   */
  isBoardGameRatingSource?: boolean;
  isPcSpecificFact?: boolean;
  isDigitalStorefrontSource?: boolean;
  isHowLongToBeatSource?: boolean;
  providerLabel?: string;
}

export interface MetadataResult {
  title?: string;
  platformKey?: string;
  barcode?: string | null;
  authors?: { name: string; imageUrl?: string | null }[];
  publishers?: { name: string; imageUrl?: string | null }[];
  duration?: number;
  pageCount?: number;
  tracksCount?: number;
  description?: string;
  releaseDate?: string;
  imageUrl?: string;
  /** Computed wide hero/background image (quality-ranked), distinct from the cover. */
  heroImageUrl?: string;
  attachments?: MetadataAttachment[];
  aliases?: string[];
  regionalTitles?: { region?: string; text: string }[];
  externalIds?: {
    imdb?: string | null;
    tmdb?: string | null;
    launchbox?: string | null;
    igdb?: string | null;
    screenscraper?: string | null;
    steam?: string | null;
    rawg?: string | null;
    bgg?: string | null;
    googlebooks?: string | null;
    openlibrary?: string | null;
    musicbrainz?: string | null;
    discogs?: string | null;
    wikidata?: string | null;
    thegamesdb?: string | null;
    [key: string]: string | null | undefined;
  };
  facts?: MetadataFact[];
  observations?: MetadataObservation[];
  observationSchemaVersion?: string;
  fieldEvidence?: FieldEvidenceInput[];
  lastFetched?: string;
}
