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

import { resolveCdandlpListing } from "./fetch";
import {
  cdandlpHitMatchesType,
  type CdandlpListing,
} from "./parse";

export {
  cdandlpHitMatchesType,
  cleanListingTitle,
  isCdandlpBlockedHtml,
  isCdandlpLaserDiscFormat,
  parseCdandlpProductPage,
  parseCdandlpSearchHits,
  pickBestCdandlpHit,
  upgradeCdandlpImageUrl,
} from "./parse";
export { resolveCdandlpListing, searchCdandlp } from "./fetch";

const PROVIDER_ID = "cdandlp";
const PROVIDER_LABEL = "CDandLP";

function buildAttachments(listing: CdandlpListing): MetadataAttachment[] {
  if (!listing.imageUrl) return [];
  // Pressage country ("3459370676105 - France") + slug/title hints
  // ("…laserdisc-france…") → gallery region for ranking (fr ahead of us).
  const region = coverRegionRoleFromReleaseSignals(listing.country, [
    listing.sourceUrl,
    listing.title,
  ]);
  return [
    {
      type: "cover",
      url: listing.imageUrl,
      ...(region ? { role: region } : {}),
      title: "Cover",
      source: PROVIDER_ID,
    },
  ];
}

/** @internal exported for unit tests */
export function mapCdandlpMetadata(
  listing: CdandlpListing | null,
  type?: string | null,
): MetadataResult | null {
  if (!listing?.title) return null;
  if (!cdandlpHitMatchesType(listing.formatSlug, type)) return null;

  const facts: MetadataFact[] = [
    {
      kind: "external-link",
      label: PROVIDER_LABEL,
      value: "Voir l'annonce",
      url: listing.sourceUrl,
      source: PROVIDER_ID,
      confidence: 0.72,
      priority: 44,
    },
  ];

  if (listing.priceEur != null) {
    facts.push({
      kind: "price",
      label: "Prix",
      value: `${listing.priceEur.toFixed(2).replace(".", ",")} €`,
      source: PROVIDER_ID,
      confidence: 0.55,
      priority: 40,
      url: listing.sourceUrl,
    });
  }

  if (listing.formatLabel) {
    facts.push({
      kind: "media-format",
      label: "Support",
      value: listing.formatLabel,
      source: PROVIDER_ID,
      confidence: 0.8,
      priority: 56,
    });
  }

  if (listing.country) {
    facts.push({
      kind: "release-region",
      label: "Pays",
      value: listing.country,
      source: PROVIDER_ID,
      confidence: 0.7,
      priority: 50,
    });
  }

  const attachments = buildAttachments(listing);
  const releaseDate =
    listing.year && Number.isFinite(listing.year)
      ? `${listing.year}-01-01`
      : undefined;

  const metadata: MetadataResult = {
    title: listing.title,
    barcode: listing.barcode || undefined,
    releaseDate,
    publishers: listing.publisher
      ? [{ name: listing.publisher }]
      : undefined,
    imageUrl: listing.imageUrl || undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    facts,
    externalIds: {
      cdandlp: listing.id,
    },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_ID,
      providerLabel: PROVIDER_LABEL,
      sourceDocumentRole: "marketplace_listing",
      sourceUrl: listing.sourceUrl,
      sourceId: listing.id,
      evidenceSignals: ["structured_data", "external_id"],
      titleRole: "object_title",
      imageRole: "cover_front",
      aliasRole: "listing_alias",
      factRole: "structured_fact",
      externalIdRole: "provider_record_id",
      language: "neutral",
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function fetchFromCdandlp(
  ctx: MetadataAdapterContext,
): Promise<MetadataResult | null> {
  if (ctx.type && ctx.type !== "movies" && ctx.type !== "musics") return null;
  const listing = await resolveCdandlpListing({
    name: ctx.name,
    barcode: ctx.barcode,
    type: ctx.type,
    signal: ctx.signal,
  });
  return mapCdandlpMetadata(listing, ctx.type);
}

export const cdandlpModule = defineProvider({
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["movies", "musics"],
    capabilities: ["identify", "cover", "price"],
    auth: { kind: "scrape" },
    supplyMode: "scrape_cache",
    canonical: false,
    isRealBoxCover: true,
    coverUrlHost: "img.cdandlp.com",
    coverProvenanceRules: {
      catalog: ["img.cdandlp.com", "cdandlp.com", "www.cdandlp.com"],
    },
    requiresTitleAlignment: true,
    websiteUrl: "https://www.cdandlp.com/",
    notes:
      "Marketplace FR vinyl/CD + LaserDisc. Barcode-first ; movies = laser-disc only, musics = hors LD. Jaquette vendeur (imgL) + prix EUR. FlareSolverr si challenge.",
  },
  evidence: {
    label: PROVIDER_LABEL,
    sourceWeight: 0.28,
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_ID,
      async resolve(ctx: MetadataAdapterContext) {
        return fetchFromCdandlp(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  healthCheckUrl: "https://www.cdandlp.com/",
  metadataSearch: (query) =>
    fetchFromCdandlp({ name: query, type: "musics" }),
  buildTeardownMetadataTasks(ctx) {
    return [
      ...teardownMetadataWhen(
        ctx,
        PROVIDER_LABEL,
        () => fetchFromCdandlp(ctx),
        "movies",
      ),
      ...teardownMetadataWhen(
        ctx,
        PROVIDER_LABEL,
        () => fetchFromCdandlp(ctx),
        "musics",
      ),
    ];
  },
  mappingProbe: {
    sampleInput: "3459370676105",
    context: {
      name: "Toy Story",
      barcode: "3459370676105",
      type: "movies",
      shelfName: "Laser Disc",
    },
  },
});
