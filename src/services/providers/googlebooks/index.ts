import axios from "axios";

import { createMetadataHealthCheck, pingUrl } from "@/lib/providerHealthUtils";
import { createGoogleBooksResolver } from "./resolver";
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

const fetchFromGoogleBooks = createGoogleBooksResolver();

const BARCODE_TYPES: BarcodeLookupType[] = ["books", "generic"];

export const googlebooksModule: ProviderModule = {
  info: {
    id: "googlebooks",
    label: "Google Books",
    types: ["books"],
    capabilities: [
      "identify",
      "cover",
      "description",
      "releaseDate",
      "people",
      "pageCount",
      "rating",
    ],
    auth: { kind: "key", env: ["GOOGLE_BOOKS_API_KEY"], free: true },
    canonical: true,
    notes: "Clé gratuite Google Cloud (Books API). Sans clé, quota très bas.",
  },
  evidence: {
    label: "Google Books",
    sourceWeight: 0.42,
    canonical: true,
    cleanCachedNames: true,
  },
  buildBarcodeTasks(deps, type, { barcode }) {
    if (!BARCODE_TYPES.includes(type)) {
      return {} as Record<string, Promise<unknown>>;
    }
    return { googlebooks: deps.fetchFromGoogleBooks("", barcode) };
  },
  buildTeardownBarcodeTasks(ctx, deps) {
    if (!shouldRunBookBarcodeTeardown(ctx)) return [];
    return [
      createTeardownBarcodeTask("Google Books", () =>
        deps.fetchFromGoogleBooks("", ctx.barcode!),
      ),
    ];
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "Google Books",
      () => fetchFromGoogleBooks(ctx.name, ctx.barcode),
      "books",
    );
  },
  healthCheck: createMetadataHealthCheck(
    "googlebooks",
    "Google Books",
    async () => {
      const start = Date.now();
      const isUp = await pingUrl(
        "https://www.googleapis.com/books/v1/volumes?q=isbn:9780140328721",
      );
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
  createMetadataAdapter(deps) {
    const fetchFromGoogleBooks = deps.fetchFromGoogleBooks as Resolver;
    return {
      id: "googlebooks",
      async resolve({ name, barcode }) {
        return fetchFromGoogleBooks(name, barcode);
      },
    } satisfies MetadataProviderAdapter;
  },
  testHandlers: {
    "googlebooks-barcode": {
      label: "Google Books - Barcode",
      kind: "metadata-barcode",
      run: (query) => fetchFromGoogleBooks("", query),
    },
    "googlebooks-metadata": {
      label: "Google Books - Metadata",
      kind: "metadata",
      run: (query) => fetchFromGoogleBooks(query),
    },
  },
  mappingProbe: {
    sampleInput: "Fantastic Mr. Fox (9780140328721)",
    context: { name: "Fantastic Mr. Fox", barcode: "9780140328721" },
  },
  collectMappingRawKeys: async () => {
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim();
    try {
      const res = await axios.get(
        "https://www.googleapis.com/books/v1/volumes",
        {
          params: {
            q: "isbn:9780140328721",
            maxResults: 1,
            ...(apiKey ? { key: apiKey } : {}),
          },
          timeout: 8000,
        },
      );
      return Object.keys(res.data?.items?.[0]?.volumeInfo || {});
    } catch {
      return [];
    }
  },
};

export { createGoogleBooksResolver };
