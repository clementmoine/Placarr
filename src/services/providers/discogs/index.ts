import axios from "axios";

import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import { fetchFromDiscogs, getDiscogsAuthParams } from "./fetch";
import type { DiscogsImage } from "./fetch";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import {
  createTeardownMetadataTask,
  metadataTeardownLabel,
} from "@/lib/teardownUtils";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";

export { fetchFromDiscogs, getDiscogsAuthParams };
export type { DiscogsResult, DiscogsImage } from "./fetch";

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

function createDiscogsAdapter(): MetadataProviderAdapter {
  return {
    id: "discogs",
    async resolve({ barcode }) {
      if (!barcode) return null;
      const cleanedBarcode = normalizeProductBarcode(barcode);
      if (!cleanedBarcode) return null;
      const discogs = await fetchFromDiscogs(cleanedBarcode);
      if (!discogs?.title) return null;

      const facts: MetadataFact[] = [];
      if (discogs.country) {
        facts.push({
          kind: "release-region",
          label: "Pays",
          value: discogs.country,
          source: "discogs",
          confidence: 0.68,
          priority: 35,
        });
      }
      if (discogs.format) {
        facts.push({
          kind: "format",
          label: "Support",
          value: discogs.format,
          source: "discogs",
          confidence: 0.7,
          priority: 40,
        });
      }
      if (discogs.formats && discogs.formats.length > 0) {
        facts.push({
          kind: "format",
          label: "Formats",
          value: discogs.formats.slice(0, 4).join(" • "),
          source: "discogs",
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
          source: "discogs",
          confidence: 0.62,
          priority: 28,
        });
      }
      if (
        (typeof discogs.communityHave === "number" &&
          discogs.communityHave > 0) ||
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
            source: "discogs",
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
          source: "discogs",
          confidence: 0.7,
          priority: 41,
        });
      }
      if (discogs.genres && discogs.genres.length > 0) {
        facts.push({
          kind: "genre",
          label: "Genres",
          value: discogs.genres.slice(0, 3).join(" • "),
          source: "discogs",
          confidence: 0.66,
          priority: 38,
        });
      }
      if (discogs.styles && discogs.styles.length > 0) {
        facts.push({
          kind: "style",
          label: "Styles",
          value: discogs.styles.slice(0, 3).join(" • "),
          source: "discogs",
          confidence: 0.65,
          priority: 37,
        });
      }

      const releaseDate =
        discogs.year && /^\d{4}$/.test(discogs.year)
          ? `${discogs.year}-01-01`
          : undefined;

      const attachments = buildDiscogsAttachments(
        discogs.images,
        discogs.imageUrl,
      );

      return {
        title: discogs.title,
        barcode: cleanedBarcode,
        releaseDate,
        imageUrl: discogs.imageUrl || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        facts: facts.length > 0 ? facts : undefined,
      } satisfies MetadataResult;
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
    notes: "Noms latins (ex. Yoko Shimomura).",
  },
  evidence: {
    label: "Discogs",
    sourceWeight: 0.45,
    canonical: true,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (type !== "musics") {
      return {} as Record<string, Promise<unknown>>;
    }
    return { discogs: deps.fetchFromDiscogs(barcode) };
  },
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
    sampleInput: "4988601467124",
    context: { name: "", barcode: "4988601467124" },
  },
  collectMappingRawKeys: async () => {
    const auth = getDiscogsAuthParams();
    if (!auth) return [];
    try {
      const res = await axios.get("https://api.discogs.com/database/search", {
        params: { barcode: "4988601467124", per_page: 1, ...auth },
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
};
