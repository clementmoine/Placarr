import type { AttachmentType } from "@prisma/client";

import type { FieldEvidenceInput } from "@/services/evidence";

export interface MetadataAttachment {
  type: AttachmentType;
  title?: string;
  duration?: number;
  url: string;
  role?: string;
  source?: string;
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
  attachments?: MetadataAttachment[];
  aliases?: string[];
  regionalTitles?: { region?: string; text: string }[];
  facts?: MetadataFact[];
  fieldEvidence?: FieldEvidenceInput[];
  lastFetched?: string;
}
