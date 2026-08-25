import { enumerateSetPrints } from "@/providers/shared/cardCatalogue/setPrints";
import { distinctPrintLanguages } from "@/providers/shared/cardCatalogue/languages";
import { tcgdexDbPath } from "./indexStore";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
import { catalogAliasesFromNames } from "@/core/enrich/aliases";
import {
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/core/enrich/observations";
import { parsePrintKey } from "@/core/identify/printKey";
import {
  listTcgdexLocalSets,
  searchTcgdexRows,
  type TcgdexSearchRow,
} from "./indexStore";
import { loadTcgdexSetLogoIndex } from "./setLogos";
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
  MetadataAdapterContext,
  MetadataProviderAdapter,
  PrintCandidate,
} from "@/types/providerModule";
import { defineProvider } from "@/providers/shared/defineProvider";

import {
  createPrintKeyPriceRefresh,
  dualFinishPriceRows,
} from "@/providers/shared/createPrintKeyPriceModule";

import {
  POKEMON_GAME,
  fetchTcgdexCardById,
  fetchTcgdexCardByPrintKey,
  isTcgdexLanguage,
  resolveTcgdexLanguage,
  searchTcgdexCards,
  tcgdexCollectorNumberLabel,
  tcgdexImageUrl,
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
  if (identity && identity.game !== POKEMON_GAME) return null;

  if (printKey && identity?.game === POKEMON_GAME) {
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

const refreshTcgdexOffers = createPrintKeyPriceRefresh<TcgdexCard>({
  priceSource: PRICE_SOURCE,
  currency: "EUR",
  printGame: POKEMON_GAME,
  fetchCard: (printKey, { signal, ctx }) =>
    fetchTcgdexCardByPrintKey(printKey, {
      language: resolveLanguage(ctx),
      name: ctx.primaryName || ctx.primaryTitle,
      signal,
    }),
  priceRows: (card) =>
    dualFinishPriceRows({
      label: tcgdexPrintLabel(card),
      newCents: card.cmPriceCents,
      foilCents: card.cmFoilPriceCents,
      sourceUrl:
        card.cardmarketProductId != null
          ? `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${card.cardmarketProductId}`
          : undefined,
    }),
});

/**
 * Une ligne de la base locale, rendue sous la forme d'une carte du catalogue.
 *
 * Reconstruire un `TcgdexCard` plutôt que de fabriquer un candidat directement
 * garde **une seule** mise en forme : `toPrintCandidate` ne sait pas d'où vient
 * la carte, et la sortie locale ne peut donc pas dériver de la distante.
 *
 * Les champs absents le sont pour de bon : le brief d'un set ne porte ni
 * rareté ni type — la recherche distante ne les avait pas non plus. En
 * revanche le nom du set et de la série, eux, arrivent **avec** la moisson,
 * là où le distant demandait un appel de plus par set.
 */
function cardFromLocalRow(row: TcgdexSearchRow): TcgdexCard {
  return {
    providerId: row.providerId,
    printKey: row.printKey,
    setId: row.setId,
    setName: row.setName,
    serieName: row.serieName,
    serieId: null,
    setOfficialCount: null,
    setTotalCount: null,
    localId: row.localId,
    language: (isTcgdexLanguage(row.lang)
      ? row.lang
      : "fr") as TcgdexCard["language"],
    name: row.name,
    rarity: null,
    stage: null,
    category: null,
    types: [],
    hp: null,
    evolveFrom: null,
    regulationMark: null,
    illustrator: null,
    finishes: [],
    imageBaseUrl: row.imageBaseUrl,
    imageUrl: tcgdexImageUrl(row.imageBaseUrl, "high", "png"),
    thumbnailUrl: tcgdexImageUrl(row.imageBaseUrl, "low", "webp"),
    cmPriceCents: null,
    cmFoilPriceCents: null,
    cardmarketProductId: null,
  };
}

export const tcgdexModule = defineProvider({
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    catalogueLabel: "Pokémon",
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
  /*
    Même source que les visuels de set : l'index tcgdex déjà sur disque. On ne
    liste que ce qui a un nom — un identifiant nu ne se choisit pas.
  */
  /* Le catalogue moissonné d'abord ; l'index de logos en repli. */
  /** Ce que la moisson a réellement rapporté, pas ce que TCGdex publie. Voir `distinctPrintLanguages`. */
  listPrintLanguages: () => distinctPrintLanguages(tcgdexDbPath()),
  listPrintSets: (_type, language) => {
    const local = listTcgdexLocalSets(language ?? undefined);
    if (local.length > 0) return local;
    return (loadTcgdexSetLogoIndex()?.sets ?? [])
      .filter((row) => row.name?.trim())
      .map((row) => ({ id: row.id, label: row.name!.trim() }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
  },
  /*
    L'énumération lit la base locale, plafond levé — la check-list compte, elle
    n'échantillonne pas. Pas de repli distant : un décompte tiré d'un catalogue
    absent serait faux, et mieux vaut ne rien annoncer.
  */
  printGames: [POKEMON_GAME],
  listSetPrints: async ({ setId, language }) =>
    enumerateSetPrints({
      setId,
      language,
      search: (opts) =>
        searchTcgdexRows(opts.query, {
          language: opts.language,
          limit: opts.limit,
          setId: opts.setId,
        })
          .map(cardFromLocalRow)
          .map(toPrintCandidate),
    }),
  searchPrints: async ({ query, language, limit, signal, setId }) => {
    /*
      La base locale d'abord : même donnée, sans le réseau. Mesuré avant
      moisson — 327 ms l'appel distant, contre 42 à 56 ms pour les packs qui
      lisent leur base. Le distant reste le repli tant que la moisson n'a pas
      tourné : un catalogue vide ne doit pas rendre l'ajout impossible.
    */
    const localRows = searchTcgdexRows(query, {
      language: language ?? undefined,
      limit,
      setId,
    });
    const cards =
      localRows.length > 0
        ? localRows.map(cardFromLocalRow)
        : await searchTcgdexCards(query, {
            language: tcgdexLanguageFromLiveOrDex(language) ?? undefined,
            limit,
            signal,
            setId,
          });
    /*
      Une carte sans face **descend**, elle ne disparaît pas.

      Elle était écartée pour ne pas remplir la grille de tuiles vides. Mais
      1507 tirages n'ont pas d'image chez la source — dont les 406 Kits du
      dresseur, qui n'en ont aucune — et les écarter les rendait tout
      simplement **impossibles à ajouter** : la carte existe, le collectionneur
      l'a en main, et le catalogue prétendait le contraire.

      Reléguer plutôt que cacher, c'est la règle qu'on applique déjà aux visuels
      de la mauvaise console.
    */
    const candidates = cards.map(toPrintCandidate);
    const hasFace = (candidate: (typeof candidates)[number]) =>
      Boolean(candidate.thumbnailUrl || candidate.imageUrl);
    return [
      ...candidates.filter(hasFace),
      ...candidates.filter((candidate) => !hasFace(candidate)),
    ];
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
});
