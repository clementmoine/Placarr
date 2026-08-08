import { createMetadataHealthCheck } from "@/core/catalog/healthUtils";
import { withPackCardUrls } from "@/effects/lorcana/packAssets";
import type {
  MetadataResult,
  MetadataAttachment,
} from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
  ProviderModule,
} from "@/types/providerModule";

import {
  ensureLorcanaTcgIndex,
  lookupLorcanaTcgPrint,
  lookupLorcanaTcgTitle,
  lorcanaTcgDbPath,
} from "./indexStore";

export {
  exportLorcanaCardsIndexJson,
  writeLorcanaTcgIndex,
  lorcanaTcgDbPath,
  lookupLorcanaTcgTitle,
  lookupLorcanaTcgPrint,
  ensureLorcanaTcgIndex,
} from "./indexStore";

export { scrapeLorcanaCards } from "./scrapeCards";
export { dumpLorcanaWeb, runDump } from "./dumpWeb";

const PROVIDER_ID = "lorcanatcg";
const PROVIDER_LABEL = "Lorcana TCG (local)";

function resolveFromLocal(ctx: MetadataAdapterContext): MetadataResult | null {
  const printKey =
    ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim() || "";
  if (!printKey) return null;
  if (!ensureLorcanaTcgIndex()) return null;

  const title =
    lookupLorcanaTcgTitle(printKey, "fr") ??
    lookupLorcanaTcgTitle(printKey, "en") ??
    lookupLorcanaTcgTitle(printKey, "de") ??
    lookupLorcanaTcgTitle(printKey, "it");
  if (!title) return null;
  const print = lookupLorcanaTcgPrint(printKey);

  const withUrls = withPackCardUrls({
    printKey,
    language: title.lang,
    imageUrl: null,
    thumbnailUrl: null,
    foilMaskUrl: null,
    varnishMaskUrl: null,
    secondVarnishMaskUrl: null,
  });

  const attachments: MetadataAttachment[] = [];
  if (withUrls.imageUrl) {
    attachments.push({
      type: "cover",
      url: withUrls.imageUrl,
      title: title.fullName,
      role: "lorcanatcg-art",
      source: PROVIDER_ID,
    });
  }

  const authors = (print?.artists ?? [])
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));

  return {
    title: title.fullName,
    description: title.flavorText ?? undefined,
    imageUrl: withUrls.imageUrl ?? undefined,
    attachments: attachments.length ? attachments : undefined,
    authors: authors.length ? authors : undefined,
    publishers: [{ name: "Ravensburger" }],
    externalIds: {
      [PROVIDER_ID]: printKey,
      printKey,
      ...(print?.providerId ? { lorcanaProviderId: print.providerId } : {}),
    },
  };
}

export const lorcanatcgModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["tcg"],
    capabilities: ["identify", "cover", "description", "people"],
    auth: { kind: "none" },
    canonical: false,
    defaultLanguage: "fr",
    websiteUrl: "https://cards.disneylorcana.com/",
    notes:
      "Ingest officiel local → `data/lorcana/lorcana.sqlite` (titres + facts FR/EN/DE/IT, URLs) + foil assets. `lorcanajson` reste le catalogue JSON tiers. Sync : `pnpm foil:lorcana:cards`.",
  },
  createMetadataAdapter: () => ({
    id: PROVIDER_ID,
    async resolve(ctx) {
      return resolveFromLocal(ctx);
    },
  }),
  // Local ingest resolves by printKey only — probe the same path.
  mappingProbe: {
    sampleInput: "lorcana:1-1",
    context: { printKey: "lorcana:1-1" },
  },
  healthCheck: createMetadataHealthCheck(
    PROVIDER_ID,
    PROVIDER_LABEL,
    async () => {
      const start = Date.now();
      const db = ensureLorcanaTcgIndex();
      return {
        ok: Boolean(db),
        latency: Date.now() - start,
        error: db
          ? null
          : `Index unavailable — run pnpm foil:lorcana:cards (${lorcanaTcgDbPath()})`,
        configured: true,
      };
    },
  ),
};
