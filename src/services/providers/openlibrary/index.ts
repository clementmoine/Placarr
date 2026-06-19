import axios from "axios";

import {
  createMetadataHealthCheck,
  pingUrl,
} from "@/lib/providerHealthUtils";
import { createOpenLibraryResolver } from "./resolver";
import {
  createTeardownBarcodeTask,
  shouldRunBookBarcodeTeardown,
} from "@/lib/teardownUtils";
import { teardownMetadataWhen } from "@/lib/providerTeardownHelpers";

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
    capabilities: [
      "identify",
      "cover",
      "description",
      "releaseDate",
      "people",
      "pageCount",
    ],
    auth: { kind: "none" },
    canonical: true,
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
  createMetadataAdapter(deps) {
    const fetchFromOpenLibrary = deps.fetchFromOpenLibrary as Resolver;
    return {
      id: "openlibrary",
      async resolve({ name, barcode }) {
        return fetchFromOpenLibrary(name, barcode);
      },
    } satisfies MetadataProviderAdapter;
  },
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
      const res = await axios.get("https://openlibrary.org/isbn/9780140328721.json", {
        timeout: 8000,
      });
      return Object.keys(res.data || {});
    } catch {
      return [];
    }
  },
};

export { createOpenLibraryResolver };
