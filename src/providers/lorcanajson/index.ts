import { enumerateSetPrints } from "@/providers/shared/cardCatalogue/setPrints";
import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import { lorcanaTcgDbPath } from "@/providers/lorcanatcg/indexStore";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { catalogAliasesFromNames } from "@/core/enrich/aliases";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { parsePrintKey } from "@/core/identify/printKey";
import {
  listLorcanaTcgSets,
  searchLorcanaTcgRows,
  type LorcanaTcgSearchRow,
} from "@/providers/lorcanatcg/indexStore";
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
import {
  faceQuarterTurnsForLorcanaPrint,
  LORCANA_EFFECT_PACK_ID,
} from "@/effects/lorcana";
import { withPackCardUrls } from "@/effects/lorcana/packAssets";
import type {
  MetadataAdapterContext,
  MetadataProviderAdapter,
  PrintCandidate,
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";

import {
  fetchLorcanaCardByPrintKey,
  fetchLorcanaCardByProviderId,
  fetchLorcanaLanguageVariants,
  isLorcanaLanguage,
  LORCANA_DEFAULT_LANGUAGE,
  LORCANA_GAME,
  lorcanaCollectorNumberLabel,
  lorcanaPrintLabel,
  searchLorcanaCards,
  type LorcanaCard,
  type LorcanaLanguage,
  listLorcanaPrintSets,
} from "./fetch";

export {
  fetchLorcanaCardByPrintKey,
  fetchLorcanaCardByProviderId,
  fetchLorcanaLanguageVariants,
  loadLorcanaIndex,
  loadLorcanaIndexes,
  lorcanaLanguagesToTry,
  searchLorcanaCards,
} from "./fetch";

import { suggestLorcanaFoilPlayroomSamples } from "./playroomSamples";

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
  // Both looks were transcribed months ago and then never wired up: the two
  // names were missing from this table alone, so every Tempest and CalendarWave
  // print fell through to the everyday silver. Found by reading the mobile
  // app's own finish vocabulary — see `docs/tcg_support.md` §7.
  Tempest: "tempest",
  CalendarWave: "calendarWave",
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

function buildAttachments(
  variants: LorcanaCard[],
): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];

  for (const card of variants) {
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
  }

  return attachments.length > 0 ? attachments : undefined;
}

function regionalTitlesFromVariants(variants: LorcanaCard[]) {
  const seen = new Set<string>();
  const titles: { region: string; text: string }[] = [];
  for (const card of variants) {
    if (seen.has(card.language)) continue;
    seen.add(card.language);
    titles.push({ region: card.language, text: card.fullName });
  }
  return titles;
}

function buildFacts(card: LorcanaCard): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      // `format` (not `identifier`): identifiers are hidden from the detail
      // table; collectors need the printed number next to Extension / Rareté.
      kind: "format",
      label: "Numéro",
      value: lorcanaCollectorNumberLabel(card),
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

  if (card.cost != null) {
    facts.push({
      kind: "tag",
      label: "Coût",
      value: String(card.cost),
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 23,
    });
  }

  if (card.inkwell != null) {
    facts.push({
      kind: "tag",
      label: "Encrier",
      value: card.inkwell ? "Oui" : "Non",
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 22,
    });
  }

  if (card.lore != null) {
    facts.push({
      kind: "tag",
      label: "Lore",
      value: String(card.lore),
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 21,
    });
  }

  if (card.strength != null) {
    facts.push({
      kind: "tag",
      label: "Force",
      value: String(card.strength),
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 20,
    });
  }

  if (card.willpower != null) {
    facts.push({
      kind: "tag",
      label: "Volonté",
      value: String(card.willpower),
      source: PROVIDER_ID,
      confidence: 0.9,
      priority: 19,
    });
  }

  if ((card.subtypes ?? []).length > 0) {
    facts.push({
      kind: "tag",
      label: "Sous-types",
      value: card.subtypes.join(" • "),
      source: PROVIDER_ID,
      confidence: 0.85,
      priority: 18,
    });
  }

  if (card.story) {
    facts.push({
      kind: "tag",
      label: "Univers",
      value: card.story,
      source: PROVIDER_ID,
      confidence: 0.85,
      priority: 17,
    });
  }

  if (card.artists.length > 0) {
    facts.push({
      kind: "artist",
      label: "Illustration",
      value: card.artists.join(" • "),
      source: PROVIDER_ID,
      confidence: 0.88,
      priority: 16,
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
      priority: 15,
    });
  }

  return facts;
}

/** One shape for both the search results and a lookup by key. */
/**
 * Une ligne de la base locale, rendue sous la forme d'une carte du catalogue.
 *
 * Reconstruire un `LorcanaCard` plutôt que de fabriquer un candidat directement
 * garde **une seule** mise en forme : `toPrintCandidate` ne sait pas d'où vient
 * la carte, et la sortie locale ne peut donc pas dériver de la distante.
 */
function cardFromLocalRow(row: LorcanaTcgSearchRow): LorcanaCard {
  const list = (raw: string | null): string[] => {
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [];
    } catch {
      return [];
    }
  };
  return {
    providerId: row.providerId ?? row.printKey,
    printKey: row.printKey,
    setCode: row.setCode ?? "",
    setName: row.setName,
    number: Number.parseInt(row.number ?? "0", 10) || 0,
    setCardCount: row.setCardCount,
    variant: row.variant,
    promoGrouping: row.promoGrouping,
    language: (isLorcanaLanguage(row.lang)
      ? row.lang
      : LORCANA_DEFAULT_LANGUAGE) as LorcanaCard["language"],
    fullName: row.fullName,
    name: row.name ?? row.fullName,
    version: row.version,
    rarity: row.rarity,
    cardType: row.cardType,
    color: row.color,
    cost: row.cost,
    lore: row.lore,
    strength: row.strength,
    willpower: row.willpower,
    subtypes: list(row.subtypesJson),
    // SQLite ne connaît pas le booléen : 0 doit revenir `false`, pas `null`.
    inkwell: row.inkwell == null ? null : row.inkwell !== 0,
    artists: list(row.artistsJson),
    story: row.story,
    flavorText: row.flavorText,
    foilTypes: list(row.foilTypesJson),
    varnishType: row.varnishType,
    imageUrl: row.imageUrl,
    thumbnailUrl: row.thumbnailUrl,
    foilMaskUrl: row.foilMaskUrl,
    fullFoilUrl: row.fullFoilUrl,
    varnishMaskUrl: row.varnishMaskUrl,
    secondVarnishMaskUrl: row.secondVarnishMaskUrl,
    foilEffectColors: list(row.foilEffectColorsJson),
    cardmarketUrl: row.cardmarketUrl,
    searchName: row.searchName ?? row.fullName.toLowerCase(),
  };
}

export function toPrintCandidate(card: LorcanaCard): PrintCandidate {
  const faceQuarterTurns = faceQuarterTurnsForLorcanaPrint({
    cardType: card.cardType,
  });
  return withPackCardUrls({
    printKey: card.printKey,
    title: card.fullName,
    reference: lorcanaPrintLabel(card),
    rarity: card.rarity,
    category: card.cardType,
    ...(faceQuarterTurns ? { faceQuarterTurns } : {}),
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
    effectPack: LORCANA_EFFECT_PACK_ID,
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
    // Published as `foilEffectColors` — nothing else predicts the hue.
    varnishColor: card.foilEffectColors[0] ?? null,
    secondVarnishMaskUrl: card.secondVarnishMaskUrl,
    secondVarnishColor: card.foilEffectColors[1] ?? null,
    varnishShaders:
      card.varnishType && VARNISH_SHADERS[card.varnishType]
        ? { [card.varnishType]: VARNISH_SHADERS[card.varnishType] as string }
        : {},
    externalIds: { [PROVIDER_ID]: card.providerId },
  });
}

/**
 * Preferred-language fields for title / description / facts; every published
 * language contributes a cover (+ foil mask) and a regional title.
 *
 * `variants` must be preferred-first (as from {@link fetchLorcanaLanguageVariants}).
 * When omitted, only `card` is stored — useful for unit tests of mapping alone.
 */
export function mapLorcanaMetadata(
  card: LorcanaCard | null,
  variants?: LorcanaCard[],
): MetadataResult | null {
  if (!card) return null;

  const languageRows =
    variants && variants.length > 0 ? variants : ([card] as LorcanaCard[]);
  // Prefer the resolved card's language for primary fields even if a caller
  // passed variants in a different order.
  const ordered = [
    card,
    ...languageRows.filter((row) => row.language !== card.language),
  ];

  const metadata: MetadataResult = {
    title: card.fullName,
    description: card.flavorText ?? undefined,
    imageUrl: card.imageUrl ?? undefined,
    authors:
      card.artists.length > 0
        ? card.artists.map((name) => ({ name }))
        : undefined,
    publishers: [{ name: "Ravensburger" }],
    regionalTitles: regionalTitlesFromVariants(ordered),
    // Other-language full names → "Aussi connu sous" (EN/DE/IT next to FR primary).
    aliases: catalogAliasesFromNames(
      card.fullName,
      ordered.map((row) => row.fullName),
    ),
    attachments: buildAttachments(ordered),
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
  /*
    Un `printKey` est une **affirmation d'identité** : l'objet est ce tirage-là,
    de ce jeu-là. Quand il en nomme un autre, ce provider n'a rien à en dire et
    se tait.

    Sans ce garde, on sautait bien la recherche par clé — puis on retombait sur
    la recherche par **nom**, qui rendait la première carte approchante. Des
    noms courts suffisaient à faire mouche par sous-chaîne : sur une étagère
    Naruto, « Inari » est devenu « Illum*inari*um », « Chou » → « At*chou*m »,
    « Haku » → « *Haku*na Matata ». Quatre objets sur trente-six, tous
    confidemment faux.

    Une clé illisible ne bloque pas : c'est l'absence d'affirmation, pas une
    affirmation contraire, et la recherche par nom reste alors le seul recours.
  */
  const identity = printKey ? parsePrintKey(printKey) : null;
  if (identity && identity.game !== LORCANA_GAME) return null;

  if (printKey && identity?.game === LORCANA_GAME) {
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

async function resolveLorcanaMetadata(
  ctx: MetadataAdapterContext,
): Promise<MetadataResult | null> {
  const card = await resolveLorcanaCard(ctx);
  if (!card) return null;
  const variants = await fetchLorcanaLanguageVariants(card.providerId, {
    language: resolveLanguage(ctx),
    signal: ctx.signal,
  });
  return mapLorcanaMetadata(card, variants);
}

export const lorcanajsonModule = defineProvider({
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    catalogueLabel: "Lorcana",
    types: ["tcg"],
    nameDatabase: true,
    capabilities: ["identify", "cover", "description", "people"],
    auth: { kind: "none" },
    supplyMode: "api_live",
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
      "Jeu de cartes Disney Lorcana. Fichiers statiques publics, sans clé, en FR/EN/DE/IT, avec les visuels officiels Ravensburger et — rare — le masque holographique par carte (98 % des tirages). Stocke une jaquette (et titre) par langue pour le même tirage ; la langue préférée reste le défaut. Aucune donnée de prix : voir le provider Lorcast. L'identité vient du tirage imprimé (extension + numéro + promo), jamais d'un code-barres : une carte à l'unité n'en a pas. Complète `lorcanatcg` (dump app/Unity local) — ne pas attribuer les octets app à cette source.",
  },
  evidence: {
    label: PROVIDER_LABEL,
    sourceWeight: 0.9,
  },
  createMetadataAdapter() {
    return {
      id: PROVIDER_ID,
      async resolve(ctx) {
        return resolveLorcanaMetadata(ctx);
      },
    } satisfies MetadataProviderAdapter;
  },
  suggestDatabaseTitles: async ({ cleanedName }) => {
    const cards = await searchLorcanaCards(cleanedName, { limit: 10 });
    // Several prints share a name; the picker exists to tell them apart.
    return Array.from(new Set(cards.map((card) => card.fullName)));
  },
  /*
    Les extensions viennent de l'index de logos déjà tenu sur disque : c'est le
    même relevé qui nomme les sets pour les visuels, donc les deux ne peuvent
    pas diverger. Absent tant qu'aucune synchro n'a tourné — on rend alors une
    liste vide plutôt qu'une liste devinée.
  */
  /* Les extensions de la base locale ; les JSON distants en repli. */
  /** Le catalogue local sert fr/en/de/it ; la liste se lit dans la base. Voir `distinctPrintLanguages`. */
  listPrintLanguages: () => distinctPrintLanguages(lorcanaTcgDbPath()),
  listPrintSets: async (_type, language) => {
    const local = listLorcanaTcgSets(language ?? undefined);
    return local.length > 0 ? local : listLorcanaPrintSets();
  },
  /*
    L'énumération lit la base locale, plafond levé — la check-list compte, elle
    n'échantillonne pas. Pas de repli distant ici : un décompte tiré d'un
    catalogue absent serait faux, et mieux vaut ne rien annoncer.
  */
  printGames: [LORCANA_GAME],
  listSetPrints: async ({ setId, language }) =>
    enumerateSetPrints({
      setId,
      language,
      search: (opts) =>
        searchLorcanaTcgRows(opts.query, {
          language: opts.language,
          limit: opts.limit,
          setId: opts.setId,
        }).map((row) => toPrintCandidate(cardFromLocalRow(row))),
    }),
  searchPrints: async ({ query, language, limit, signal, setId }) => {
    /*
      La base locale d'abord : c'est la même donnée, sans le réseau, et c'est
      elle qui connaît les identifiants d'extension que le sélecteur propose.
      Les JSON distants restent le repli tant qu'aucune synchro n'a tourné —
      un catalogue vide ne doit pas rendre l'ajout impossible.
    */
    const local = searchLorcanaTcgRows(query, {
      language: language ?? undefined,
      limit,
      setId,
    });
    if (local.length > 0) {
      const seen = new Set<string>();
      const out: PrintCandidate[] = [];
      for (const row of local) {
        if (seen.has(row.printKey)) continue;
        seen.add(row.printKey);
        out.push(toPrintCandidate(cardFromLocalRow(row)));
        if (limit && out.length >= limit) break;
      }
      return out;
    }
    const cards = await searchLorcanaCards(query, {
      language: isLorcanaLanguage(language) ? language : undefined,
      limit,
      signal,
      setId,
    });
    return cards.map((card) => toPrintCandidate(card));
  },
  lookupPrint: async ({ printKey, name, language, signal }) => {
    if (parsePrintKey(printKey)?.game !== LORCANA_GAME) return null;
    const card = await fetchLorcanaCardByPrintKey(printKey, {
      language: isLorcanaLanguage(language) ? language : undefined,
      name,
      signal,
    });
    if (!card) return null;
    return toPrintCandidate(card);
  },
  suggestFoilPlayroomSamples: (needs) =>
    suggestLorcanaFoilPlayroomSamples(needs),
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
});
