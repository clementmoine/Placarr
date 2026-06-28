import axios from "axios";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadata/observations";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import { fetchFromDiscogs, getDiscogsAuthParams } from "./fetch";
import type { DiscogsImage, DiscogsResult } from "./fetch";
import type {
  ImageObservationRole,
  MetadataObservation,
  ObservationEvidenceSignal,
} from "@/types/metadataObservation";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import {
  createTeardownMetadataTask,
  metadataTeardownLabel,
} from "@/lib/dev/teardownUtils";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";

export { fetchFromDiscogs, getDiscogsAuthParams };
export type { DiscogsResult, DiscogsImage } from "./fetch";

const DISCOGS_PROVIDER_ID = "discogs";
const DISCOGS_PROVIDER_LABEL = "Discogs";

function buildDiscogsAttachments(
  images: DiscogsImage[] | undefined,
  imageUrl: string | null | undefined,
) {
  if (images && images.length > 0) {
    return images.map((image, index) => ({
      type: image.kind === "primary" ? ("cover" as const) : ("image" as const),
      url: image.url,
      source: "discogs",
      role:
        image.kind === "primary"
          ? "front"
          : index === 1
            ? "back"
            : `secondary-${index}`,
    }));
  }

  if (imageUrl) {
    return [
      {
        type: "cover" as const,
        url: imageUrl,
        source: "discogs",
        role: "front",
      },
    ];
  }

  return [];
}

function buildDiscogsFacts(discogs: DiscogsResult): MetadataFact[] | undefined {
  const facts: MetadataFact[] = [];
  if (discogs.country) {
    facts.push({
      kind: "release-region",
      label: "Pays",
      value: discogs.country,
      source: DISCOGS_PROVIDER_ID,
      confidence: 0.68,
      priority: 35,
    });
  }
  if (discogs.format) {
    facts.push({
      kind: "format",
      label: "Support",
      value: discogs.format,
      source: DISCOGS_PROVIDER_ID,
      confidence: 0.7,
      priority: 40,
    });
  }
  if (discogs.formats && discogs.formats.length > 0) {
    facts.push({
      kind: "format",
      label: "Formats",
      value: discogs.formats.slice(0, 4).join(" • "),
      source: DISCOGS_PROVIDER_ID,
      confidence: 0.69,
      priority: 39,
    });
  }
  if (
    typeof discogs.formatQuantity === "number" &&
    discogs.formatQuantity > 0
  ) {
    facts.push({
      kind: "format",
      label: "Quantité",
      value: String(discogs.formatQuantity),
      source: DISCOGS_PROVIDER_ID,
      confidence: 0.62,
      priority: 28,
    });
  }
  if (
    (typeof discogs.communityHave === "number" && discogs.communityHave > 0) ||
    (typeof discogs.communityWant === "number" && discogs.communityWant > 0)
  ) {
    const parts = [
      typeof discogs.communityHave === "number" && discogs.communityHave > 0
        ? `${new Intl.NumberFormat("fr-FR").format(discogs.communityHave)} possédé${discogs.communityHave > 1 ? "s" : ""}`
        : null,
      typeof discogs.communityWant === "number" && discogs.communityWant > 0
        ? `${new Intl.NumberFormat("fr-FR").format(discogs.communityWant)} recherché${discogs.communityWant > 1 ? "s" : ""}`
        : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      facts.push({
        kind: "popularity",
        label: "Communauté Discogs",
        value: parts.join(" • "),
        source: DISCOGS_PROVIDER_ID,
        confidence: 0.6,
        priority: 26,
      });
    }
  }
  if (discogs.label) {
    facts.push({
      kind: "label",
      label: "Label",
      value: discogs.label,
      source: DISCOGS_PROVIDER_ID,
      confidence: 0.7,
      priority: 41,
    });
  }
  if (discogs.genres && discogs.genres.length > 0) {
    facts.push({
      kind: "genre",
      label: "Genres",
      value: discogs.genres.slice(0, 3).join(" • "),
      source: DISCOGS_PROVIDER_ID,
      confidence: 0.66,
      priority: 38,
    });
  }
  if (discogs.styles && discogs.styles.length > 0) {
    facts.push({
      kind: "style",
      label: "Styles",
      value: discogs.styles.slice(0, 3).join(" • "),
      source: DISCOGS_PROVIDER_ID,
      confidence: 0.65,
      priority: 37,
    });
  }

  return facts.length > 0 ? facts : undefined;
}

function discogsImageObservationRole(attachment: {
  type: string;
  role?: string;
}): ImageObservationRole {
  const role = (attachment.role || "").toLowerCase();
  if (role.includes("back")) return "cover_back";
  if (attachment.type === "cover") return "cover_front";
  return "gallery_image";
}

function buildDiscogsObservations(
  discogs: DiscogsResult,
  metadata: MetadataResult,
): MetadataObservation[] {
  const evidenceSignals: ObservationEvidenceSignal[] = [
    "barcode_match",
    "structured_data",
    "external_id",
  ];
  const sourceId = String(discogs.id);
  const sourceUrl = `https://www.discogs.com/release/${sourceId}`;
  const observations = observationsFromMetadataResult(
    {
      ...metadata,
      imageUrl: undefined,
      attachments: undefined,
      facts: metadata.facts?.map((fact) => ({
        ...fact,
        source: DISCOGS_PROVIDER_ID,
      })),
    },
    {
      providerId: DISCOGS_PROVIDER_ID,
      providerLabel: DISCOGS_PROVIDER_LABEL,
      sourceDocumentRole: "reference_record",
      sourceUrl,
      sourceId,
      evidenceSignals,
      titleRole: "object_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      externalIdRole: "provider_record_id",
      language: "neutral",
    },
  );

  const imageCandidates: MetadataAttachment[] = [
    ...(metadata.imageUrl
      ? [
          {
            type: "cover",
            url: metadata.imageUrl,
            role: "front",
            source: DISCOGS_PROVIDER_ID,
          } satisfies MetadataAttachment,
        ]
      : []),
    ...(metadata.attachments || []),
  ];
  const seenImageUrls = new Set<string>();
  for (const attachment of imageCandidates) {
    const url = attachment.url?.trim();
    if (!url || seenImageUrls.has(url)) continue;
    seenImageUrls.add(url);
    const role = discogsImageObservationRole(attachment);
    observations.push({
      kind: "image",
      role,
      type: attachment.type,
      url,
      title: attachment.title ?? null,
      provenance: {
        providerId: DISCOGS_PROVIDER_ID,
        providerLabel: DISCOGS_PROVIDER_LABEL,
        sourceDocumentRole: "reference_record",
        sourceUrl,
        sourceId,
        evidenceSignals,
      },
      usage: makeObservationUsage({
        displayCandidate: true,
        evidence:
          role === "cover_front" || role === "cover_back" ? "strong" : "normal",
      }),
    });
  }

  if (metadata.barcode) {
    observations.push({
      kind: "external-id",
      role: "barcode",
      idKind: "ean13",
      value: metadata.barcode,
      provenance: {
        providerId: DISCOGS_PROVIDER_ID,
        providerLabel: DISCOGS_PROVIDER_LABEL,
        sourceDocumentRole: "reference_record",
        sourceUrl,
        sourceId,
        evidenceSignals,
      },
      usage: makeObservationUsage({ evidence: "strong" }),
    });
  }

  return observations;
}

function mapDiscogsMetadata(
  discogs: DiscogsResult,
  cleanedBarcode: string,
): MetadataResult {
  const releaseDate =
    discogs.year && /^\d{4}$/.test(discogs.year)
      ? `${discogs.year}-01-01`
      : undefined;

  const attachments = buildDiscogsAttachments(discogs.images, discogs.imageUrl);
  const metadata: MetadataResult = {
    title: discogs.title,
    barcode: cleanedBarcode,
    authors:
      discogs.artists && discogs.artists.length > 0
        ? discogs.artists.map((name) => ({ name }))
        : undefined,
    publishers:
      discogs.labels && discogs.labels.length > 0
        ? discogs.labels.map((name) => ({ name }))
        : undefined,
    description: discogs.notes || undefined,
    releaseDate,
    imageUrl: discogs.imageUrl || undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    facts: buildDiscogsFacts(discogs),
    externalIds: { discogs: String(discogs.id) },
  };
  return {
    ...metadata,
    observations: buildDiscogsObservations(discogs, metadata),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

function createDiscogsAdapter(): MetadataProviderAdapter {
  return {
    id: DISCOGS_PROVIDER_ID,
    async resolve({ barcode }: { barcode?: string | null }) {
      if (!barcode) return null;
      const cleanedBarcode = normalizeProductBarcode(barcode);
      if (!cleanedBarcode) return null;
      const discogs = await fetchFromDiscogs(cleanedBarcode);
      if (!discogs?.title) return null;
      return mapDiscogsMetadata(discogs, cleanedBarcode);
    },
  };
}

export const discogsModule: ProviderModule = {
  info: {
    id: "discogs",
    label: "Discogs",
    types: ["musics"],
    capabilities: ["identify", "cover", "releaseDate"],
    auth: {
      kind: "key",
      env: ["DISCOGS_CONSUMER_KEY", "DISCOGS_CONSUMER_SECRET"],
      free: true,
    },
    canonical: true,
    musicGallerySource: true,
    // The Discogs release image is the definitive album cover — trust it as-is.
    canonicalCover: true,
    websiteUrl: "https://www.discogs.com/",
    notes: "Noms latins (ex. Yoko Shimomura).",
  },
  evidence: {
    label: DISCOGS_PROVIDER_LABEL,
    sourceWeight: 0.45,
    canonical: true,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (type !== "musics") {
      return {} as Record<string, Promise<unknown>>;
    }
    return { discogs: deps.fetchFromDiscogs(barcode) };
  },
  contributeBarcodeLookupDeps: () => ({
    fetchFromDiscogs,
  }),
  createMetadataAdapter: () => createDiscogsAdapter(),
  testHandlers: {
    "discogs-barcode": {
      label: "Discogs - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromDiscogs(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    if (ctx.type !== "musics" || !ctx.barcode) return [];
    return [
      createTeardownMetadataTask(metadataTeardownLabel("Discogs", ctx), () =>
        fetchFromDiscogs(ctx.barcode!),
      ),
    ];
  },
  mappingProbe: {
    // A single release already exposes Discogs' full key set (artists, videos,
    // notes, series, companies, …), so no additional sample is needed here — and
    // extra live samples would just burn the API rate limit. `additionalSamples`
    // stays available for providers whose products have heterogeneous schemas.
    sampleInput: "4988601467124",
    context: { name: "", barcode: "4988601467124" },
  },
  collectMappingRawKeys: async (context) => {
    const auth = getDiscogsAuthParams();
    if (!auth) return [];
    const barcode = (context?.barcode || "4988601467124").replace(/[^\d]/g, "");
    if (!barcode) return [];
    try {
      const res = await axios.get("https://api.discogs.com/database/search", {
        params: { barcode, per_page: 1, ...auth },
        headers: {
          "User-Agent": "Placarr/1.0 +https://github.com/clementmoine/Placarr",
        },
        timeout: 8000,
      });
      const id = res.data?.results?.[0]?.id;
      if (!id) return Object.keys(res.data?.results?.[0] || {});
      const release = await axios.get(
        `https://api.discogs.com/releases/${id}`,
        {
          params: auth,
          headers: {
            "User-Agent":
              "Placarr/1.0 +https://github.com/clementmoine/Placarr",
          },
          timeout: 8000,
        },
      );
      return Object.keys(release.data || {});
    } catch {
      return [];
    }
  },
  buildBarcodeSources(payload) {
    const hit = payload.discogs;
    if (!hit?.title) return [];
    return [
      {
        mediaType: "musics",
        label: "Discogs",
        products: [{ name: hit.title, coverUrl: hit.imageUrl }],
      },
    ];
  },
};
