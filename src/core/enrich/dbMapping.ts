import {
  Attachment,
  AttachmentType,
  Author,
  Metadata,
  Publisher,
  Type,
} from "@prisma/client";

import { type AttachmentImageMetrics } from "@/core/enrich/media/attachmentDisplayScore";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";
import { dedupeFacts, normalizeMetadataFacts } from "@/core/enrich/facts";
import { applyConsensus } from "@/core/enrich/consensus";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";

/**
 * Serialization boundary between the app's `MetadataResult` shape and the Prisma
 * `Metadata`/`Attachment` rows. Split out of `storage.ts` so `storeMetadata`
 * reads as an orchestrator. Pure mappers — no I/O.
 */

const mapAuthors = (authors?: MetadataResult["authors"]) =>
  authors && authors.length > 0
    ? {
        connectOrCreate: authors.map((author) => ({
          where: { name: author.name },
          create: { name: author.name, imageUrl: author.imageUrl },
        })),
      }
    : undefined;

const mapPublishers = (publishers?: MetadataResult["publishers"]) =>
  publishers && publishers.length > 0
    ? {
        connectOrCreate: publishers.map((publisher) => ({
          where: { name: publisher.name },
          create: { name: publisher.name, imageUrl: publisher.imageUrl },
        })),
      }
    : undefined;

const mapAttachments = (attachments?: Attachment[]) =>
  attachments?.map((attachment) =>
    withProviderAttachmentTraits({
      type: attachment.type,
      title: attachment.title ?? undefined,
      duration: attachment.duration ?? undefined,
      url: attachment.url,
      role: attachment.role ?? undefined,
      source: attachment.source ?? undefined,
      coverProvenance: attachment.coverProvenance ?? undefined,
      platformKey: attachment.platformKey ?? undefined,
      // Persisted image metrics → read-time cover ranking (no re-decode on load).
      width: attachment.width ?? undefined,
      height: attachment.height ?? undefined,
      meanLuminance: attachment.meanLuminance ?? undefined,
      darkPixelRatio: attachment.darkPixelRatio ?? undefined,
    }),
  ) ?? [];

/**
 * Project a scored/ranked attachment down to the columns the `Attachment` table
 * actually has, dropping derived display-only fields (e.g. the provider cover
 * trait flags) so Prisma `create` does not reject unknown args.
 */
export const toAttachmentCreateData = (
  attachment: {
    type: AttachmentType;
    title?: string | null;
    duration?: number | null;
    url: string;
    role?: string | null;
    source?: string | null;
    coverProvenance?: string | null;
    platformKey?: string | null;
  },
  metrics?: AttachmentImageMetrics | null,
) => ({
  type: attachment.type,
  title: attachment.title ?? undefined,
  duration: attachment.duration ?? undefined,
  url: attachment.url,
  role: attachment.role ?? undefined,
  source: attachment.source ?? undefined,
  coverProvenance: attachment.coverProvenance ?? undefined,
  platformKey: attachment.platformKey ?? undefined,
  // Persist the metrics measured during this enrichment so the read-time cover
  // ranking can reorder the gallery from stored data (no refresh required).
  width: metrics?.width ?? null,
  height: metrics?.height ?? null,
  meanLuminance: metrics?.meanLuminance ?? null,
  darkPixelRatio: metrics?.darkPixelRatio ?? null,
});

export function formatMetadataForStorage(
  metadata: MetadataResult,
  sourceType: Type,
  sourceQuery: string,
) {
  return {
    title: metadata.title ?? null,
    authors: mapAuthors(metadata.authors),
    publishers: mapPublishers(metadata.publishers),
    duration: metadata.duration ?? null,
    pageCount: metadata.pageCount ?? null,
    tracksCount: metadata.tracksCount ?? null,
    description: metadata.description ?? null,
    releaseDate: metadata.releaseDate ?? null,
    imageUrl: metadata.imageUrl ?? null,
    aliases: metadata.aliases ? JSON.stringify(metadata.aliases) : null,
    facts: dedupeFacts(metadata.facts)
      ? JSON.stringify(dedupeFacts(metadata.facts))
      : null,
    sourceType,
    sourceQuery,
    lastFetched: new Date(),
  };
}

export function formatMetadataFromStorage(
  metadata: Metadata & {
    attachments?: Attachment[];
    authors?: Author[];
    publishers?: Publisher[];
  },
): MetadataResult {
  let aliases: string[] = [];
  if (metadata.aliases) {
    try {
      aliases = JSON.parse(metadata.aliases);
    } catch (e) {
      console.error("Failed to parse aliases from storage:", e);
    }
  }

  let facts: MetadataFact[] = [];
  if (metadata.facts) {
    try {
      const parsed = JSON.parse(metadata.facts);
      facts = Array.isArray(parsed)
        ? normalizeMetadataFacts(applyConsensus(parsed))
        : [];
    } catch (e) {
      console.error("Failed to parse facts from storage:", e);
    }
  }

  return {
    title: metadata.title || undefined,
    authors:
      metadata.authors?.map((author: Author) => ({
        name: author.name,
        imageUrl: author.imageUrl,
      })) || undefined,
    publishers:
      metadata.publishers?.map((publisher: Publisher) => ({
        name: publisher.name,
        imageUrl: publisher.imageUrl,
      })) || undefined,
    duration: metadata.duration || undefined,
    pageCount: metadata.pageCount || undefined,
    tracksCount: metadata.tracksCount || undefined,
    description: metadata.description || undefined,
    releaseDate: metadata.releaseDate || undefined,
    imageUrl: metadata.imageUrl || undefined,
    heroImageUrl: metadata.heroImageUrl || undefined,
    attachments: mapAttachments(metadata.attachments),
    aliases: aliases.length > 0 ? aliases : undefined,
    facts: facts.length > 0 ? facts : undefined,
    lastFetched: metadata.lastFetched
      ? new Date(metadata.lastFetched).toISOString()
      : undefined,
  };
}
