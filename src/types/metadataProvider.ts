import type { AttachmentType } from "@prisma/client";

import type { FieldEvidenceInput } from "@/services/evidence";
import type { MetadataObservation } from "@/types/metadataObservation";

export interface MetadataAttachment {
  type: AttachmentType;
  title?: string;
  duration?: number;
  url: string;
  role?: string;
  source?: string;
  /**
   * Provider-declared cover traits, derived from `source` server-side so the
   * client-safe display scorer can read them. Not persisted (recomputed on load).
   * See `@/services/providerSourceTraits`.
   */
  isRealBoxCoverSource?: boolean;
  isFullWrapCoverSource?: boolean;
}

export interface MetadataFact {
  kind: string;
  label: string;
  value: string;
  url?: string;
  unit?: string;
  source?: string;
  confidence?: number;
  priority?: number;
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
