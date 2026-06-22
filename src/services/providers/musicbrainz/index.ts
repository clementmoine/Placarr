import axios from "axios";

import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import {
  fetchFromMusicBrainz,
  formatMusicTitle,
  artistFromCredit,
} from "./fetch";
import { normalizeProductBarcode } from "@/lib/barcode/normalize";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import {
  createTeardownMetadataTask,
  metadataTeardownLabel,
} from "@/lib/teardownUtils";

export { fetchFromMusicBrainz, formatMusicTitle, artistFromCredit };
export type { MusicBrainzResult } from "./fetch";

function createMusicBrainzAdapter(): MetadataProviderAdapter {
  return {
    id: "musicbrainz",
    async resolve({ barcode }: any) {
      if (!barcode) return null;
      const cleanedBarcode = normalizeProductBarcode(barcode);
      if (!cleanedBarcode) return null;
      const mb = await fetchFromMusicBrainz(cleanedBarcode);
      if (!mb?.title) return null;

      const facts: MetadataFact[] = [];
      if (mb.country) {
        facts.push({
          kind: "release-region",
          label: "Pays",
          value: mb.country,
          source: "musicbrainz",
          confidence: 0.7,
          priority: 35,
        });
      }
      if (mb.status) {
        facts.push({
          kind: "release-status",
          label: "Statut",
          value: mb.status,
          source: "musicbrainz",
          confidence: 0.68,
          priority: 34,
        });
      }
      if (mb.packaging) {
        facts.push({
          kind: "format",
          label: "Packaging",
          value: mb.packaging,
          source: "musicbrainz",
          confidence: 0.67,
          priority: 33,
        });
      }
      if (mb.label) {
        facts.push({
          kind: "label",
          label: "Label",
          value: mb.label,
          source: "musicbrainz",
          confidence: 0.7,
          priority: 42,
        });
      }
      if (mb.labels && mb.labels.length > 1) {
        facts.push({
          kind: "label",
          label: "Labels",
          value: mb.labels.slice(0, 4).join(" • "),
          source: "musicbrainz",
          confidence: 0.66,
          priority: 41,
        });
      }
      if (mb.format) {
        facts.push({
          kind: "format",
          label: "Support",
          value: mb.format,
          source: "musicbrainz",
          confidence: 0.66,
          priority: 31,
        });
      }
      if (mb.mediaSummaries && mb.mediaSummaries.length > 0) {
        facts.push({
          kind: "format",
          label: "Médias",
          value: mb.mediaSummaries.slice(0, 4).join(" • "),
          source: "musicbrainz",
          confidence: 0.64,
          priority: 30,
        });
      }
      if (mb.tags && mb.tags.length > 0) {
        facts.push({
          kind: "tag",
          label: "Tags",
          value: mb.tags.slice(0, 6).join(" • "),
          source: "musicbrainz",
          confidence: 0.58,
          priority: 24,
        });
      }
      if (mb.textLanguage) {
        facts.push({
          kind: "language",
          label: "Langue d'edition",
          value: mb.textLanguage,
          source: "musicbrainz",
          confidence: 0.64,
          priority: 32,
        });
      }
      if (mb.textScript) {
        facts.push({
          kind: "writing-system",
          label: "Script",
          value: mb.textScript,
          source: "musicbrainz",
          confidence: 0.6,
          priority: 27,
        });
      }
      if (mb.releaseType) {
        facts.push({
          kind: "release-type",
          label: "Type de sortie",
          value: mb.releaseType,
          source: "musicbrainz",
          confidence: 0.63,
          priority: 30,
        });
      }
      if (mb.secondaryTypes && mb.secondaryTypes.length > 0) {
        facts.push({
          kind: "release-type",
          label: "Sous-types",
          value: mb.secondaryTypes.slice(0, 4).join(" • "),
          source: "musicbrainz",
          confidence: 0.6,
          priority: 26,
        });
      }
      if (typeof mb.score === "number" && mb.score > 0) {
        facts.push({
          kind: "relevance",
          label: "Pertinence MB",
          value: `${mb.score}/100`,
          source: "musicbrainz",
          confidence: 0.55,
          priority: 16,
        });
      }
      if (mb.mbid) {
        facts.push({
          kind: "external-link",
          label: "MusicBrainz",
          value: "Fiche release",
          url: `https://musicbrainz.org/release/${mb.mbid}`,
          source: "musicbrainz",
          confidence: 0.72,
          priority: 39,
        });
      }

      return {
        title: mb.title,
        barcode: cleanedBarcode,
        releaseDate: mb.releaseDate || undefined,
        authors: mb.artist ? [{ name: mb.artist }] : [],
        tracksCount: mb.tracksCount || undefined,
        imageUrl: mb.imageUrl || undefined,
        facts: facts.length > 0 ? facts : undefined,
        externalIds: mb.mbid ? { musicbrainz: mb.mbid } : undefined,
      } satisfies MetadataResult;
    },
  };
}

export const musicbrainzModule: ProviderModule = {
  info: {
    id: "musicbrainz",
    label: "MusicBrainz",
    types: ["musics"],
    capabilities: ["identify", "cover", "releaseDate", "people", "tracksCount"],
    auth: { kind: "none" },
    canonical: true,
    notes: "Lookup par code-barre, sans clé.",
  },
  evidence: {
    label: "MusicBrainz",
    sourceWeight: 0.46,
    canonical: true,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (type !== "musics") {
      return {} as Record<string, Promise<unknown>>;
    }
    return { mb: deps.fetchFromMusicBrainz(barcode) };
  },
  createMetadataAdapter: () => createMusicBrainzAdapter(),
  testHandlers: {
    "musicbrainz-barcode": {
      label: "MusicBrainz - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromMusicBrainz(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    if (ctx.type !== "musics" || !ctx.barcode) return [];
    return [
      createTeardownMetadataTask(
        metadataTeardownLabel("MusicBrainz", ctx),
        () => fetchFromMusicBrainz(ctx.barcode!),
      ),
    ];
  },
  mappingProbe: {
    sampleInput: "886443927087",
    context: { name: "", barcode: "886443927087" },
  },
  collectMappingRawKeys: async () => {
    try {
      const res = await axios.get("https://musicbrainz.org/ws/2/release/", {
        params: { query: "barcode:886443927087", fmt: "json", limit: 1 },
        headers: { "User-Agent": "Placarr/1.0 (mapping-audit)" },
        timeout: 8000,
      });
      return Object.keys(res.data?.releases?.[0] || {});
    } catch {
      return [];
    }
  },
};
