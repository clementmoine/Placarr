/**
 * CardNexus marketplace — prices (EUR), visuals, SKUs for TCG printKeys.
 *
 * One module covers every Placarr game CardNexus catalogues — plug-and-play
 * via the registry. faceChoice decides which visual wins when several sources
 * dump `art.<source>.*`.
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
import type { ProviderModule } from "@/types/providerModule";

import {
  CARDNEXUS_API_KEY_ENV,
  CARDNEXUS_BASE_URL,
  CARDNEXUS_MIN_INTERVAL_MS,
  cardnexusApiKey,
} from "./client";
import { supportedPrintGames } from "./games";
import { fetchCardnexusCardForPrintKey } from "./match";
import type { CardnexusPriceCard } from "./prices";

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
    websiteUrl: "https://cardnexus.com/",
    apiKeyDashboardUrl: "https://cardnexus.com/settings/api-keys",
    notes: `Cotes marketplace EUR + visuels + SKUs (Cardmarket/TCGplayer) + scellés pour ${supportedPrintGames().join(", ")} (+ forks JA pokemon-japan / ygo-ocg). Match printKey → expansion + collector number. Clé ${CARDNEXUS_API_KEY_ENV} (docs.cardnexus.com).`,
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
  cardnexusGameIdForPrintGame,
  cardnexusGameIdsForPrint,
  supportedPrintGames,
  supportedCardnexusGameIds,
} from "./games";
