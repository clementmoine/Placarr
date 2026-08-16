import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { pricedOffers } from "@/core/catalog/priceOffers";
import { catalogAliasesFromNames } from "@/core/enrich/aliases";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { parsePrintKey } from "@/core/identify/printKey";
import { metadataProbe } from "@/lib/dev/mappingProbe";
import {
  mappingRawKeysFromFetch,
  probeContextOrDefault,
} from "@/lib/dev/mappingRawKeys";
import { POKEMON_EFFECT_PACK_ID } from "@/effects/pokemon";
// Install SQLite Live lookups (server-only) before joinLiveForPrint.
import "@/effects/pokemon/liveCardsIndex";
// …and the per-print foil mapping, which lives in the same database. Both are
// side-effect imports: loading them is what installs the real lookups over the
// client-safe stubs. Without this the provider still resolves cards but never
// finds a Live texture, and silently falls back to TCGdex art.
import "@/effects/pokemon/cardFoilIndex";
import { faceQuarterTurnsForPokemonPrint } from "@/effects/pokemon/faceOrientation";
import { joinLiveForPrint } from "@/effects/pokemon/liveJoin";
import { lookupByBundle } from "@/effects/pokemon/liveCardsLookups";
import {
  paperArtUrl,
  paperCard,
  paperMaskUrl,
  resolveLiveBundleForPrintKey,
} from "@/effects/pokemon/resolveEffect";
import { appendUnreachableLiveFinishes } from "@/effects/pokemon/liveFinishVariants";

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  BarcodePriceRefreshContext,
  MetadataAdapterContext,
  MetadataProviderAdapter,
  PrintCandidate,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchTcgdexCardById,
  fetchTcgdexCardByPrintKey,
  POKEMON_GAME,
  resolveTcgdexLanguage,
  searchTcgdexCards,
  tcgdexCollectorNumberLabel,
  tcgdexLanguageFromLiveOrDex,
  tcgdexPrintLabel,
  type TcgdexCard,
  type TcgdexLanguage,
} from "./fetch";
import { suggestTcgdexFoilPlayroomSamples } from "./playroomSamples";

export {
  fetchTcgdexCardById,
  fetchTcgdexCardByPrintKey,
  mapTcgdexCard,
  resolveTcgdexLanguage,
  searchTcgdexCards,
  tcgdexIdFromPrintKey,
  tcgdexImageUrl,
  tcgdexLanguageFromLiveOrDex,
} from "./fetch";

const PROVIDER_ID = "tcgdex";
const PROVIDER_LABEL = "TCGdex";
const PRICE_SOURCE = "TCGdex";
const PLAIN_FINISH = "normal";

function resolveLanguage(ctx: {
  language?: string | null;
  externalIds?: Record<string, string | null | undefined> | null;
}): TcgdexLanguage {
  const requested =
    ctx.language?.trim() || ctx.externalIds?.tcgdexLanguage?.trim();
  return resolveTcgdexLanguage(requested);
}

function buildAttachments(card: TcgdexCard): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];
  if (card.imageUrl) {
    attachments.push({
      type: "cover",
      url: card.imageUrl,
      title: card.name,
      role: "tcgdex-scan",
      source: PROVIDER_ID,
    });
  }
  // Live front art is owned by `pokemontcglive` (local dump), not TCGdex.
  return attachments.length > 0 ? attachments : undefined;
}

function buildFacts(card: TcgdexCard): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "format",
      label: "Numéro",
      value: tcgdexCollectorNumberLabel(card),
      source: PROVIDER_ID,
      confidence: 0.95,
      priority: 45,
    },
  ];

  if (card.rarity) {
    facts.push({
      kind: "tag",
      label: "Rareté",
      value: card.rarity,
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 40,
    });
  }

  if (card.serieName) {
    facts.push({
      kind: "series",
      label: "Série",
      value: card.serieName,
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 38,
    });
  }

  if (card.setName) {
    facts.push({
      kind: "series",
      label: "Extension",
      value: card.setName,
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 36,
    });
  }

  if (card.category) {
    facts.push({
      kind: "category",
      label: "Catégorie",
      value: card.category,
      source: PROVIDER_ID,
      confidence: 0.88,
      priority: 32,
    });
  }

  if ((card.types ?? []).length > 0) {
    facts.push({
      kind: "tag",
      label: "Type",
      value: card.types.join(" • "),
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 31,
    });
  }

  if (card.stage) {
    facts.push({
      kind: "tag",
      label: "Niveau",
      value: card.stage,
      source: PROVIDER_ID,
      confidence: 0.88,
      priority: 29,
    });
  }

  if (card.hp != null) {
    facts.push({
      kind: "tag",
      label: "PV",
      value: String(card.hp),
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 28,
    });
  }

  if (card.evolveFrom) {
    facts.push({
      kind: "tag",
      label: "Évolue de",
      value: card.evolveFrom,
      source: PROVIDER_ID,
      confidence: 0.85,
      priority: 27,
    });
  }

  if (card.regulationMark) {
    facts.push({
      kind: "tag",
      label: "Régulation",
      value: card.regulationMark,
      source: PROVIDER_ID,
      confidence: 0.85,
      priority: 25,
    });
  }

  if (card.finishes.length > 0) {
    facts.push({
      kind: "tag",
      label: "Finitions existantes",
      value: card.finishes.join(" • "),
      source: PROVIDER_ID,
      confidence: 0.85,
      priority: 24,
    });
  }

  if (card.illustrator) {
    facts.push({
      kind: "artist",
      label: "Illustration",
      value: card.illustrator,
      source: PROVIDER_ID,
      confidence: 0.88,
      priority: 23,
    });
  }

  if (card.cardmarketProductId != null) {
    facts.push({
      kind: "external-link",
      label: "Cardmarket",
      value: "Voir la fiche",
      url: `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${card.cardmarketProductId}`,
      source: PROVIDER_ID,
      confidence: 0.7,
      priority: 20,
    });
  }

  return facts;
}

export function toPrintCandidate(card: TcgdexCard): PrintCandidate {
  const finishShaders: Record<string, string> = {};
  const finishFoilMaskUrls: Record<string, string> = {};
  const variantImageUrls: Record<string, string> = {};
  let foilMaskUrl: string | null = null;
  let varnishMaskUrl: string | null = null;
  let secondVarnishMaskUrl: string | null = null;
  let liveBundle: string | null = null;

  const liveBundleId =
    resolveLiveBundleForPrintKey(card.printKey, card.language, card.name) ??
    null;
  const liveEntry = liveBundleId ? paperCard(liveBundleId) : null;
  // Expose Live std/ph foil rows TCGdex finishes cannot reach (e.g. dual-foil
  // dumps when the catalogue only lists holo or only reverse).
  const finishes = appendUnreachableLiveFinishes(card.finishes, liveEntry);

  for (const finish of finishes) {
    if (finish === PLAIN_FINISH) {
      // Plain finish still gets Live front when dumped (std art).
      if (liveBundleId) {
        const entry = paperCard(liveBundleId);
        const art = paperArtUrl(
          liveBundleId,
          entry?.std?.cardTex ?? entry?.ph?.cardTex,
        );
        if (art) variantImageUrls[finish] = art;
      }
      continue;
    }
    const joined = joinLiveForPrint({
      printKey: card.printKey,
      finish,
      lang: card.language,
      name: card.name,
    });
    if (!joined) continue;
    const { resolution } = joined;
    finishShaders[finish] = resolution.shader;
    liveBundle ??= resolution.bundle;
    const art = paperArtUrl(resolution.bundle, resolution.cardTex);
    if (art) variantImageUrls[finish] = art;
    const mask = paperMaskUrl(resolution.bundle, resolution.maskTex);
    if (mask) {
      finishFoilMaskUrls[finish] = mask;
      foilMaskUrl ??= mask;
    }
    // Live per-card plates (etch / cold foil) ride the varnish surfaces.
    varnishMaskUrl ??= paperMaskUrl(resolution.bundle, resolution.etchTex);
    secondVarnishMaskUrl ??= paperMaskUrl(
      resolution.bundle,
      resolution.coldFoilTex,
    );
  }

  // Prefer Live front when dumped. Otherwise keep TCGdex low.webp for the
  // picker grid (high.png is multi-second per tile on assets.tcgdex.net).
  const liveFront =
    (liveBundleId &&
      paperArtUrl(
        liveBundleId,
        paperCard(liveBundleId)?.std?.cardTex ??
          paperCard(liveBundleId)?.ph?.cardTex,
      )) ||
    Object.values(variantImageUrls)[0] ||
    null;
  const tcgdexThumb = card.thumbnailUrl ?? card.imageUrl ?? null;
  const tcgdexFull = card.imageUrl ?? card.thumbnailUrl ?? null;
  const liveRarity =
    ((liveBundle ?? liveBundleId)
      ? lookupByBundle(liveBundle ?? liveBundleId!)?.rarityCode
      : null) ?? null;
  const faceQuarterTurns = faceQuarterTurnsForPokemonPrint({
    stage: card.stage,
    rarityCode: liveRarity,
  });

  return {
    printKey: card.printKey,
    title: card.name,
    reference: tcgdexPrintLabel(card),
    rarity: card.rarity,
    category: card.category,
    setCode: card.setId,
    thumbnailUrl: liveFront ?? tcgdexThumb,
    imageUrl: liveFront ?? tcgdexFull,
    // Pack default back lives on EffectPack.cardBackUrl — do not stamp it as
    // print scope (that kills grid skeletons via sharedCardBackSkeletonUrl).
    language: card.language,
    finishes,
    plainFinishes: finishes.filter((finish) => finish === PLAIN_FINISH),
    finishShaders:
      Object.keys(finishShaders).length > 0 ? finishShaders : undefined,
    variantImageUrls:
      Object.keys(variantImageUrls).length > 0 ? variantImageUrls : undefined,
    finishFoilMaskUrls:
      Object.keys(finishFoilMaskUrls).length > 0
        ? finishFoilMaskUrls
        : undefined,
    foilMaskUrl,
    varnishMaskUrl,
    secondVarnishMaskUrl,
    effectPack: POKEMON_EFFECT_PACK_ID,
    ...(faceQuarterTurns ? { faceQuarterTurns } : {}),
    externalIds: {
      [PROVIDER_ID]: card.providerId,
      ...((liveBundle ?? liveBundleId)
        ? { pokemonLiveBundle: liveBundle ?? liveBundleId! }
        : {}),
      ...(card.imageUrl ? { tcgdexImage: card.imageUrl } : {}),
    },
  };
}

export function mapTcgdexMetadata(
  card: TcgdexCard | null,
): MetadataResult | null {
  if (!card) return null;

  const metadata: MetadataResult = {
    title: card.name,
    imageUrl: card.imageUrl ?? undefined,
    authors: card.illustrator ? [{ name: card.illustrator }] : undefined,
    publishers: [{ name: "The Pokémon Company" }],
    aliases: catalogAliasesFromNames(card.name, []),
    attachments: buildAttachments(card),
    facts: buildFacts(card),
    externalIds: {
      [PROVIDER_ID]: card.providerId,
      printKey: card.printKey,
    },
  };

  return {
    ...metadata,
    observations: observationsFromMetadataResult(metadata, {
      providerId: PROVIDER_ID,
      providerLabel: PROVIDER_LABEL,
      sourceDocumentRole: "reference_record",
      sourceUrl: "https://tcgdex.dev/",
      sourceId: card.providerId,
      evidenceSignals: ["structured_data", "title_match"],
      titleRole: "catalog_title",
      aliasRole: "provider_grouped_alias",
      imageRole: "cover_front",
      factRole: "structured_fact",
      language: card.language,
    }),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

async function resolveTcgdexCard(
  ctx: MetadataAdapterContext,
): Promise<TcgdexCard | null> {
  const language = resolveLanguage(ctx);
  const options = { language, signal: ctx.signal };

  const pinnedId = ctx.externalIds?.[PROVIDER_ID]?.trim();
  if (pinnedId) {
    const pinned = await fetchTcgdexCardById(pinnedId, options);
    if (pinned) return pinned;
  }

  const printKey = ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim();
  if (printKey && parsePrintKey(printKey)?.game === POKEMON_GAME) {
    const byKey = await fetchTcgdexCardByPrintKey(printKey, {
      ...options,
      name: ctx.name,
    });
    if (byKey) return byKey;
  }

  const queries =
    ctx.lookupQueries && ctx.lookupQueries.length > 0
      ? ctx.lookupQueries
      : [String(ctx.name || "").trim()];
  for (const query of queries) {
    if (!query?.trim()) continue;
    const [best] = await searchTcgdexCards(query, { ...options, limit: 1 });
    if (best) return best;
  }

  return null;
}

function printKeyFromContext(ctx: BarcodePriceRefreshContext): string | null {
  const direct = ctx.printKey?.trim();
  if (direct) return direct;
  return ctx.externalIds?.printKey?.trim() || null;
}

function offersFromCard(card: TcgdexCard) {
  const label = tcgdexPrintLabel(card);
  const rows: Array<{
    condition: string;
    priceCents: number | null;
    productName: string;
  }> = [];

  if (card.cmPriceCents != null) {
    rows.push({
      condition: "new",
      priceCents: card.cmPriceCents,
      productName: label,
    });
  }
  if (card.cmFoilPriceCents != null) {
    rows.push({
      condition: "foil",
      priceCents: card.cmFoilPriceCents,
      productName: `${label} (foil)`,
    });
  }

  return pricedOffers(
    PRICE_SOURCE,
    rows.map((row) => ({
      condition: row.condition,
      priceCents: row.priceCents,
      rawValue: card,
      extra: {
        currency: "EUR",
        productName: row.productName,
        sourceUrl:
          card.cardmarketProductId != null
            ? `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${card.cardmarketProductId}`
            : undefined,
        metadataScoped: true,
      },
    })),
  );
}

async function refreshTcgdexOffers(ctx: BarcodePriceRefreshContext) {
  if (ctx.shelfType !== "tcg") return [];
  const printKey = printKeyFromContext(ctx);
  if (!printKey || parsePrintKey(printKey)?.game !== POKEMON_GAME) return [];

  const card = await fetchTcgdexCardByPrintKey(printKey, {
    language: resolveLanguage(ctx),
    name: ctx.primaryName || ctx.primaryTitle,
    signal: ctx.signal,
  });
  if (!card) return [];
  return offersFromCard(card);
}

export const tcgdexModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["tcg"],
    nameDatabase: true,
    capabilities: ["identify", "cover", "description", "people", "price"],
    auth: { kind: "none" },
    supplyMode: "api_live",
    canonical: true,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    remoteImageFallback: true,
    coverUrlHost: "assets.tcgdex.net",
    coverProvenanceRules: {
      catalog: ["assets.tcgdex.net"],
    },
    websiteUrl: "https://tcgdex.dev/",
    notes:
      "Catalogue Pokémon TCG (TCGdex). API REST sans clé, FR par défaut, jaquettes HD sur assets.tcgdex.net, cotes Cardmarket en EUR. Identité = tirage imprimé (set + numéro) ; les effets foil Unity viennent du pack pokemon (TCG Live), pas de masques first-party TCGdex.",
    referencePriceSource: true,
  },
  evidence: {
    label: PROVIDER_LABEL,
    sourceWeight: 0.9,
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_ID,
      async resolve(ctx) {
        return mapTcgdexMetadata(await resolveTcgdexCard(ctx));
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const cards = await searchTcgdexCards(cleanedName, {
      limit: 10,
      hydrate: false,
    });
    return Array.from(new Set(cards.map((card) => card.name)));
  },
  searchPrints: async ({ query, language, limit, signal }) => {
    const cards = await searchTcgdexCards(query, {
      language: tcgdexLanguageFromLiveOrDex(language) ?? undefined,
      limit,
      signal,
    });
    // Picker grid needs a face. Some TCGdex rows have no `image` (e.g. McDonald's
    // 2024sv) — keep them out of the add UI rather than empty muted tiles.
    return cards
      .map(toPrintCandidate)
      .filter((candidate) =>
        Boolean(candidate.thumbnailUrl || candidate.imageUrl),
      );
  },
  lookupPrint: async ({ printKey, name, language, signal }) => {
    if (parsePrintKey(printKey)?.game !== POKEMON_GAME) return null;
    const card = await fetchTcgdexCardByPrintKey(printKey, {
      language: tcgdexLanguageFromLiveOrDex(language) ?? undefined,
      name,
      signal,
    });
    return card ? toPrintCandidate(card) : null;
  },
  suggestFoilPlayroomSamples: (needs) =>
    suggestTcgdexFoilPlayroomSamples(needs),
  refreshBarcodePriceOffers: refreshTcgdexOffers,
  healthCheck: createMetadataHealthCheck(
    PROVIDER_ID,
    PROVIDER_LABEL,
    async () => {
      const start = Date.now();
      const isUp = await pingUrl(
        "https://api.tcgdex.net/v2/fr/cards/sv03.5-001",
      );
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
  testHandlers: {
    "tcgdex-search": {
      label: "TCGdex - Recherche",
      kind: "metadata",
      run: (query) => searchTcgdexCards(query, { limit: 10 }),
    },
    "tcgdex-printkey": {
      label: "TCGdex - Clé de tirage",
      kind: "metadata",
      run: (query) => fetchTcgdexCardByPrintKey(query),
    },
  },
  mappingProbe: {
    sampleInput: "Dracaufeu",
    context: { name: "Dracaufeu", printKey: "pokemon:sv03.5-006" },
  },
  runMappingProbe: async () => {
    const card = await fetchTcgdexCardByPrintKey("pokemon:sv03.5-006", {
      name: "Dracaufeu",
    });
    return metadataProbe(mapTcgdexMetadata(card));
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Dracaufeu",
      printKey: "pokemon:sv03.5-006",
    });
    return mappingRawKeysFromFetch(async () => {
      if (ctx.printKey) {
        return fetchTcgdexCardByPrintKey(ctx.printKey, { name: ctx.name });
      }
      const [card] = await searchTcgdexCards(ctx.name, { limit: 1 });
      return card ?? null;
    });
  },
};
