import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { teardownMetadataWhen } from "@/core/catalog/teardownHelpers";
import { coverRegionRoleFromReleaseSignals } from "@/core/locale/preference";
import { defineProvider } from "@/providers/shared/defineProvider";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
} from "@/types/providerModule";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";

import { resolveLddbTitle } from "./fetch";
import type { LddbTitle } from "./parse";

export {
  lddbCoverBucket,
  lddbCoverUrls,
  lddbIdFromPath,
  lddbRefFromPath,
  shelfSuggestsLaserDisc,
  shelfSuggestsLddbCatalog,
  shelfSuggestsLddbFormat,
} from "./coverUrl";
export {
  LDDB_FORMATS,
  type LddbFormat,
  type LddbFormatId,
} from "./formats";
export {
  isLddbBlockedHtml,
  lddbHitListCoversQuery,
  lddbSiblingTitles,
  normalizeLddbImdbId,
  parseLddbSearchHits,
  parseLddbTitlePage,
  pickBestLddbHit,
} from "./parse";
export {
  resolveLddbTitle,
  searchLddbByImdb,
  searchLddbByTitle,
  searchLddbByUpc,
} from "./fetch";

const PROVIDER_ID = "lddb";
const PROVIDER_LABEL = "LDDb";

function buildAttachments(title: LddbTitle): MetadataAttachment[] {
  // LDDb Country = release territory of the disc sleeve (not "bought in").
  // Face (front/back) lives in `title`, never as a bare role — otherwise the
  // Affiche chip reads "Jaquette" with no region and ranking ignores locale.
  const region = coverRegionRoleFromReleaseSignals(title.country, [
    title.sourceUrl,
    title.title,
    title.reference,
    title.video,
    title.specs,
  ]);
  const out: MetadataAttachment[] = [];
  if (title.frontUrl) {
    out.push({
      type: "cover",
      url: title.frontUrl,
      ...(region ? { role: region } : {}),
      title: "Box - Front",
      source: PROVIDER_ID,
    });
  }
  if (title.backUrl) {
    out.push({
      type: "image",
      url: title.backUrl,
      role: region ? `back-${region}` : "back",
      title: "Box - Back",
      source: PROVIDER_ID,
    });
  }
  return out;
}

/** @internal exported for unit tests */
export function mapLddbMetadata(title: LddbTitle | null): MetadataResult | null {
  if (!title?.title) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: PROVIDER_LABEL,
      value: "Voir la fiche",
      url: title.sourceUrl,
      source: PROVIDER_ID,
      confidence: 0.78,
      priority: 48,
    },
  ];
  if (title.reference) {
    facts.push({
      kind: "catalog-number",
      label: "Référence",
      value: title.reference,
      source: PROVIDER_ID,
      confidence: 0.8,
      priority: 55,
    });
  }
  if (title.country) {
    facts.push({
      kind: "release-region",
      label: "Pays",
      value: title.country,
      source: PROVIDER_ID,
      confidence: 0.72,
      priority: 50,
    });
  }
  const formatBits = [
    title.formatLabel,
    title.video,
    title.specs,
  ].filter(Boolean);
  facts.push({
    kind: "media-format",
    label: "Support",
    value: formatBits.join(" · ") || title.formatLabel || "LaserDisc",
    source: PROVIDER_ID,
    confidence: title.video || title.specs ? 0.85 : 0.8,
    priority: title.video || title.specs ? 60 : 58,
  });
  if (title.category) {
    facts.push({
      kind: "genre",
      label: "Catégorie",
      value: title.category,
      source: PROVIDER_ID,
      confidence: 0.55,
      priority: 30,
    });
  }

  const attachments = buildAttachments(title);
  const releaseDate =
    title.year && Number.isFinite(title.year)
      ? `${title.year}-01-01`
      : undefined;

  const metadata: MetadataResult = {
    title: title.title,
    barcode: title.barcode || undefined,
    releaseDate,
    imageUrl: title.frontUrl || title.thumbUrl || undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    ...(title.aliases && title.aliases.length > 0
      ? { aliases: title.aliases }
      : {}),
    facts,
    externalIds: {
      lddb: title.id,
      ...(title.imdbId ? { imdb: title.imdbId } : {}),
    },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_ID,
      providerLabel: PROVIDER_LABEL,
      sourceDocumentRole: "reference_record",
      sourceUrl: title.sourceUrl,
      sourceId: title.id,
      evidenceSignals: ["structured_data", "external_id"],
      titleRole: "object_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      externalIdRole: "provider_record_id",
      language: "neutral",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function fetchFromLddb(
  ctx: MetadataAdapterContext,
): Promise<MetadataResult | null> {
  if (ctx.type && ctx.type !== "movies") return null;
  const title = await resolveLddbTitle({
    name: ctx.name,
    barcode: ctx.barcode,
    // TMDB/OMDb stage-1 imdb id (Affiche externalIds.imdb on refresh).
    imdbId: ctx.imdbId ?? ctx.externalIds?.imdb ?? null,
    shelfName: ctx.shelfName,
    signal: ctx.signal,
  });
  return mapLddbMetadata(title);
}

export const lddbModule = defineProvider({
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["movies"],
    capabilities: ["identify", "cover", "releaseDate"],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    isRealBoxCover: true,
    coverUrlHost: "www.lddb.com",
    // Anubis serves HTML to bare image GETs; Flare cookies on this referer
    // unlock /cover/… JPEGs for localization into /uploads/.
    remoteImageReferer: "https://www.lddb.com/",
    coverProvenanceRules: {
      catalog: ["www.lddb.com", "lddb.com"],
    },
    requiresTitleAlignment: true,
    websiteUrl: "https://www.lddb.com/",
    notes:
      "LaserDisc Database — catalogues LaserDisc / VHD / CED / D-VHS / HD-DVD (jaquettes face/dos). Résolution : UPC/EAN → IMDb (`/search/IMDb/{id}`, id TMDB/OMDb) → titre (étagère format). Magazines = archive PDF (magazines.lddb.com), hors metadata titres. Anubis → FlareSolverr (HTML + covers).",
  },
  evidence: {
    label: PROVIDER_LABEL,
    sourceWeight: 0.42,
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_ID,
      async resolve(ctx: MetadataAdapterContext) {
        return fetchFromLddb(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheckUrl: "https://www.lddb.com/",
  metadataSearch: (query) =>
    fetchFromLddb({ name: query, type: "movies", shelfName: "Laser Disc" }),
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      PROVIDER_LABEL,
      () => fetchFromLddb(ctx),
      "movies",
    );
  },
  mappingProbe: {
    sampleInput: "Toy Story",
    context: { name: "Toy Story", type: "movies", shelfName: "Laser Disc" },
  },
});
