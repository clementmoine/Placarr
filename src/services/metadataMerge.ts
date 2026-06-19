import { AttachmentType } from "@prisma/client";
import {
  pickBestDisplayImageUrl,
  rankAttachmentsForDisplay,
} from "@/lib/attachmentDisplayScore";
import { pickDiscoveredBarcode } from "@/lib/barcode/normalize";
import {
  areDisplayTitlesSameProduct,
  scoreMetadataDisplayTitle,
} from "@/lib/displayTitleScore";
import {
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
} from "@/lib/localePreference";
import {
  dedupeFacts,
  dedupeFieldEvidence,
} from "@/services/metadataFacts";
import type { MetadataAttachment, MetadataResult } from "@/types/metadataProvider";

export function pickBestMetadataTitle(
  candidates: Array<string | undefined | null>,
): string | undefined {
  const unique = Array.from(
    new Set(
      candidates
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  );
  if (unique.length === 0) return undefined;
  if (unique.length === 1) return unique[0];
  return unique.sort(
    (a, b) => scoreMetadataDisplayTitle(b) - scoreMetadataDisplayTitle(a),
  )[0];
}

export function mergeGameMetadata(
  igdb: MetadataResult | null,
  ss: MetadataResult | null,
  hltb: MetadataResult | null,
  steam: MetadataResult | null,
  rawg: MetadataResult | null,
  steamGrid: MetadataResult | null,
  options: { includePcSources?: boolean } = {},
): MetadataResult {
  const titleSources = [ss, igdb, rawg, steam, steamGrid, hltb].filter(
    Boolean,
  ) as MetadataResult[];
  const title =
    pickBestRegionalTitle(titleSources) ||
    pickBestMetadataTitle([
      ss?.title,
      igdb?.title,
      rawg?.title,
      steam?.title,
      steamGrid?.title,
      hltb?.title,
    ]);

  const description = pickBestLocalizedDescription([
    { text: ss?.description, language: "fr", source: "screenscraper" },
    { text: igdb?.description, source: "igdb" },
    { text: rawg?.description, source: "rawg" },
    { text: steam?.description, source: "steam" },
  ]);

  const releaseDate = igdb?.releaseDate || ss?.releaseDate || rawg?.releaseDate;

  const allPublishers = [
    ...(igdb?.publishers || []),
    ...(ss?.publishers || []),
    ...(rawg?.publishers || []),
    ...(steam?.publishers || []),
  ];
  const publishers =
    allPublishers.length > 0
      ? allPublishers.filter(
          (p, i, arr) => arr.findIndex((q) => q.name === p.name) === i,
        )
      : undefined;

  const ssAttachments = (ss?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "screenscraper",
  }));
  const igdbAttachments = (igdb?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "igdb",
  }));
  const rawgAttachments = (rawg?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "rawg",
  }));
  const steamAttachments = (
    options.includePcSources ? steam?.attachments || [] : []
  ).map((a) => ({
    ...a,
    source: a.source || "steam",
  }));
  const steamGridAttachments = (steamGrid?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "steamgriddb",
  }));

  const providerImageCandidates: MetadataAttachment[] = [
    { source: "screenscraper", url: ss?.imageUrl },
    { source: "igdb", url: igdb?.imageUrl },
    { source: "rawg", url: rawg?.imageUrl },
    { source: "steamgriddb", url: steamGrid?.imageUrl },
    { source: "steam", url: steam?.imageUrl },
  ].flatMap((candidate) =>
    candidate.url
      ? [
          {
            type: "cover" as AttachmentType,
            url: candidate.url,
            source: candidate.source,
          },
        ]
      : [],
  );

  const allAttachments: MetadataAttachment[] = [
    ...ssAttachments,
    ...igdbAttachments,
    ...rawgAttachments,
    ...steamGridAttachments,
    ...steamAttachments,
    ...providerImageCandidates,
  ];

  const attachments = rankAttachmentsForDisplay(allAttachments);
  const imageUrl = pickBestDisplayImageUrl(attachments);

  const allAliases = Array.from(
    new Set([
      ...(igdb?.aliases || []),
      ...(ss?.aliases || []),
      ...(hltb?.aliases || []),
      ...(rawg?.aliases || []),
      ...(steam?.aliases || []),
      ...(steamGrid?.aliases || []),
    ]),
  ).filter((a) => a.toLowerCase().trim() !== title?.toLowerCase().trim());
  const aliases = allAliases.length > 0 ? allAliases : undefined;
  const hltbFacts = hltb?.facts || [];
  const hasDirectTimeToBeat = hltbFacts.some(
    (fact) =>
      fact.kind === "time-to-beat" ||
      fact.kind === "duration" ||
      fact.kind === "completion-time",
  );
  const igdbFacts = (igdb?.facts || []).filter(
    (fact) => !hasDirectTimeToBeat || fact.kind !== "time-to-beat",
  );
  const facts = dedupeFacts([
    ...igdbFacts,
    ...(ss?.facts || []),
    ...hltbFacts,
    ...(rawg?.facts || []),
    ...(options.includePcSources ? steam?.facts || [] : []),
  ]);

  return {
    title,
    description,
    releaseDate,
    publishers,
    imageUrl,
    attachments,
    aliases,
    facts,
  };
}

function dedupePeople(
  people: Array<{ name: string; imageUrl?: string | null }>,
): Array<{ name: string; imageUrl?: string | null }> | undefined {
  if (people.length === 0) return undefined;
  const byName = new Map<string, { name: string; imageUrl?: string | null }>();
  for (const person of people) {
    const key = person.name.trim().toLowerCase();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, person);
      continue;
    }
    if (!existing.imageUrl && person.imageUrl) {
      byName.set(key, { name: existing.name, imageUrl: person.imageUrl });
    }
  }
  const merged = Array.from(byName.values());
  return merged.length > 0 ? merged : undefined;
}

export function mergeBookMetadata(
  openlibrary: MetadataResult | null,
  googlebooks: MetadataResult | null,
): MetadataResult {
  const titleSources = [openlibrary, googlebooks].filter(
    Boolean,
  ) as MetadataResult[];
  const title =
    openlibrary?.title ||
    pickBestMetadataTitle([googlebooks?.title]) ||
    pickBestMetadataTitle(titleSources.map((source) => source.title));

  const description =
    pickBestLocalizedDescription([
      { text: googlebooks?.description, language: "en", source: "googlebooks" },
      { text: openlibrary?.description, source: "openlibrary" },
    ]) ||
    googlebooks?.description ||
    openlibrary?.description;

  const pageCount =
    openlibrary?.pageCount ?? googlebooks?.pageCount ?? undefined;

  const releaseDate =
    openlibrary?.releaseDate || googlebooks?.releaseDate || undefined;

  const authors = dedupePeople([
    ...(openlibrary?.authors || []),
    ...(googlebooks?.authors || []),
  ]);

  const publishers = dedupePeople([
    ...(openlibrary?.publishers || []),
    ...(googlebooks?.publishers || []),
  ]);

  const openlibraryAttachments = (openlibrary?.attachments || []).map(
    (attachment) => ({
      ...attachment,
      source: attachment.source || "openlibrary",
    }),
  );
  const googlebooksAttachments = (googlebooks?.attachments || []).map(
    (attachment) => ({
      ...attachment,
      source: attachment.source || "googlebooks",
    }),
  );

  const providerImageCandidates: MetadataAttachment[] = [
    { source: "openlibrary", url: openlibrary?.imageUrl },
    { source: "googlebooks", url: googlebooks?.imageUrl },
  ].flatMap((candidate) =>
    candidate.url
      ? [
          {
            type: "cover" as AttachmentType,
            url: candidate.url,
            source: candidate.source,
          },
        ]
      : [],
  );

  const attachments = rankAttachmentsForDisplay([
    ...openlibraryAttachments,
    ...googlebooksAttachments,
    ...providerImageCandidates,
  ]);
  const imageUrl = pickBestDisplayImageUrl(attachments);

  const aliases = Array.from(
    new Set([...(openlibrary?.aliases || []), ...(googlebooks?.aliases || [])]),
  ).filter(
    (alias) =>
      !title || alias.toLowerCase().trim() !== title.toLowerCase().trim(),
  );

  const facts = dedupeFacts([
    ...(openlibrary?.facts || []),
    ...(googlebooks?.facts || []),
  ]);

  return {
    title,
    description,
    authors,
    publishers,
    pageCount,
    releaseDate,
    imageUrl,
    barcode: pickDiscoveredBarcode([
      openlibrary?.barcode,
      googlebooks?.barcode,
    ]),
    attachments: attachments.length > 0 ? attachments : undefined,
    aliases: aliases.length > 0 ? aliases : undefined,
    facts: facts && facts.length > 0 ? facts : undefined,
  };
}

export function mergeMusicMetadata(
  musicbrainz: MetadataResult | null,
  discogs: MetadataResult | null,
  deezer: MetadataResult | null,
): MetadataResult {
  const titleSources = [musicbrainz, deezer, discogs].filter(
    Boolean,
  ) as MetadataResult[];
  const title =
    musicbrainz?.title ||
    pickBestMetadataTitle([discogs?.title, deezer?.title]) ||
    pickBestMetadataTitle(titleSources.map((source) => source.title));

  const tracksCount =
    musicbrainz?.tracksCount ?? deezer?.tracksCount ?? undefined;

  const releaseDate =
    musicbrainz?.releaseDate ||
    deezer?.releaseDate ||
    discogs?.releaseDate ||
    undefined;

  const authors = dedupePeople([
    ...(musicbrainz?.authors || []),
    ...(deezer?.authors || []),
  ]);

  const publishers = dedupePeople([
    ...(deezer?.publishers || []),
    ...(discogs?.publishers || []),
  ]);

  const deezerAttachments = (deezer?.attachments || []).map((attachment) => ({
    ...attachment,
    source: attachment.source || "deezer",
  }));
  const discogsAttachments = (discogs?.attachments || []).map((attachment) => ({
    ...attachment,
    source: attachment.source || "discogs",
  }));

  const providerImageCandidates: MetadataAttachment[] = [
    { source: "deezer", url: deezer?.imageUrl },
    { source: "discogs", url: discogs?.imageUrl },
    { source: "musicbrainz", url: musicbrainz?.imageUrl },
  ].flatMap((candidate) =>
    candidate.url
      ? [
          {
            type: "cover" as AttachmentType,
            url: candidate.url,
            source: candidate.source,
          },
        ]
      : [],
  );

  const attachments = rankAttachmentsForDisplay([
    ...deezerAttachments,
    ...discogsAttachments,
    ...providerImageCandidates,
  ]);
  const imageUrl = pickBestDisplayImageUrl(attachments);

  const aliases = Array.from(
    new Set([
      ...(musicbrainz?.aliases || []),
      ...(deezer?.aliases || []),
      ...(discogs?.aliases || []),
    ]),
  ).filter(
    (alias) =>
      !title || alias.toLowerCase().trim() !== title.toLowerCase().trim(),
  );

  const facts = dedupeFacts([
    ...(musicbrainz?.facts || []),
    ...(discogs?.facts || []),
    ...(deezer?.facts || []),
  ]);

  return {
    title,
    authors,
    publishers,
    duration: deezer?.duration,
    tracksCount,
    releaseDate,
    imageUrl,
    barcode: pickDiscoveredBarcode([
      musicbrainz?.barcode,
      deezer?.barcode,
      discogs?.barcode,
    ]),
    attachments: attachments.length > 0 ? attachments : undefined,
    aliases: aliases.length > 0 ? aliases : undefined,
    facts: facts && facts.length > 0 ? facts : undefined,
  };
}

export function preferRequestedDisplayTitle(
  metadata: MetadataResult,
  requestedName: string,
): MetadataResult {
  const currentTitle = metadata.title;
  const requestedTitle = requestedName.trim();

  if (
    !currentTitle ||
    !requestedTitle ||
    currentTitle.toLowerCase().trim() === requestedTitle.toLowerCase().trim() ||
    !areDisplayTitlesSameProduct(currentTitle, requestedTitle)
  ) {
    return metadata;
  }

  if (
    scoreMetadataDisplayTitle(requestedTitle) <=
    scoreMetadataDisplayTitle(currentTitle)
  ) {
    return metadata;
  }

  const aliases = Array.from(
    new Set([currentTitle, ...(metadata.aliases || [])]),
  ).filter(
    (alias) =>
      alias.toLowerCase().trim() !== requestedTitle.toLowerCase().trim(),
  );

  return {
    ...metadata,
    title: requestedTitle,
    aliases: aliases.length > 0 ? aliases : undefined,
    fieldEvidence: dedupeFieldEvidence([
      ...(metadata.fieldEvidence || []),
      {
        field: "title",
        source: "RequestedDisplayTitle",
        value: requestedTitle,
        confidence: 0.62,
        priority: 180,
        rawValue: {
          previousTitle: currentTitle,
          reason: "preferred localized/requested display title",
        },
      },
    ]),
  };
}
