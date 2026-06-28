import axios from "axios";
import { convertXML } from "simple-xml-to-json";

import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
  pingUrl,
} from "@/lib/provider/healthUtils";

import type { ProviderModule } from "@/types/providerModule";
import type { MetadataProviderAdapter } from "@/types/providerModule";
import type { MetadataResult } from "@/types/metadataProvider";
import { formatScore } from "@/services/metadata/searchUtils";
import { createBGGResolver } from "./resolver";
import type { BGGResponse } from "./resolver";
import { getBGGSuggestions } from "./suggestions";
import { teardownMetadataWhen } from "@/lib/provider/teardownHelpers";

const fetchFromBGG = createBGGResolver({ formatScore });

type NameResolver = (name: string) => Promise<MetadataResult | null>;

export const bggModule: ProviderModule = {
  info: {
    id: "boardgamegeek",
    label: "BoardGameGeek",
    types: ["boardgames"],
    nameDatabase: true,
    // BGG attachments carry the short "bgg" source handle; declare it so the
    // registry canonicalises them back to this provider when reading the
    // real-box cover trait (otherwise aliased sources would lose the bonus).
    sourceAliases: ["bgg"],
    capabilities: [
      "identify",
      "rating",
      "ageRating",
      "description",
      "cover",
      "releaseDate",
      "duration",
      "people",
      "players",
    ],
    auth: { kind: "key", env: ["BGG_API_TOKEN"], free: true },
    canonical: true,
    websiteUrl: "https://boardgamegeek.com/",
    apiKeyDashboardUrl: "https://boardgamegeek.com/",
    mappingProbeRetry: true,
    mappingProbeConfigHint:
      "BGG_API_TOKEN missing — add it to .env (Bearer token from boardgamegeek.com/using_the_xml_api)",
    notes: "XML API v2 avec token Bearer requis.",
  },
  evidence: {
    label: "BoardGameGeek",
    sourceWeight: 0.44,
    canonical: true,
    cleanCachedNames: true,
  },
  createMetadataAdapter() {
    return {
      id: "boardgamegeek",
      async resolve(ctx) {
        return fetchFromBGG(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: ({ cleanedName }) => getBGGSuggestions(cleanedName),
  healthCheck: {
    providerId: "boardgamegeek",
    async run() {
      const token = process.env.BGG_API_TOKEN?.trim();
      if (!token) {
        return createUnconfiguredHealthCheck(
          "boardgamegeek",
          "BoardGameGeek",
          "BGG_API_TOKEN missing",
        ).run();
      }
      return createMetadataHealthCheck(
        "boardgamegeek",
        "BoardGameGeek",
        async () => {
          const start = Date.now();
          const isUp = await pingUrl(
            "https://boardgamegeek.com/xmlapi2/search?query=test&type=boardgame",
            { headers: { Authorization: `Bearer ${token}` } },
          );
          return {
            ok: isUp,
            latency: Date.now() - start,
            error: isUp ? null : "Host unreachable or invalid token",
          };
        },
      ).run();
    },
  },
  testHandlers: {
    "bgg-metadata": {
      label: "BoardGameGeek - Metadata",
      kind: "metadata",
      run: (query) => fetchFromBGG(query),
    },
  },
  buildTeardownMetadataTasks(ctx) {
    return teardownMetadataWhen(
      ctx,
      "BoardGameGeek",
      () => fetchFromBGG(ctx.name),
      "boardgames",
    );
  },
  mappingProbe: {
    sampleInput: "Catan",
    context: { name: "Catan" },
  },
  collectMappingRawKeys: async () => {
    const token = process.env.BGG_API_TOKEN?.trim();
    if (!token) return [];
    try {
      const res = await axios.get(
        "https://boardgamegeek.com/xmlapi2/thing?id=13&stats=1",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/xml,text/xml,*/*",
          },
          responseType: "text",
          timeout: 8000,
        },
      );
      const data = convertXML(res.data) as BGGResponse;
      const children = data.items?.children?.[0]?.item?.children || [];
      return children
        .map((child) => Object.keys(child)[0])
        .filter((key): key is string => Boolean(key));
    } catch {
      return [];
    }
  },
};

export { createBGGResolver } from "./resolver";
export type { BGGChild, BGGResponse } from "./resolver";
