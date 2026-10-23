import {
  tcgdexAssetDiskId,
  type TcgdexSearchRow,
} from "./indexStore";
import { tcgdexCatalog } from "./catalog";
import { createMetadataHealthCheck, pingUrl } from "@/core/catalog/healthUtils";
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
import {
  faceQuarterTurnsForPokemonPrint,
  joinLiveForPrint,
} from "@/effects/pokemon/liveJoin";
import { assetsCardUrl } from "@/lib/packAssetUrls";
import {
  localPokemonCatalogueArtUrl,
  buildPokemonDiskArtAttachments,
} from "./disk/paperCardDisk";
import { lookupByBundle } from "@/effects/pokemon/liveCardsLookups";
import {
  paperArtUrl,
  paperCard,
  paperMaskUrl,
  resolveLiveBundleForPrintKey,
} from "@/effects/pokemon/resolveEffect";
import { appendUnreachableLiveFinishes } from "@/effects/pokemon/liveFinishVariants";

/**
 * Codes Live → libellés alignés sur `booster-composition.json` (TCGdex / FR).
 * Le brief set local n'a pas de rareté ; Live en porte une pour beaucoup de tirages.
 */
function rarityLabelFromLiveCode(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  const map: Record<string, string> = {
    IllustrationRare: "Illustration rare",
    SpecialIllustrationRare: "Special illustration rare",
    DoubleRare: "Double rare",
    HyperRare: "Hyper rare",
    RareUltra: "Ultra Rare",
    RareHolo: "Rare",
    Rare: "Rare",
    RareSecret: "Hyper rare",
    Ace: "ACE SPEC Rare",
    Common: "Common",
    Uncommon: "Uncommon",
  };
  return map[code] ?? code;
}

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
  tcgdexCardDisplayName,
  tcgdexImageUrl,
  tcgdexLocalizedImageBase,
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

/** Live paper front URL when the foil dump knows the print (no foil join). */
function livePaperFrontUrl(card: TcgdexCard): string | null {
  const bundle =
    resolveLiveBundleForPrintKey(card.printKey, card.language, card.name) ??
    null;
  if (!bundle) return null;
  return (
    paperArtUrl(
      bundle,
      paperCard(bundle)?.std?.cardTex ?? paperCard(bundle)?.ph?.cardTex,
    ) ?? null
  );
}

function buildAttachments(card: TcgdexCard): MetadataAttachment[] | undefined {
  const disk = buildPokemonDiskArtAttachments({
    printKey: card.printKey,
    language: card.language,
    source: PROVIDER_ID,
    title: card.name,
  });
  const attachments: MetadataAttachment[] = [...disk.attachments];
  // Live dump art (lang-first URL; set-first bytes OK via assets rewrite).
  if (attachments.length === 0) {
    const liveFront = livePaperFrontUrl(card);
    if (liveFront) {
      attachments.push({
        type: "cover",
        url: liveFront,
        title: card.name,
        role: "pokemon-face-live",
        source: PROVIDER_ID,
        coverProvenance: "catalog",
      });
    }
  }
  // Remote TCGdex scan only when no local face gallery (catalogue vignette).
  if (attachments.length === 0 && card.imageUrl) {
    attachments.push({
      type: "cover",
      url: card.imageUrl,
      title: card.name,
      role: "tcgdex-scan",
      source: PROVIDER_ID,
      coverProvenance: "catalog",
    });
  }
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
  const localPaper =
    localPokemonCatalogueArtUrl(card.printKey, card.language) ?? null;
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
    rarity: card.rarity ?? rarityLabelFromLiveCode(liveRarity) ?? null,
    category: card.category,
    setCode: card.setId,
    setLabel: card.setName?.trim() || card.setId,
    thumbnailUrl: liveFront ?? localPaper ?? tcgdexThumb,
    imageUrl: liveFront ?? localPaper ?? tcgdexFull,
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

/**
 * Candidat **check-list** : identité + vignette, sans join Live foil.
 *
 * Ordre : art disque catalogue (PokéCardex) → art Live dump (foil index, pas
 * de mask/shader) → CDN TCGdex localisé (`/fr/…`, EN au `onError` via
 * `tcgdexDisplayCandidates`).
 */
export function toChecklistPrintCandidate(
  card: TcgdexCard,
  opts?: { printed?: boolean },
): PrintCandidate {
  const lang = (card.language ?? "fr").trim().toLowerCase() || "fr";
  const localPaper =
    localPokemonCatalogueArtUrl(card.printKey, lang, undefined, {
      languages: [lang],
    }) ?? null;
  const liveFront = livePaperFrontUrl(card);
  const localizedBase = tcgdexLocalizedImageBase(card.imageBaseUrl, lang);
  const tcgdexThumb =
    tcgdexImageUrl(localizedBase, "low") ??
    card.thumbnailUrl ??
    card.imageUrl ??
    null;
  const thumb = localPaper ?? liveFront ?? tcgdexThumb;
  return {
    printKey: card.printKey,
    title: card.name,
    reference: tcgdexPrintLabel(card),
    rarity: card.rarity ?? null,
    category: card.category,
    setCode: card.setId,
    setLabel: card.setName?.trim() || card.setId,
    thumbnailUrl: thumb,
    imageUrl: thumb,
    language: card.language,
    finishes: card.finishes.length > 0 ? card.finishes : [PLAIN_FINISH],
    plainFinishes: [PLAIN_FINISH],
    effectPack: POKEMON_EFFECT_PACK_ID,
    ...(opts?.printed === false ? { printed: false } : {}),
    externalIds: {
      [PROVIDER_ID]: card.providerId,
    },
  };
}

export function mapTcgdexMetadata(
  card: TcgdexCard | null,
): MetadataResult | null {
  if (!card) return null;

  const disk = buildPokemonDiskArtAttachments({
    printKey: card.printKey,
    language: card.language,
    source: PROVIDER_ID,
    title: card.name,
  });

  const metadata: MetadataResult = {
    title: card.name,
    imageUrl: disk.defaultUrl ?? card.imageUrl ?? undefined,
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
      // Price rows are not under a set heading — keep expansion + number.
      label: [card.setName ?? card.setId, tcgdexCollectorNumberLabel(card)]
        .filter(Boolean)
        .join(" · "),
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
 * Set / série arrivent avec la moisson brief. Rareté / stage : passe détail
 * budgétée (`enrichTcgdexCardDetails`) — absents du brief set, présents après
 * enrich (sinon null honnête).
 */
/** @internal also used by `pokemontcglive` print search (same identity corpus). */
export function cardFromLocalRow(row: TcgdexSearchRow): TcgdexCard {
  const language = (isTcgdexLanguage(row.lang)
    ? row.lang
    : "fr") as TcgdexCard["language"];
  const imageBaseUrl = tcgdexLocalizedImageBase(row.imageBaseUrl, language);
  /*
    Indexed local face (`print_assets.art`) wins over CDN. Basename →
    `/assets/pokemon/cards/{lang}/{set}/{num}/{art}`; without it, TCGdex
    high/low URLs from `image_base_url` (unchanged harvest contract).
  */
  const artBasename = row.art?.trim() || null;
  const diskId =
    artBasename != null
      ? tcgdexAssetDiskId(row.printKey, language)
      : null;
  const localArtUrl =
    artBasename && diskId
      ? assetsCardUrl("pokemon", diskId, artBasename)
      : null;
  return {
    providerId: row.providerId,
    printKey: row.printKey,
    setId: row.setId,
    setName: row.setName,
    serieName: row.serieName,
    serieId: null,
    setOfficialCount:
      row.setOfficialCount != null && Number.isFinite(Number(row.setOfficialCount))
        ? Number(row.setOfficialCount)
        : null,
    setTotalCount: null,
    localId: row.localId,
    language,
    name: tcgdexCardDisplayName(row.name, row.localId),
    rarity: row.rarity?.trim() || null,
    stage: row.stage?.trim() || null,
    category: null,
    types: [],
    hp: null,
    evolveFrom: null,
    regulationMark: null,
    illustrator: null,
    finishes: [],
    imageBaseUrl,
    imageUrl: localArtUrl ?? tcgdexImageUrl(imageBaseUrl, "high"),
    thumbnailUrl: localArtUrl ?? tcgdexImageUrl(imageBaseUrl, "low"),
    cmPriceCents: null,
    cmFoilPriceCents: null,
    cardmarketProductId: null,
  };
}

export const tcgdexModule = defineProvider({
  info: {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    types: ["tcg"],
    capabilities: ["identify", "cover", "description", "people", "price"],
    auth: { kind: "none" },
    supplyMode: "api_live",
    catalogLifecycle: "living",
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
      "Harvest + enrich + prix Pokémon (API TCGdex, Cardmarket EUR). Pas de surface picker / check-list — owner = `pokemontcglive` (index local + repli distant). Foil Unity = pack Live, pas de masques first-party TCGdex.",
    referencePriceSource: true,
  },
  catalog: tcgdexCatalog,
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
  // Cover / price attribution — not picker ownership (owner = pokemontcglive).
  printGames: ["pokemon"],
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
