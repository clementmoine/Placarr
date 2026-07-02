import axios from "axios";

import { createMetadataHealthCheck, pingUrl } from "@/lib/provider/healthUtils";
import { createOpenLibraryResolver } from "./resolver";
import { getOpenLibrarySuggestions } from "./suggestions";
import {
  createTeardownBarcodeTask,
  shouldRunBookBarcodeTeardown,
} from "@/lib/dev/teardownUtils";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

import type { BarcodeLookupType, ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";

type Resolver = (
  name: string,
  barcode?: string | null,
) => Promise<MetadataResult | null>;

const fetchFromOpenLibrary = createOpenLibraryResolver();

const BARCODE_TYPES: BarcodeLookupType[] = ["books", "generic"];

export const openlibraryModule: ProviderModule = {
  info: {
    id: "openlibrary",
    label: "OpenLibrary",
    types: ["books"],
    nameDatabase: true,
    capabilities: [
      "identify",
      "cover",
      "description",
      "releaseDate",
      "people",
      "pageCount",
      "rating",
    ],
    auth: { kind: "none" },
    canonical: true,
    websiteUrl: "https://openlibrary.org/",
    apiKeyDashboardUrl: "https://openlibrary.org/",
    mappingProbeRetry: true,
    bookCoverPriority: "secondary",
    requiresTitleAlignment: true,
    isbnCoverUrlTemplate: "https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg",
  },
  evidence: {
    label: "OpenLibrary",
    sourceWeight: 0.44,
    canonical: true,
    cleanCachedNames: true,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { ol: deps.fetchFromOpenLibrary("", barcode) };
  },
  buildTeardownBarcodeTasks(ctx, deps) {
    if (!shouldRunBookBarcodeTeardown(ctx)) return [];
    return [
      createTeardownBarcodeTask("OpenLibrary", () =>
        deps.fetchFromOpenLibrary("", ctx.barcode!),
      ),
    ];
  },
  contributeBarcodeLookupDeps: () => ({
    fetchFromOpenLibrary,
  }),
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "OpenLibrary",
      () => fetchFromOpenLibrary(ctx.name, ctx.barcode),
      "books",
    );
  },
  healthCheck: createMetadataHealthCheck(
    "openlibrary",
    "Open Library",
    async () => {
      const start = Date.now();
      const isUp = await pingUrl("https://openlibrary.org");
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
  createMetadataAdapter() {
    return {
      id: "openlibrary",
      async resolve({ name, barcode }: any) {
        return fetchFromOpenLibrary(name, barcode);
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) =>
    getOpenLibrarySuggestions(cleanedName),
  testHandlers: {
    "openlibrary-barcode": {
      label: "Open Library - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromOpenLibrary("", query),
    },
    "openlibrary-metadata": {
      label: "Open Library - Metadata",
      kind: "metadata",
      run: (query) => fetchFromOpenLibrary(query),
    },
  },
  mappingProbe: {
    sampleInput: "Fantastic Mr. Fox (9780140328721)",
    context: { name: "Fantastic Mr. Fox", barcode: "9780140328721" },
  },
  collectMappingRawKeys: async () => {
    try {
      const isbn = await axios.get(
        "https://openlibrary.org/isbn/9780140328721.json",
        {
          timeout: 8000,
        },
      );
      const workKey = String(isbn.data?.works?.[0]?.key || "").replace(
        /^\/works\//,
        "",
      );
      if (!workKey) return Object.keys(isbn.data || {});
      const ratings = await axios.get(
        `https://openlibrary.org/works/${workKey}/ratings.json`,
        { timeout: 8000 },
      );
      return Object.keys(ratings.data || {});
    } catch {
      return [];
    }
  },
  buildBarcodeSources(payload) {
    const hit = payload.ol;
    if (!hit?.title) return [];
    return [
      {
        mediaType: "books",
        label: "OpenLibrary",
        products: [{ name: hit.title, coverUrl: hit.imageUrl }],
      },
    ];
  },
};

export { createOpenLibraryResolver };
