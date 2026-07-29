import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
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

import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
  PrintCandidate,
  ProviderModule,
} from "@/types/providerModule";

import {
  fetchLorcanaCardByPrintKey,
  fetchLorcanaCardByProviderId,
  isLorcanaLanguage,
  LORCANA_DEFAULT_LANGUAGE,
  LORCANA_GAME,
  lorcanaPrintLabel,
  searchLorcanaCards,
  type LorcanaCard,
  type LorcanaLanguage,
} from "./fetch";

export {
  fetchLorcanaCardByPrintKey,
  fetchLorcanaCardByProviderId,
  loadLorcanaIndex,
  searchLorcanaCards,
} from "./fetch";

import { loadPrintFoilIndex, type PrintFoilDetails } from "./catalog";

const PROVIDER_ID = "lorcanajson";
/** LorcanaJSON's name for a print with no foil treatment. */
const PLAIN_FINISH = "None";

/**
 * Which look each of Ravensburger's finishes is drawn with.
 *
 * The finish is what decides the effect — not the rarity, and not the card.
 * An Enchanted Elsa does not carry `Silver` at all: her only finish is `Lava`,
 * which is exactly why she does not look like the other 2703 silver prints.
 *
 * Only the names that visibly differ are listed. Anything absent falls back to
 * the everyday foil, which is the honest answer for a finish nobody has looked
 * at yet: the copy is foil, we just have no better word for how.
 */
const FINISH_SHADERS: Readonly<Record<string, string>> = {
  Silver: "silver",
  Satin: "satin",
  Lore: "lore",
  Lava: "lava",
  Magma: "magma",
  Glitter: "glitter",
  VerticalWave: "verticalWave",
  SeaWave: "seaWave",
  RainbowPillars: "rainbowPillars",
  FreeForm1: "freeForm",
  FreeForm2: "freeForm",
};

/**
 * And the same for the varnish, a separate coat with its own names.
 *
 * `None` is deliberately absent from both tables, so a plain copy cannot pick
 * up a look even by accident.
 */
const VARNISH_SHADERS: Readonly<Record<string, string>> = {
  HighGloss: "hotFoil",
  MatteHotFoil: "hotFoil",
  MetallicHotFoil: "hotFoil",
  SnowHotFoil: "hotFoil",
  // Distinct from `ChromeRainbowHotFoil`, and drawn by the generic coat — only
  // the Chrome one gets its own rule upstream.
  RainbowHotFoil: "hotFoil",
  ChromeRainbowHotFoil: "chromeRainbowHotFoil",
};
const PROVIDER_LABEL = "LorcanaJSON";

/**
 * Which language's printing to resolve. The item's own language would be a
 * better signal, but nothing carries it yet (see `docs/tcg_support.md` §4), so
 * French is the default and an explicit external id can override it.
 */
function resolveLanguage(ctx: MetadataAdapterContext): LorcanaLanguage {
  const requested = ctx.externalIds?.lorcanaLanguage;
  return isLorcanaLanguage(requested) ? requested : LORCANA_DEFAULT_LANGUAGE;
}

function buildAttachments(card: LorcanaCard): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];

  if (card.imageUrl) {
    attachments.push({
      type: "cover",
      url: card.imageUrl,
      title: card.fullName,
      role: card.language,
      source: PROVIDER_ID,
    });
  }

  /**
   * The mask is not artwork — it is the alpha layer that says where the
   * holographic effect applies. Kept as its own attachment type so gallery
   * ranking never shows it as a picture of the card.
   */
  if (card.foilMaskUrl) {
    attachments.push({
      type: "foilMask",
      url: card.foilMaskUrl,
      title: `${card.fullName} — masque holographique`,
      role: card.language,
      source: PROVIDER_ID,
    });
  }

  return attachments.length > 0 ? attachments : undefined;
}

function buildFacts(card: LorcanaCard): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      kind: "identifier",
      label: "Référence",
      value: lorcanaPrintLabel(card),
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

  /**
   * The finishes this print *exists* in. Which one is in the sleeve belongs to
   * the item, not to the card — recording it here would claim every copy is
   * foil. Exposed as a readable tag only — the variant picker asks the provider
   * by print key instead of reading a persisted copy, because `Metadata.facts`
   * is rebuilt from field evidence after storage and a fact kind would have to
   * survive two separate allow-lists to get through.
   */
  if (card.foilTypes.length > 0) {
    facts.push({
      kind: "tag",
      label: "Finitions existantes",
      value: card.foilTypes.join(" • "),
      source: PROVIDER_ID,
      confidence: 0.85,
      priority: 30,
    });
  }

  if (card.varnishType) {
    facts.push({
      kind: "tag",
      label: "Vernis",
      value: card.varnishType,
      source: PROVIDER_ID,
      confidence: 0.85,
      priority: 28,
    });
  }

  if (card.cardType) {
    facts.push({
      kind: "tag",
      label: "Type",
      value: card.cardType,
      source: PROVIDER_ID,
      confidence: 0.88,
      priority: 26,
    });
  }

  if (card.color) {
    facts.push({
      kind: "tag",
      label: "Encre",
      value: card.color,
      source: PROVIDER_ID,
      confidence: 0.88,
      priority: 24,
    });
  }

  if (card.story) {
    facts.push({
      kind: "tag",
      label: "Univers",
      value: card.story,
      source: PROVIDER_ID,
      confidence: 0.85,
      priority: 22,
    });
  }

  if (card.artists.length > 0) {
    facts.push({
      kind: "artist",
      label: "Illustration",
      value: card.artists.join(" • "),
      source: PROVIDER_ID,
      confidence: 0.88,
      priority: 27,
    });
  }

  if (card.cardmarketUrl) {
    facts.push({
      kind: "external-link",
      label: "Cardmarket",
      value: "Voir la fiche",
      url: card.cardmarketUrl,
      source: PROVIDER_ID,
      confidence: 0.7,
      priority: 34,
    });
  }

  return facts;
}

/**
 * The stored foil details, or nothing.
 *
 * Kept behind a helper so both entry points read it the same way and neither
 * can fail on it: the coats render without their own hue if it is missing,
 * which is exactly what happened before this existed.
 */
async function printFoilIndex(
  language: string | null | undefined,
  signal?: AbortSignal,
) {
  return loadPrintFoilIndex({
    providerId: PROVIDER_ID,
    language: isLorcanaLanguage(language) ? language : LORCANA_DEFAULT_LANGUAGE,
    signal,
  });
}

/** One shape for both the search results and a lookup by key. */
export function toPrintCandidate(
  card: LorcanaCard,
  foil?: PrintFoilDetails,
): PrintCandidate {
  return {
    printKey: card.printKey,
    title: card.fullName,
    reference: lorcanaPrintLabel(card),
    rarity: card.rarity,
    thumbnailUrl: card.thumbnailUrl ?? card.imageUrl,
    imageUrl: card.imageUrl,
    language: card.language,
    finishes: card.foilTypes,
    // `None` is Lorcana's word for "no foil"; every other value is an effect.
    plainFinishes: card.foilTypes.filter((finish) => finish === PLAIN_FINISH),
    // The table is the only gate: `None` is deliberately absent from it, so a
    // plain copy cannot pick up a look even by accident.
    finishShaders: Object.fromEntries(
      card.foilTypes
        .filter((finish) => FINISH_SHADERS[finish])
        .map((finish) => [finish, FINISH_SHADERS[finish] as string]),
    ),
    variantImageUrls: card.fullFoilUrl
      ? Object.fromEntries(
          card.foilTypes
            .filter((finish) => finish !== PLAIN_FINISH)
            .map((finish) => [finish, card.fullFoilUrl as string]),
        )
      : undefined,
    foilMaskUrl: card.foilMaskUrl,
    varnishMaskUrl: card.varnishMaskUrl,
    varnishType: card.varnishType,
    // The catalogue's own hue for the stamped coat. Absent for all but 83
    // prints, and nothing derives it — see `catalog.ts`.
    varnishColor: foil?.hotFoilColor ?? null,
    varnishShaders:
      card.varnishType && VARNISH_SHADERS[card.varnishType]
        ? { [card.varnishType]: VARNISH_SHADERS[card.varnishType] as string }
        : {},
    externalIds: { [PROVIDER_ID]: card.providerId },
  };
}

export function mapLorcanaMetadata(
  card: LorcanaCard | null,
): MetadataResult | null {
  if (!card) return null;

  const metadata: MetadataResult = {
    title: card.fullName,
    description: card.flavorText ?? undefined,
    imageUrl: card.imageUrl ?? undefined,
    authors:
      card.artists.length > 0
        ? card.artists.map((name) => ({ name }))
        : undefined,
    publishers: [{ name: "Ravensburger" }],
    regionalTitles: [{ region: card.language, text: card.fullName }],
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
      sourceUrl: "https://lorcanajson.org/",
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

/**
 * Resolution order mirrors how confident each handle is: the provider's own id
 * is exact, the print key is what the collector reads off the card, and a name
 * search is the last resort.
 */
async function resolveLorcanaCard(
  ctx: MetadataAdapterContext,
): Promise<LorcanaCard | null> {
  const language = resolveLanguage(ctx);
  const options = { language, signal: ctx.signal };

  const pinnedId = ctx.externalIds?.[PROVIDER_ID]?.trim();
  if (pinnedId) {
    const pinned = await fetchLorcanaCardByProviderId(pinnedId, options);
    if (pinned) return pinned;
  }

  const printKey = ctx.printKey?.trim() || ctx.externalIds?.printKey?.trim();
  if (printKey && parsePrintKey(printKey)?.game === LORCANA_GAME) {
    const byKey = await fetchLorcanaCardByPrintKey(printKey, {
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
    const [best] = await searchLorcanaCards(query, { ...options, limit: 1 });
    if (best) return best;
  }

  return null;
}

export const lorcanajsonModule: ProviderModule = {
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["tcg"],
    nameDatabase: true,
    capabilities: ["identify", "cover", "description", "people"],
    auth: { kind: "none" },
    canonical: true,
    defaultLanguage: "fr",
    isRealBoxCover: true,
    remoteImageFallback: true,
    coverUrlHost: "api.lorcana.ravensburger.com",
    coverProvenanceRules: {
      catalog: ["api.lorcana.ravensburger.com"],
    },
    websiteUrl: "https://lorcanajson.org/",
    notes:
      "Jeu de cartes Disney Lorcana. Fichiers statiques publics, sans clé, en FR/EN/DE/IT, avec les visuels officiels Ravensburger et — rare — le masque holographique par carte (98 % des tirages). Aucune donnée de prix : LorcanaJSON n'en publie pas. L'identité vient du tirage imprimé (extension + numéro + promo), jamais d'un code-barres : une carte à l'unité n'en a pas.",
  },
  evidence: {
    label: PROVIDER_LABEL,
    sourceWeight: 0.9,
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_ID,
      async resolve(ctx) {
        return mapLorcanaMetadata(await resolveLorcanaCard(ctx));
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const cards = await searchLorcanaCards(cleanedName, { limit: 10 });
    // Several prints share a name; the picker exists to tell them apart.
    return Array.from(new Set(cards.map((card) => card.fullName)));
  },
  searchPrints: async ({ query, language, limit, signal }) => {
    const cards = await searchLorcanaCards(query, {
      language: isLorcanaLanguage(language) ? language : undefined,
      limit,
      signal,
    });
    const foils = await printFoilIndex(language, signal);
    return cards.map((card) => toPrintCandidate(card, foils[card.providerId]));
  },
  lookupPrint: async ({ printKey, name, language, signal }) => {
    if (parsePrintKey(printKey)?.game !== LORCANA_GAME) return null;
    const card = await fetchLorcanaCardByPrintKey(printKey, {
      language: isLorcanaLanguage(language) ? language : undefined,
      name,
      signal,
    });
    if (!card) return null;
    const foils = await printFoilIndex(language, signal);
    return toPrintCandidate(card, foils[card.providerId]);
  },
  healthCheck: createMetadataHealthCheck(
    PROVIDER_ID,
    PROVIDER_LABEL,
    async () => {
      const start = Date.now();
      const isUp = await pingUrl(
        "https://lorcanajson.org/files/current/fr/metadata.json",
      );
      return {
        ok: isUp,
        latency: Date.now() - start,
        error: isUp ? null : "Host unreachable",
      };
    },
  ),
  testHandlers: {
    "lorcanajson-search": {
      label: "LorcanaJSON - Recherche",
      kind: "metadata",
      run: (query) => searchLorcanaCards(query, { limit: 10 }),
    },
    "lorcanajson-printkey": {
      label: "LorcanaJSON - Clé de tirage",
      kind: "metadata",
      run: (query) => fetchLorcanaCardByPrintKey(query),
    },
  },
  mappingProbe: {
    sampleInput: "Elsa - Reine des neiges",
    context: { name: "Elsa - Reine des neiges" },
  },
  runMappingProbe: async () => {
    const [card] = await searchLorcanaCards("Elsa - Reine des neiges", {
      limit: 1,
    });
    return metadataProbe(mapLorcanaMetadata(card ?? null));
  },
  collectMappingRawKeys: async (context) => {
    const ctx = probeContextOrDefault(context, {
      name: "Elsa - Reine des neiges",
    });
    return mappingRawKeysFromFetch(async () => {
      const [card] = await searchLorcanaCards(ctx.name, { limit: 1 });
      return card ?? null;
    });
  },
};
