import { AttachmentType } from "@prisma/client";
import {
  pickBestDisplayImageUrl,
  rankAttachmentsForDisplay,
} from "@/lib/attachmentDisplayScore";
import { pickDiscoveredBarcode } from "@/lib/barcode/normalize";
import {
  areDisplayTitlesSameProduct,
  requestedTitleCoversCurrentTitle,
  scoreMetadataDisplayTitle,
} from "@/lib/displayTitleScore";
import {
  inferTextLanguage,
  pickBestLocalizedDescription,
  pickBestRegionalTitle,
} from "@/lib/localePreference";
import { dedupeFacts, dedupeFieldEvidence } from "@/services/metadataFacts";
import type {
  MetadataAttachment,
  MetadataResult,
} from "@/types/metadataProvider";

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
  tgdb: MetadataResult | null,
  coverProject: MetadataResult | null,
  launchbox: MetadataResult | null,
  hltb: MetadataResult | null,
  steam: MetadataResult | null,
  rawg: MetadataResult | null,
  steamGrid: MetadataResult | null,
  options: { includePcSources?: boolean } = {},
): MetadataResult {
  const titleSources = [
    ss,
    igdb,
    tgdb,
    launchbox,
    rawg,
    steam,
    steamGrid,
    hltb,
  ].filter(Boolean) as MetadataResult[];
  const title =
    pickBestRegionalTitle(titleSources) ||
    pickBestMetadataTitle([
      ss?.title,
      igdb?.title,
      tgdb?.title,
      launchbox?.title,
      rawg?.title,
      steam?.title,
      steamGrid?.title,
      hltb?.title,
    ]);

  const description = pickBestLocalizedDescription([
    { text: ss?.description, language: "fr", source: "screenscraper" },
    { text: igdb?.description, source: "igdb" },
    {
      text: tgdb?.description,
      language:
        tgdb?.title && inferTextLanguage(tgdb.title) === "fr"
          ? "fr"
          : undefined,
      source: "thegamesdb",
    },
    { text: launchbox?.description, source: "launchbox" },
    { text: rawg?.description, source: "rawg" },
    { text: steam?.description, source: "steam" },
  ]);

  const releaseDate =
    igdb?.releaseDate ||
    ss?.releaseDate ||
    tgdb?.releaseDate ||
    launchbox?.releaseDate ||
    rawg?.releaseDate;

  const allPublishers = [
    ...(igdb?.publishers || []),
    ...(ss?.publishers || []),
    ...(tgdb?.publishers || []),
    ...(launchbox?.publishers || []),
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
  const tgdbAttachments = (tgdb?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "thegamesdb",
  }));
  const coverProjectAttachments = (coverProject?.attachments || []).map(
    (a) => ({
      ...a,
      source: a.source || "coverproject",
    }),
  );
  const launchboxAttachments = (launchbox?.attachments || []).map((a) => ({
    ...a,
    source: a.source || "launchbox",
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
    { source: "thegamesdb", url: tgdb?.imageUrl },
    { source: "coverproject", url: coverProject?.imageUrl },
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
    ...tgdbAttachments,
    ...coverProjectAttachments,
    ...launchboxAttachments,
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
      ...(ss?.regionalTitles?.map((entry) => entry.text) || []),
      ...(tgdb?.regionalTitles?.map((entry) => entry.text) || []),
      ...(launchbox?.aliases || []),
      ...(igdb?.aliases || []),
      ...(ss?.aliases || []),
      ...(tgdb?.aliases || []),
      ...(hltb?.aliases || []),
      ...(rawg?.aliases || []),
      ...(steam?.aliases || []),
      ...(steamGrid?.aliases || []),
    ]),
  ).filter((a) => a.toLowerCase().trim() !== title?.toLowerCase().trim());
  const aliases = allAliases.length > 0 ? allAliases : undefined;
  const hltbFacts = hltb?.facts || [];
  const durationLikeKinds = new Set([
    "time-to-beat",
    "duration",
    "completion-time",
    "playtime",
  ]);
  const hasDirectTimeToBeat = hltbFacts.some((fact) =>
    durationLikeKinds.has(fact.kind),
  );
  const rawgLooksPcOnly =
    !options.includePcSources &&
    rawg?.facts?.some((fact) => fact.kind === "platform") &&
    rawg.facts
      .filter((fact) => fact.kind === "platform")
      .every((fact) => /\b(pc|windows|mac|linux)\b/i.test(fact.value)) &&
    !rawg.facts.some(
      (fact) =>
        fact.kind === "platform" &&
        /\b(playstation|xbox|nintendo|wii|switch|ps[1-5])\b/i.test(fact.value),
    );
  const trustedRawg = rawgLooksPcOnly ? null : rawg;
  const igdbFacts = (igdb?.facts || []).filter(
    (fact) => !hasDirectTimeToBeat || fact.kind !== "time-to-beat",
  );
  const rawgFacts = (trustedRawg?.facts || []).filter(
    (fact) =>
      !hasDirectTimeToBeat ||
      (fact.kind !== "duration" && fact.kind !== "playtime"),
  );
  const facts = dedupeFacts([
    ...igdbFacts,
    ...(ss?.facts || []),
    ...(tgdb?.facts || []),
    ...(launchbox?.facts || []),
    ...hltbFacts,
    ...rawgFacts,
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

export function mergeBoardGameMetadata(
  bgg: MetadataResult | null,
  wikidata: MetadataResult | null,
  retailers: MetadataResult[],
  scraper: MetadataResult | null = null,
): MetadataResult {
  const activeRetailers = retailers.filter(Boolean);
  const primaryRetailer = activeRetailers[0] || null;

  const titleSources = [bgg, primaryRetailer, wikidata, scraper].filter(
    Boolean,
  ) as MetadataResult[];
  const title =
    bgg?.title ||
    primaryRetailer?.title ||
    wikidata?.title ||
    scraper?.title ||
    pickBestMetadataTitle(titleSources.map((source) => source.title));

  const description =
    activeRetailers.find((retailer) => retailer.description)?.description ||
    wikidata?.description ||
    bgg?.description ||
    scraper?.description;

  const releaseDate =
    bgg?.releaseDate ||
    activeRetailers.find((retailer) => retailer.releaseDate)?.releaseDate ||
    wikidata?.releaseDate ||
    scraper?.releaseDate;

  const duration = bgg?.duration;
  const authors = dedupePeople([
    ...(bgg?.authors || []),
    ...(wikidata?.authors || []),
    ...activeRetailers.flatMap((retailer) => retailer.authors || []),
  ]);
  const publishers = dedupePeople([
    ...(bgg?.publishers || []),
    ...(wikidata?.publishers || []),
    ...activeRetailers.flatMap((retailer) => retailer.publishers || []),
  ]);

  const bggAttachments = (bgg?.attachments || []).map((attachment) => ({
    ...attachment,
    source: attachment.source || "boardgamegeek",
  }));
  const wikidataAttachments = (wikidata?.attachments || []).map(
    (attachment) => ({
      ...attachment,
      source: attachment.source || "wikidata",
    }),
  );
  const retailerAttachments = activeRetailers.flatMap((retailer) =>
    (retailer.attachments || []).map((attachment) => ({
      ...attachment,
      source: attachment.source || retailer.facts?.[0]?.source || "retailer",
    })),
  );
  const scraperAttachments = (scraper?.attachments || []).map((attachment) => ({
    ...attachment,
    source: attachment.source || "scraper",
  }));

  const providerImageCandidates: MetadataAttachment[] = [
    ...activeRetailers.map((retailer) => ({
      source: retailer.facts?.[0]?.source || "retailer",
      url: retailer.imageUrl,
    })),
    { source: "boardgamegeek", url: bgg?.imageUrl },
    { source: "wikidata", url: wikidata?.imageUrl },
    { source: "scraper", url: scraper?.imageUrl },
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
    ...retailerAttachments,
    ...bggAttachments,
    ...wikidataAttachments,
    ...scraperAttachments,
    ...providerImageCandidates,
  ]);
  const imageUrl = pickBestDisplayImageUrl(attachments);

  const aliases = Array.from(
    new Set([
      ...(bgg?.aliases || []),
      ...(wikidata?.aliases || []),
      ...activeRetailers.flatMap((retailer) => retailer.aliases || []),
      ...(scraper?.aliases || []),
    ]),
  ).filter(
    (alias) =>
      !title || alias.toLowerCase().trim() !== title.toLowerCase().trim(),
  );

  const facts = dedupeFacts([
    ...(bgg?.facts || []),
    ...(wikidata?.facts || []),
    ...activeRetailers.flatMap((retailer) => retailer.facts || []),
    ...(scraper?.facts || []),
  ]);

  return {
    title,
    description,
    authors,
    publishers,
    duration,
    releaseDate,
    imageUrl,
    barcode: pickDiscoveredBarcode([
      ...activeRetailers.map((retailer) => retailer.barcode),
      bgg?.barcode,
      scraper?.barcode,
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
    { source: "discogs", url: discogs?.imageUrl },
    { source: "deezer", url: deezer?.imageUrl },
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
    ...discogsAttachments,
    ...deezerAttachments,
    ...providerImageCandidates,
  ]);
  const imageUrl = discogs?.imageUrl || pickBestDisplayImageUrl(attachments);

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
    currentTitle.toLowerCase().trim() === requestedTitle.toLowerCase().trim()
  ) {
    return metadata;
  }

  if (!areDisplayTitlesSameProduct(currentTitle, requestedTitle)) {
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
    };
  }

  if (
    scoreMetadataDisplayTitle(requestedTitle) <
      scoreMetadataDisplayTitle(currentTitle) &&
    !requestedTitleCoversCurrentTitle(requestedTitle, currentTitle)
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
