/**
 * CardNexus marketplace — prices (EUR), visuals, SKUs for TCG printKeys.
 *
 * One module covers every Placarr game CardNexus catalogues — plug-and-play
 * via the registry. faceChoice decides which visual wins when several sources
 * dump `art.<source>.*`. Sync densifies sealed via {@link runCardnexusPackSealedStep}
 * (union into pack products; no invented GTINs).
 */
import {
  createMetadataHealthCheck,
  createUnconfiguredHealthCheck,
} from "@/core/catalog/healthUtils";
import { httpGet } from "@/lib/http/httpClient";
import { rawProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import {
  createPrintKeyPriceRefresh,
  dualFinishPriceRows,
} from "@/providers/shared/createPrintKeyPriceModule";
import type { MetadataFact, MetadataResult } from "@/types/metadataProvider";
import type { ProviderModule } from "@/types/providerModule";

import {
  CARDNEXUS_API_KEY_ENV,
  CARDNEXUS_BASE_URL,
  CARDNEXUS_MIN_INTERVAL_MS,
  cardnexusApiKey,
} from "./client";
import { supportedPrintGames } from "./games";
import { fetchCardnexusCardForPrintKey } from "./match";
import {
  primaryExternalSku,
  type CardnexusPriceCard,
} from "./prices";

const PROBE_PRINT_KEY = "lorcana:12-223";
const PROBE_NAME = "Jessie, Lively Cowgirl";

function cardnexusHealthCheck() {
  const key = cardnexusApiKey();
  if (!key) {
    return createUnconfiguredHealthCheck(
      "cardnexus",
      "CardNexus",
      `${CARDNEXUS_API_KEY_ENV} missing — mint at cardnexus.com → Settings → API keys`,
    );
  }
  return createMetadataHealthCheck("cardnexus", "CardNexus", async () => {
    const start = Date.now();
    try {
      const res = await httpGet<{ id?: string }>(
        `${CARDNEXUS_BASE_URL}/account/me`,
        {
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
          },
          timeout: 8_000,
          minIntervalMs: CARDNEXUS_MIN_INTERVAL_MS,
          validateStatus: () => true,
        },
      );
      const ok = res.status === 200 && Boolean(res.data?.id);
      return {
        configured: true,
        ok,
        latency: Date.now() - start,
        error: ok ? null : `HTTP ${res.status}`,
      };
    } catch (error: unknown) {
      return {
        configured: true,
        ok: false,
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : "Health check failed",
      };
    }
  });
}

const refresh = createPrintKeyPriceRefresh<CardnexusPriceCard>({
  priceSource: "cardnexus",
  currency: "EUR",
  fetchCard: (printKey, { signal }) =>
    fetchCardnexusCardForPrintKey(printKey, { signal }),
  priceRows: (card) =>
    dualFinishPriceRows({
      label: card.name,
      newCents: card.newCents,
      foilCents: card.foilCents,
      sourceUrl: card.sourceUrl,
    }),
});

function cardnexusSkuFacts(card: CardnexusPriceCard): MetadataFact[] {
  const facts: MetadataFact[] = [];
  const sku = primaryExternalSku(card.externalIds);
  if (sku) {
    facts.push({
      kind: "external-id",
      label: sku.source === "cardmarket" ? "Cardmarket" : "TCGPlayer",
      value: String(sku.id),
      source: "cardnexus",
      confidence: 0.72,
      priority: 48,
    });
  }
  if (card.sourceUrl) {
    facts.push({
      kind: "external-link",
      label: "CardNexus",
      value: "Voir la fiche",
      url: card.sourceUrl,
      source: "cardnexus",
      confidence: 0.7,
      priority: 44,
    });
  }
  return facts;
}

function mapCardnexusMetadata(card: CardnexusPriceCard): MetadataResult {
  const imageUrl = card.imageUrl?.trim() || undefined;
  const facts = cardnexusSkuFacts(card);
  return {
    title: card.name,
    imageUrl,
    externalIds: {
      cardnexus: String(card.id),
      ...(card.expansionCode
        ? { cardnexusExpansion: card.expansionCode }
        : {}),
    },
    attachments: imageUrl
      ? [
          {
            type: "cover",
            url: imageUrl,
            source: "cardnexus",
            role: "card-face",
            title: card.name,
          },
        ]
      : undefined,
    facts: facts.length > 0 ? facts : undefined,
  };
}

export const cardnexusModule: ProviderModule = {
  info: {
    id: "cardnexus",
    label: "CardNexus",
    types: ["tcg"],
    capabilities: ["price", "cover"],
    auth: { kind: "key", env: [CARDNEXUS_API_KEY_ENV], free: true },
    supplyMode: "api_live",
    canonical: false,
    referencePriceSource: true,
    minRequestIntervalMs: CARDNEXUS_MIN_INTERVAL_MS,
    coverUrlHost: "img.cardnexus.com",
    websiteUrl: "https://cardnexus.com/",
    apiKeyDashboardUrl: "https://cardnexus.com/settings/api-keys",
    notes: `Cotes marketplace EUR + visuels shelf/Sync + SKUs Cardmarket/TCGPlayer pour ${supportedPrintGames().join(", ")} (+ forks JA pokemon-japan / ygo-ocg). Match printKey → expansion + collector number. Scellés : densify Sync (prix/image) via listSealed* → products index (sans GTIN inventés). Clé ${CARDNEXUS_API_KEY_ENV} (docs.cardnexus.com).`,
  },
  healthCheck: cardnexusHealthCheck(),
  mappingProbe: {
    sampleInput: PROBE_PRINT_KEY,
    context: { name: PROBE_NAME, printKey: PROBE_PRINT_KEY },
  },
  runMappingProbe: async () => {
    if (!cardnexusApiKey()) return rawProbe(null);
    const card = await fetchCardnexusCardForPrintKey(PROBE_PRINT_KEY);
    return rawProbe(card);
  },
  collectMappingRawKeys: async (context) => {
    if (!cardnexusApiKey()) return [];
    const adapterCtx = probeContextOrDefault(context, {
      name: PROBE_NAME,
      printKey: PROBE_PRINT_KEY,
    });
    const printKey = adapterCtx.printKey?.trim() || PROBE_PRINT_KEY;
    return mappingRawKeysFromFetch(() =>
      fetchCardnexusCardForPrintKey(printKey),
    );
  },
  createMetadataAdapter() {
    return {
      id: "cardnexus",
      async resolve(ctx) {
        if (ctx.type && ctx.type !== "tcg") return null;
        if (!cardnexusApiKey()) return null;
        const printKey =
          ctx.printKey?.trim() ||
          ctx.match?.printKey?.trim() ||
          ctx.externalIds?.printKey?.trim() ||
          null;
        if (!printKey) return null;
        const card = await fetchCardnexusCardForPrintKey(printKey, {
          signal: ctx.signal,
          requirePrices: false,
        });
        if (!card?.name) return null;
        if (!card.imageUrl && !primaryExternalSku(card.externalIds)) {
          // Price-only hit with no visual/SKU — leave cover to Sync faces.
          if (!card.sourceUrl) return null;
        }
        return mapCardnexusMetadata(card);
      },
    };
  },
  isVerifiedCatalogProductUrl(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (host !== "cardnexus.com") return false;
    } catch {
      return false;
    }
    return /\/product\/\d+/i.test(url);
  },
  refreshBarcodePriceOffers: refresh,
};

export {
  fetchCardnexusCardForPrintKey,
  fetchCardnexusProductForPrintKey,
} from "./match";
export { listSealedForSetCode, listSealedForExpansionId } from "./sealed";
export { fillCardnexusFaces, cardnexusImageDownloadUrl } from "./fillFaces";
export {
  fillCardnexusPackFaces,
  listCardnexusPackGapTargets,
  runCardnexusPackFacesStep,
  withCardnexusPackFacesStep,
} from "./fillPackFaces";
export {
  mapCardnexusSealedToEntry,
  runCardnexusPackSealedStep,
} from "./fillPackSealed";
export {
  cardnexusGameIdForPrintGame,
  cardnexusGameIdsForPrint,
  supportedPrintGames,
  supportedCardnexusGameIds,
} from "./games";
