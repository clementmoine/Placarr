import type { AttachmentType } from "@/generated/prisma/browser";

import type { SourceProduct } from "@/core/identify/evidence/types";
import type { MetadataResult } from "@/types/metadataProvider";
import type { ProviderInfo } from "@/types/providerRegistry";
import type { BarcodeLookupPayload } from "@/core/identify/lookup/payload";
import type { PriceOfferInput } from "@/core/enrich/evidence";

export type InferredImageAttachmentSemantics = {
  type: AttachmentType;
  role?: string;
  source: string;
};

/**
 * Shared match inputs: every provider may contribute (aliases, EAN/UPC,
 * releaseDate, external ids…) and every provider should consume the same bag
 * for hard match / search decisions. Built once per enrich or price pass.
 */
export type MatchContext = {
  /** Digits-only barcodes known for this item (EAN / UPC / ISBN…). Preferred first. */
  barcodes: string[];
  /**
   * Print identity for objects that never carry a barcode — a trading card is
   * anchored by what is printed on it (game, set, collector number). Sits
   * alongside `barcodes` rather than inside it: a print key is not a barcode,
   * and a column that lies costs more than the extra field.
   * See `@/core/identify/printKey`.
   */
  printKey?: string | null;
  /** Primary display title. */
  primaryTitle: string;
  /**
   * Soft match / search titles (aliases, regional, query expansions).
   * Deduped; primaryTitle is first when present.
   */
  titles: string[];
  /**
   * Titles trusted for hard acceptance / marketplace validation
   * (primary + strong fallbacks — excludes weak alias noise).
   */
  acceptanceTitles: string[];
  shelfType: string;
  shelfName?: string | null;
  platformKey?: string | null;
  /** ISO date `YYYY-MM-DD` when known from metadata consensus. */
  releaseDate?: string | null;
  isPal?: boolean;
  isClassics?: boolean;
  providerProductUrls?: readonly ProviderProductUrlRef[];
  externalIds?: Record<string, string | null | undefined>;
};

export type RomChecksums = {
  crc?: string | null;
  md5?: string | null;
  sha1?: string | null;
};

export type MetadataAdapterContext = {
  name: string;
  type?: string | null;
  barcode?: string | null;
  /** Print identity for barcode-less objects. See {@link MatchContext.printKey}. */
  printKey?: string | null;
  platform?: string | null;
  shelfName?: string | null;
  lookupQueries?: string[];
  includePcSources?: boolean;
  imdbId?: string | null;
  externalIds?: Record<string, string | null>;
  /**
   * Absolute fiche/product URLs already known for this item (from stored
   * external-link facts). Prefer over title/barcode seek when present.
   */
  providerRecordUrls?: Record<string, string>;
  fallbackNames?: string[];
  /** ISO release date from prior consensus — soft discriminant for remakes. */
  releaseDate?: string | null;
  /**
   * ROM dump checksums when known (file ingest / prior No-Intro hit).
   * Tier0 dump providers prefer sha1 > md5 > crc over title search.
   */
  romChecksums?: RomChecksums;
  /**
   * Shared match bag for this enrich pass. Prefer reading titles / barcodes /
   * releaseDate from here when present; scalar fields above stay for compat.
   */
  match?: MatchContext;
  isBackground?: boolean;
  /** Interactive lookups (preview API) jump ahead of background enrichment. */
  queuePriority?: "high" | "normal";
  signal?: AbortSignal;
};

export interface MetadataProviderAdapter {
  id: string;
  resolve(ctx: MetadataAdapterContext): Promise<MetadataResult | null>;
}

export type BarcodeLookupType =
  | "games"
  | "books"
  | "musics"
  | "movies"
  | "boardgames"
  | "hardware"
  | "tcg"
  | "toys"
  | "generic";

export type BarcodeLookupContext = {
  barcode: string;
  platformKey?: string | null;
};

export type ProviderProductUrlRef = {
  providerKey: string;
  url: string;
};

/**
 * Price-refresh view of {@link MatchContext} with legacy field aliases used by
 * existing `refreshBarcodePriceOffers` implementations. Prefer `titles` /
 * `barcodes` / `releaseDate` / `acceptanceTitles` for new code.
 */
export type BarcodePriceRefreshContext = MatchContext & {
  /** Preferred barcode (`barcodes[0]`), or `""` for title-only refresh. */
  cleanedBarcode: string;
  /** Alias of `primaryTitle`. */
  primaryName: string;
  /** Search titles excluding primary (`titles` without `primaryTitle`). */
  fallbackNames: string[];
  /** LeDénicheur-style query list (barcode + title variants). */
  leDenicheurQueries: string[];
  isPal: boolean;
  isClassics: boolean;
  /** Job abort — stop launching further provider scrapes when set. */
  signal?: AbortSignal;
  /**
   * Rejoue uniquement ProviderEvidence frais (SearchYield / DetailYield) —
   * aucun HTTP. Miss evidence ⇒ offre vide pour ce provider.
   */
  evidenceOnly?: boolean;
};

export type CatalogExternalLinkContext = {
  mediaType: string;
  title?: string | null;
  fallbackTitle?: string | null;
  shelfName?: string | null;
  barcode?: string | null;
  aliases?: string[];
};

export type CatalogExternalLink = {
  url: string;
  isDirect?: boolean;
  /** Registry evidence/display label for the provider that built the link. */
  providerLabel?: string;
};

export type DatabaseTitleSuggestionContext = {
  name: string;
  cleanedName: string;
  platform?: string | null;
};

export type PrintLookupContext = {
  printKey: string;
  /** Disambiguates the rare printed identifier covering two cards. */
  name?: string | null;
  language?: string | null;
  signal?: AbortSignal;
};

export type PrintSearchContext = {
  /** Raw user query. Providers normalize it themselves. */
  query: string;
  /** Preferred language for names and artwork, when the provider has several. */
  language?: string | null;
  limit?: number;
  signal?: AbortSignal;
  /**
   * Restreint à une extension, telle que `listPrintSets` l'a annoncée.
   *
   * Avec elle, une requête **vide** est légitime : c'est ainsi qu'on parcourt
   * un set sans savoir quoi y chercher. Un provider qui ne la gère pas rend une
   * liste vide plutôt que d'ignorer la restriction et de répondre à côté.
   */
  setId?: string | null;
};

/** Une extension telle qu'un joueur la nomme, pour la choisir avant de chercher. */
export type PrintSetOption = {
  id: string;
  label: string;
  /**
   * La **découpe** dont cette extension fait partie, quand un jeu en a
   * plusieurs.
   *
   * Un même jeu peut avoir été découpé différemment selon le marché, et ces
   * découpes ne se recouvrent pas : le Naruto Carddass compte dix-sept 巻ノ au
   * Japon et vingt-huit séries en Europe, le 巻ノ十 recoupant les séries 4 et 5.
   * Les fondre en une seule liste dirait qu'elles sont interchangeables ; n'en
   * montrer qu'une à la fois cacherait l'autre. Nommer la découpe permet de les
   * présenter côte à côte sans les confondre.
   *
   * Absent = le jeu n'a qu'une découpe, et il n'y a rien à distinguer.
   */
  group?: string;
  /**
   * Le rang de cette extension dans sa ligne, quand le libellé ne le porte pas.
   *
   * « Quest for Power » est la septième série, et son nom ne l'annonce pas :
   * trié alphabétiquement il tombe sous Q. Ce rang est ce qui permet de ranger
   * les extensions dans l'ordre où elles sont sorties, y compris quand elles
   * sont nommées et non numérotées.
   */
  sortKey?: number;
  /**
   * Les langues dans lesquelles cette extension a **paru**.
   *
   * Ce n'est pas la langue des cartes qui la composent : le 巻ノ一 contient des
   * numéros dont il existe une version française, mais aucun 巻ノ n'est jamais
   * sorti en France — c'était une sortie japonaise. Choisir « français » doit
   * donc faire disparaître les 巻ノ de la liste, pas les garder au prétexte que
   * leurs cartes ont un nom français.
   *
   * Absent = on ne sait pas, et un filtre de langue ne masque rien.
   */
  languages?: string[];
};

/**
 * One pickable printing. Everything here exists to let a human tell two prints
 * of the same card apart, so the fields are the ones printed on the card or
 * visible at a glance.
 */
export type PrintCandidate = {
  /** Provider-neutral anchor. See `@/core/identify/printKey`. */
  printKey: string;
  /** `Elsa - Esprit de l'hiver`. */
  title: string;
  /** Where it comes from, as a collector reads it: `Premier Chapitre · 207`. */
  reference: string;
  /**
   * L'extension seule, telle qu'un joueur la nomme — `Série 1 — Maître Hokage /
   * Pays du Vent`, `Le Retour d'Ursula`.
   *
   * Distincte de `reference`, qui mêle l'extension et le numéro, et de
   * `setCode`, qui est un identifiant. Sert à regrouper des tirages par
   * extension sans découper une chaîne d'affichage : tous les catalogues ne
   * mettent pas l'extension dans `reference`, et celui qui l'omet donnerait un
   * faux groupe par carte.
   */
  setLabel?: string | null;
  rarity?: string | null;
  /**
   * Quarters of a turn for faces that share the shelf card format but sit on
   * their side (e.g. Pokémon BREAK = TCG 5:7 rotated → 7:5). Omit / 0 = upright.
   */
  faceQuarterTurns?: 0 | 1 | 2 | 3;
  /**
   * Native landscape scan in a portrait card slot — swap the display frame, do
   * not rotate the artwork (Ninja Ranks NS, ROOKIES).
   */
  landscapeFace?: boolean;
  /** Any locale art for this print is wider than tall. */
  landscapePrint?: boolean;
  /**
   * Card family as the catalogue spells it (`Pokémon`, `Dresseur`, `Énergie`).
   * A look is chosen per family as much as per rarity — a Dresseur wearing a
   * Pokémon frame gets an energy badge and an HP bar it has no use for.
   */
  category?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  language?: string | null;
  /**
   * Set / expansion code when the catalogue has one. Used to rank set-scoped
   * card backs (`resolveCardBack`) without re-querying the provider.
   */
  setCode?: string | null;
  /**
   * Card-specific back / alt face URL (e.g. DBS leader morph). Becomes the
   * default over set and pack backs when present. See `resolveCardBackUrl`.
   */
  cardBackUrl?: string | null;
  /**
   * Finishes this print exists in. The copy's own finish is chosen by the user
   * at add time — it belongs to the item, never to the print.
   */
  finishes?: string[];
  /**
   * The subset of `finishes` that carries no visual effect — a plain print.
   * Core cannot infer this: only the provider knows that Lorcana's `None` means
   * "no foil" while every other value means there is something to render.
   */
  plainFinishes?: string[];
  /**
   * Which look each finish is drawn with, keyed by finish, valued by an id from
   * the shader library in `core/render/holoShaders`.
   *
   * The publisher names its finishes and core cannot read those names: only the
   * provider knows that Lorcana's `Silver` is the everyday foil while `Lava`
   * belongs to Enchanted cards and looks nothing like it. A finish left out, or
   * pointed at an id this build does not define, falls back to the everyday
   * foil — never to no effect at all.
   */
  finishShaders?: Record<string, string>;
  /** Effect pack id from `src/effects/<id>` — never a Unity material name. */
  effectPack?: string | null;
  /**
   * Which look the varnish is drawn with, keyed by the publisher's own name for
   * it. A second, independent axis: a card can be Enchanted *and* hot-foiled,
   * and the two are stamped separately.
   */
  varnishShaders?: Record<string, string>;
  /** The varnish this print carries, if any. Keys `varnishShaders`. */
  varnishType?: string | null;
  /**
   * The hue the stamped coat throws, when the provider can say.
   *
   * Nothing derives it — not the ink, the rarity, the set or the varnish — so a
   * provider that cannot supply it leaves it null and the coat renders without
   * one, rather than with a guess.
   */
  varnishColor?: string | null;
  /**
   * A second stamped coat, for the prints that carry two — its own mask and
   * its own hue, both independent of the first.
   */
  secondVarnishMaskUrl?: string | null;
  secondVarnishColor?: string | null;
  /**
   * Artwork per finish, when the provider publishes a distinct file rather than
   * expecting the effect to be composited. Preferred over the mask when present.
   */
  variantImageUrls?: Record<string, string>;
  /**
   * Foil mask URL per catalogue finish (e.g. Live `std` vs `ph`). When set,
   * preferred over the single {@link foilMaskUrl} for that finish.
   */
  finishFoilMaskUrls?: Record<string, string>;
  /** Where the holographic effect applies. See `HoloCardImage`. */
  foilMaskUrl?: string | null;
  /** Second, independent effect layer (varnish). */
  varnishMaskUrl?: string | null;
  /** Exact provider handles, so re-resolution never re-runs the search. */
  externalIds?: Record<string, string>;
  /**
   * False when this language was never printed. Omitted / true = addable.
   * Search hides `printed: false`; the catalogue may still show the slot.
   */
  printed?: boolean;
  /** Stamped by core from the module's own id; modules must not set it. */
  providerId?: string;
};

export type GameBarcodeEnrichmentDeps = {
  fetchReferencePriceByBarcode?: (
    barcode: string,
    searchName: string,
    platform: string,
    isPal: boolean,
    isClassics: boolean,
  ) => Promise<unknown>;
  fetchGameMediaByBarcode?: (
    name: string,
    barcode: string,
    platform: string,
  ) => Promise<unknown>;
  fetchMovieByTitle?: (title: string) => Promise<unknown>;
};

/** One volume in a publisher series with a discovered barcode (e.g. AbeBooks). */
export type SeriesVolumeBarcode = {
  volume: string;
  barcode: string;
  title: string;
  coverUrl?: string;
};

/** Finish + varnish pair a dumped foil material asks the playroom to illustrate. */
export type FoilPlayroomNeed = {
  finish: string | null;
  varnish: string | null;
};

/**
 * One catalog print that can stand in for a playroom tile when the collection
 * has no adapted copy. `variant` is the finish the material expects.
 *
 * Mask URLs are optional but should be filled when the catalogue already knows
 * them — the playroom must not wait on a second print-variant round-trip
 * before Unity can start (Lorcana HotFoil / foilMask gate).
 */
export type FoilPlayroomCatalogSample = {
  id: string;
  name: string;
  variant: string | null;
  printKey: string;
  shelfType: string;
  imageUrl: string | null;
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
  varnishType?: string | null;
  varnishColor?: string | null;
  secondVarnishColor?: string | null;
  effectPack?: string | null;
};

export type SeriesVolumeBarcodeContext = {
  seedBarcode: string;
};

/** Context for turning a barcode lookup payload into per-type evidence sources. */
export type BarcodeSourceContext = {
  type: string | null;
  isBook: boolean;
  cleanedBarcode: string;
};

/**
 * One provider's contribution of evidence products to a media type, extracted
 * from its own slice of the lookup payload. `label` is the exact evidence
 * `providerName` (preserved verbatim from the former central assembler, since
 * downstream evidence classification matches on it).
 */
export type BarcodeSourceContribution = {
  mediaType: BarcodeLookupType;
  label: string;
  products: SourceProduct[];
};

export type BarcodeLookupDeps = {
  fetchMetadataFromPriceCharting: (
    barcode: string,
    searchName?: string,
    preferredPlatform?: string,
    isPal?: boolean,
    isClassics?: boolean,
    options?: { mediaType?: string | null },
  ) => Promise<unknown>;
  fetchFromChasseAuxLivres: (
    barcode: string,
    category: string,
    opts?: { withPrices?: boolean },
  ) => Promise<unknown>;
  fetchFromScanDex: (barcode: string) => Promise<unknown>;
  fetchFromAchatMoinsCher: (barcode: string) => Promise<unknown>;
  fetchFromFreakxy: (barcode: string) => Promise<unknown>;
  fetchFromEbay: (barcode: string) => Promise<unknown>;
  fetchPricesFromLeDenicheur: (
    queryOrQueries: string | string[],
    options?: { itemBarcode?: string | null },
  ) => Promise<unknown>;
  fetchFromOpenLibrary: (
    name: string,
    barcode?: string | null,
  ) => Promise<unknown>;
  fetchFromGoogleBooks: (
    name: string,
    barcode?: string | null,
  ) => Promise<unknown>;
  fetchFromDeezer: (name: string, barcode?: string | null) => Promise<unknown>;
  fetchFromMusicBrainz: (barcode: string) => Promise<unknown>;
  fetchFromDiscogs: (barcode: string) => Promise<unknown>;
  fetchICollectMetadataByBarcode: (barcode: string) => Promise<unknown>;
};

export interface ProviderEvidenceConfig {
  label: string;
  sourceWeight: number;
  canonical?: boolean;
  /** Official retailer product pages (barcode-confirmed), below catalog sources. */
  trustedRetailer?: boolean;
  /**
   * Local barcode catalog rows (e.g. offline index) may anchor official display
   * titles without full canonical weight.
   */
  catalogTitleAnchor?: boolean;
  cleanCachedNames?: boolean;
}

export interface ProviderHealthStatus {
  name: string;
  type: "metadata";
  configured: boolean;
  status: "up" | "down" | "unconfigured";
  latency: number | null;
  error: string | null;
  credits: null;
}

export interface ProviderHealthCheck {
  providerId: string;
  run: () => Promise<ProviderHealthStatus>;
}

export type TestProviderHandlerKind =
  "scraped-list" | "prices" | "metadata-barcode" | "metadata" | "cover";

export interface TestProviderFormatContext {
  processScrapedNames: (
    rawNames: string[] | undefined,
    type: string | null,
  ) => Promise<{
    rawNames: string[] | null;
    extractedName: string | null;
    suggestions: string[];
  }>;
}

export interface TestProviderHandler {
  label: string;
  kind: TestProviderHandlerKind;
  run: (query: string, type: string | null) => Promise<unknown>;
  formatResult?: (
    resolved: unknown,
    type: string | null,
    ctx: TestProviderFormatContext,
  ) => Promise<unknown>;
}

/**
 * Probe samples may be barcode-only (Magento retailers seek by EAN), so the
 * name is optional here — the audit fills it in before calling an adapter.
 */
export type ProviderMappingProbeContext = Omit<MetadataAdapterContext, "name"> &
  Partial<Pick<MetadataAdapterContext, "name">>;

export interface ProviderMappingProbeSample {
  sampleInput: string;
  context: ProviderMappingProbeContext;
}

export interface ProviderMappingProbe {
  sampleInput: string;
  context: ProviderMappingProbeContext;
  fallbackBarcodes?: string[];
  catalog?: string;
  /**
   * Extra sample inputs probed alongside the primary one; their raw + mapped
   * keys are unioned so the audit sees fields that only some products expose
   * (e.g. a Discogs release with `videos`/`notes`). Opt-in per provider.
   */
  additionalSamples?: ProviderMappingProbeSample[];
}

export type MappingProbeStatus =
  "ok" | "partial" | "empty" | "blocked" | "error";

export interface MappingProbeResult {
  rawKeys: string[];
  mappedKeys: string[];
  unusedKeys: string[];
  attachmentsCount: number;
  factsCount: number;
  example: string | null;
  reason?: string;
  statusHint?: MappingProbeStatus;
}

export interface ProviderCatalogStatus {
  /** No usable index / cards yet. */
  empty: boolean;
  /** Older than configured max-age, missing, or schema outdated. */
  stale: boolean;
  /** Last successful sync/build, when known. */
  lastSyncAt: string | null;
}

export type ProviderCatalogRefreshOpts = {
  /** Background / Plex-like path — prefer cheap sync when the provider supports it. */
  auto?: boolean;
  signal?: AbortSignal;
};

/**
 * Optional local-corpus surface for providers that own refreshable data under
 * `data/<pack>/`. Core/admin discover these via the registry — never by id.
 * @see docs/provider_supply_modes.md
 */
export interface ProviderCatalogHooks {
  /** Pack slug under `data/<pack>/` (may differ from provider id). */
  dataPack: string;
  status: () => ProviderCatalogStatus | Promise<ProviderCatalogStatus>;
  refresh: (opts?: ProviderCatalogRefreshOpts) => Promise<void>;
}

export interface ProviderModule {
  info: ProviderInfo;
  /**
   * Local / scrape-cache corpus: status + in-process refresh for Catalogue hub
   * and auto-sync. Tambouille stays in the module.
   */
  catalog?: ProviderCatalogHooks;
  evidence?: ProviderEvidenceConfig;
  /**
   * Les extensions de ce catalogue, pour les proposer **avant** toute recherche.
   *
   * Sans ça, un sélecteur ne peut lister que ce que les résultats contiennent —
   * donc rien tant qu'on n'a pas tapé, et jamais un set entier. Le provider les
   * possède ; le cœur se contente de les demander.
   */
  /**
   * Le logo d'une extension, pour un produit scellé de ce pack.
   *
   * Le code partagé de l'ingest **savait** quel pack allait chercher ses logos
   * où : une branche par jeu, comparant l'id du pack, et deux imports de
   * providers depuis `shared/`. Ajouter un catalogue obligeait donc à éditer du
   * code commun pour lui faire une place.
   *
   * Le pack sait, lui, où vivent ses logos. Il répond `null` quand il n'en a
   * pas — ce qui est le cas de la plupart.
   */
  /**
   * Rafraîchit le relevé de logos de set du pack, avant l'ingest scellé.
   *
   * Étape à **effet de bord** : elle télécharge, donc elle appartient au pack
   * qui sait où et à quel rythme. Le code partagé la déclenchait lui-même, une
   * branche par jeu, ce qui l'obligeait à importer deux providers.
   *
   * Rend un message de progression, ou `null` s'il n'y a rien à dire.
   */
  refreshSetLogos?: (opts: {
    force?: boolean;
    /** Ne rien télécharger : lire ce qui est déjà là. */
    offline?: boolean;
  }) => Promise<string | null>;
  /**
   * L'extension du **catalogue** qu'un produit scellé désigne.
   *
   * Les boutiques et les catalogues ne nomment pas les extensions pareil : une
   * boutique peut porter un sigle de trois lettres là où le catalogue de
   * tirages porte un numéro. Sans traduction, un conseil d'achat ne rattache
   * aucun produit à un set — mesuré, zéro option sur cent quarante et un SKU.
   *
   * Le pack sait faire la correspondance : il la fait déjà pour choisir le logo.
   * Il la déclare ici plutôt que de la laisser deviner à qui lit l'URL de
   * l'image, ce qui casserait silencieusement le jour où le chemin change.
   *
   * `null` quand rien ne correspond, ou quand **plusieurs** correspondent :
   * rattacher un booster au mauvais set serait pire que de ne pas le rattacher.
   */
  resolveCatalogueSetId?: (input: {
    setCode?: string | null;
    slug?: string | null;
    name?: string | null;
  }) => string | null;
  resolveSetLogo?: (input: {
    setCode?: string | null;
    /** Slug de la fiche produit, quand le logo s'y raccroche mieux. */
    slug?: string | null;
    name?: string | null;
  }) => string | null;
  /**
   * Les langues dans lesquelles ce catalogue a été imprimé.
   *
   * Annoncées **avant** toute recherche, parce que la langue n'est pas qu'un
   * filtre d'affichage : chez Naruto elle change la **découpe** proposée — les
   * dix-sept 巻ノ japonais au lieu des séries européennes. La déduire des
   * résultats arrivait donc trop tard, une extension japonaise n'étant offerte
   * qu'après avoir déjà cherché en japonais.
   *
   * Codes courts en minuscules. Absent = le pack ne sait pas le dire, et le
   * sélecteur retombe sur ce que les résultats montrent.
   */
  listPrintLanguages?: (type: string) => string[] | Promise<string[]>;
  /**
   * **Tous** les tirages d'une extension, sans plafond.
   *
   * `searchPrints` répond à « montre-moi quelques cartes » et se borne à
   * quelques dizaines : c'est ce qu'il faut pour un sélecteur, jamais pour une
   * check-list. Compter ce qui manque dans un set de 452 cartes sur les 200
   * premières annoncerait une complétion fausse, et fausse **par excès** — le
   * pire des deux sens.
   *
   * La langue borne le résultat : compléter une extension n'a de sens que dans
   * une langue, ses tirages français et anglais n'étant pas la même collection.
   *
   * Absent = ce pack ne sait pas énumérer un set, et la check-list le dit au
   * lieu de compter à moitié.
   */
  /**
   * Les slugs de jeu que ce pack sert, tels qu'ils apparaissent dans le premier
   * segment d'une `printKey`.
   *
   * `Shelf` ne porte qu'un `type`, et `tcg` est partagé par tous les jeux de
   * cartes. Sans cette liste, la check-list d'une étagère additionnait les
   * extensions de tous les autres jeux, et annonçait « 1 % » sur un
   * dénominateur de trente mille cartes qu'elle ne contiendrait jamais.
   *
   * Absent = le pack ne dit pas quel jeu il sert, et on ne le retire d'aucune
   * étagère : mieux vaut trop montrer que de taire un jeu qu'on y range.
   */
  printGames?: readonly string[];
  listSetPrints?: (input: {
    setId: string;
    language?: string | null;
  }) => PrintCandidate[] | Promise<PrintCandidate[]>;
  listPrintSets?: (
    type: string,
    language?: string | null,
  ) => PrintSetOption[] | Promise<PrintSetOption[]>;
  createMetadataAdapter?: (
    deps?: Record<string, unknown>,
  ) => MetadataProviderAdapter | null;
  /**
   * Title suggestions for manual item entry / association modals. Implemented by
   * providers that declare `nameDatabase` for a media type.
   */
  suggestDatabaseTitles?: (
    ctx: DatabaseTitleSuggestionContext,
  ) => Promise<string[]>;
  /**
   * Print candidates for objects that cannot be scanned. A title alone does not
   * identify a card — five Lorcana prints share the name "Chiot dalmatien" —
   * so the user picks a print, not a title. Implemented by providers whose
   * media type has no barcode to start from.
   */
  searchPrints?: (ctx: PrintSearchContext) => Promise<PrintCandidate[]>;
  /**
   * One printing by its key. Lets the app ask what a print *is* — its finishes,
   * above all — without persisting a copy of the answer, which would drift and
   * has to survive the fact pipeline's allow-lists to get stored at all.
   */
  lookupPrint?: (ctx: PrintLookupContext) => Promise<PrintCandidate | null>;
  /**
   * Catalog prints that actually carry each finish/varnish the foil playroom
   * needs — so an empty collection does not leave Magma tiles blank, and we
   * never fake Magma on a Silver mask.
   */
  suggestFoilPlayroomSamples?: (
    needs: readonly FoilPlayroomNeed[],
  ) => Promise<FoilPlayroomCatalogSample[]>;
  mappingProbe?: ProviderMappingProbe;
  runMappingProbe?: () => Promise<MappingProbeResult | null>;
  /**
   * Live raw keys for a sample. Receives the probed context so the audit can
   * union keys across multiple samples; implementations may ignore it and fall
   * back to their default sample (backward compatible).
   */
  collectMappingRawKeys?: (
    context?: ProviderMappingProbeContext,
  ) => Promise<string[]>;
  healthCheck?: ProviderHealthCheck;
  /** When set, metadata fetch skips this provider while its quota cooldown is active. */
  isMetadataQuotaBlocked?: () => boolean;
  /**
   * Parse a durable provider record id from a stored fiche / product URL so
   * metadata refresh can skip title/barcode seek when the fiche is already known.
   */
  parseMetadataRecordIdFromUrl?: (url: string) => string | null;
  /**
   * Turn this provider's slice of a barcode lookup payload into price offers
   * captured during identification (one network call, single-product match).
   */
  extractScanPriceOffers?: (
    payload: BarcodeLookupPayload,
    shelfType: string,
  ) => PriceOfferInput[];
  /**
   * Fetch fresh barcode-scoped price offers for a background refresh. Return an
   * empty array when this provider does not apply to the shelf type/context.
   */
  refreshBarcodePriceOffers?: (
    ctx: BarcodePriceRefreshContext,
  ) => Promise<PriceOfferInput[]>;
  /** Registers barcode lookup fetchers for dependency injection. */
  contributeBarcodeLookupDeps?: () => Partial<BarcodeLookupDeps>;
  /**
   * Build an external catalog link (reference price / market lookup) for items
   * of a supported media type.
   */
  buildCatalogExternalLink?: (
    ctx: CatalogExternalLinkContext,
  ) => CatalogExternalLink | null;
  /**
   * True when `url` is a verified product/fiche URL for this provider
   * (not a search page). Used to prefer scraped links over heuristic search.
   */
  isVerifiedCatalogProductUrl?: (url: string) => boolean;
  /**
   * Rewrite a stored/scraped URL into the canonical public product page when
   * needed (e.g. API endpoints that should never be shown to collectors).
   * Return null when the URL is not owned by this provider.
   */
  normalizeCatalogProductUrl?: (
    url: string,
    ctx?: { platformKey?: string | null },
  ) => string | null;
  /** Registers post-barcode enrichment fetchers (reference price, game media, movies). */
  contributeGameBarcodeEnrichment?: () => Partial<GameBarcodeEnrichmentDeps>;
  /**
   * From a seed ISBN/EAN that hit this provider's series catalog, return other
   * volumes in the same series with their barcodes (for filling barcode-less
   * shelf siblings). Empty when the seed is not in a series.
   */
  contributeSeriesVolumeBarcodes?: (
    ctx: SeriesVolumeBarcodeContext,
  ) => Promise<SeriesVolumeBarcode[]>;
  buildBarcodeTasks?: (
    deps: BarcodeLookupDeps,
    type: BarcodeLookupType,
    context: BarcodeLookupContext,
  ) => Record<string, Promise<unknown>>;
  /**
   * Turn this provider's slice of the lookup payload into evidence sources,
   * tagged by media type. Plug-and-play replacement for the central assembler:
   * core iterates the registry instead of hard-coding each provider.
   */
  /**
   * Empty value for each barcode-lookup slot this provider owns, keyed by slot
   * name. Declare it next to the matching `declare module` augmentation of
   * `BarcodeLookupSlots` so the type and its default stay adjacent.
   */
  barcodeLookupSlots?: Record<string, () => unknown>;
  buildBarcodeSources?: (
    payload: BarcodeLookupPayload,
    ctx: BarcodeSourceContext,
  ) => BarcodeSourceContribution[];
  buildTeardownBarcodeTasks?: (
    ctx: TeardownBarcodeContext,
    deps: BarcodeLookupDeps,
  ) => TeardownProviderTask[];
  buildTeardownMetadataTasks?: (
    ctx: TeardownMetadataContext,
  ) => TeardownProviderTask[];
  testHandlers?: Record<string, TestProviderHandler>;
  /**
   * Expand a canonical cover URL into ordered download candidates (CDN path
   * variants, slug forms, size fallbacks). Used during image localization.
   */
  expandCoverDownloadCandidates?: (url: string) => string[];
  /**
   * Provider-owned cover localization (CDN-specific download / upgrade). When
   * set, core calls this instead of the generic remote download path for URLs
   * matching `info.coverUrlHost`.
   */
  localizeCoverDownload?: (
    url: string,
    options?: {
      source?: string;
      itemId?: string;
      metadataId?: string;
      trim?: boolean;
    },
  ) => Promise<string | null>;
  /**
   * Infer attachment type/role/source from a remote media URL owned by this
   * provider (e.g. ScreenScraper mediaJeu.php query params).
   */
  inferImageAttachmentFromMediaUrl?: (
    url: string,
  ) => InferredImageAttachmentSemantics | null;
  /**
   * When an item barcode is known, validate a stored product-page URL against
   * GTIN/EAN read from the live page. Return true when the page contradicts
   * the item (the external link should be dropped).
   */
  validateStoredExternalLinkAgainstBarcode?: (
    url: string,
    itemBarcode: string,
    itemTitle?: string | null,
  ) => Promise<boolean>;
}

export type TeardownProviderTaskPhase = "barcode" | "metadata" | "merged";

export interface TeardownProviderTask {
  providerLabel: string;
  phase: TeardownProviderTaskPhase;
  run: () => Promise<unknown>;
}

export interface TeardownBarcodeContext {
  barcode: string;
  type: string | null;
  nameCandidates?: string[];
}

export interface TeardownMetadataContext {
  name: string;
  type: string;
  barcode: string | null;
  platform: string | null;
  includeTypeInLabel: boolean;
}
