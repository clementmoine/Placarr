export type MediaType = "games" | "movies" | "musics" | "books" | "boardgames";

export type Capability =
  | "identify"
  | "price"
  | "rating"
  | "ageRating"
  | "cover"
  | "description"
  | "screenshots"
  | "releaseDate"
  | "duration"
  | "people"
  | "players"
  | "pageCount"
  | "tracksCount";

export type ProviderAuth =
  | { kind: "none" }
  | { kind: "scrape" }
  | { kind: "key"; env: string[]; free: boolean };

export interface ProviderInfo {
  id: string;
  label: string;
  /**
   * Compact label for source chips (e.g. fact provenance), when the full `label`
   * is too long for the UI (a long name shortened to an initialism). Defaults to
   * `label`. Lets a provider own its short name instead of a switch in core.
   */
  factLabel?: string;
  /**
   * This provider supplies authoritative *reference/catalog* prices (a price
   * database) rather than live marketplace listings — so its presence alone makes
   * cached pricing trustworthy. Lets the price-cache policy stay provider-blind.
   */
  referencePriceSource?: boolean;
  /**
   * Provider supplies authoritative time-to-beat / playtime facts for games.
   */
  timeToBeatSource?: boolean;
  /**
   * Prefix stamped on fact `source` chips for this provider's playtime rows
   * (may differ from `label` spacing/casing).
   */
  timeToBeatFactSourcePrefix?: string;
  /**
   * When stage-1 book metadata discovers an ISBN without a scanned barcode,
   * re-query this provider with the discovered ISBN for richer edition data.
   */
  bookIsbnBootstrapSource?: boolean;
  /**
   * Deterministic cover URL from a cleaned ISBN barcode; `{isbn}` is substituted.
   */
  isbnCoverUrlTemplate?: string;
  types: MediaType[];
  capabilities: Capability[];
  /**
   * Capabilities actually emitted by the provider's metadata adapter, when it
   * differs from `capabilities`. Some providers advertise a capability (e.g.
   * `price`) that is served by a separate flow (barcode/price tasks) while their
   * metadata adapter only returns a subset (e.g. cover). The metadata
   * price/duration "chase" gating reads this instead of `capabilities` so it
   * does not pull in a scrape that cannot contribute through the metadata flow.
   * Defaults to `capabilities` when unset.
   */
  metadataCapabilities?: Capability[];
  auth: ProviderAuth;
  canonical: boolean;
  notes?: string;
  weight?: number;
  defaultLanguage?: "fr" | "en" | "unknown";
  isRealBoxCover?: boolean;
  /**
   * Numeric display-score adjustment applied to this provider's image
   * attachments after the server stamps provider traits onto them. Use negative
   * values for noisy marketplace/listing images that should remain available
   * but lose against catalog covers.
   */
  imageScoreAdjustment?: number;
  /**
   * Substring identifying this provider's cover/image URLs (e.g. its CDN host).
   * Lets cover-quality ranking map a stored image URL back to the provider (and
   * its `isRealBoxCover`) without naming providers in core.
   */
  coverUrlHost?: string;
  /**
   * Optional legacy flag: providers that used to keep remote URLs when localization
   * failed. New enrichments localize into /uploads/ and drop failed downloads.
   */
  remoteImageFallback?: boolean;
  /**
   * Referer sent when fetching this provider's cover CDN server-side during
   * image localization at enrichment time.
   */
  remoteImageReferer?: string;
  /**
   * When set, FlareSolverr is only attempted once with this timeout (ms) for
   * this provider's cover CDN — no long retry. Omit for the default 60s pass.
   */
  remoteImageFlareTimeoutMs?: number;
  /**
   * For books: primary FR/community covers win over secondary catalog zebras
   * (Open Library, Google Books) during metadata merge.
   */
  bookCoverPriority?: "primary" | "secondary";
  /**
   * Alternate `source` tokens an attachment may carry for this provider, besides
   * its `id` (e.g. a short marketplace handle). Used to canonicalise a stored
   * attachment source back to the provider id when reading provider-declared
   * cover traits, so historical/aliased sources resolve identically.
   */
  sourceAliases?: string[];
  /**
   * The provider's covers are full front+back wraps (a single image spanning the
   * whole sleeve), which look wrong shown as a portrait cover, so they are
   * penalised and ranked below standard 2D/3D fronts in the display scorer.
   */
  fullWrapCover?: boolean;
  isSecondary?: boolean;
  /**
   * Provider art is digital-storefront (e.g. PC capsule/header), not the physical
   * product being scanned, so it is excluded from a physical-game cover set
   * unless PC sources are explicitly requested.
   */
  digitalStorefrontArt?: boolean;
  /**
   * The provider's `imageUrl` is the definitive cover for its media type and is
   * trusted as-is (no re-ranking) when it is the highest-weight result.
   */
  canonicalCover?: boolean;
  /**
   * The authoritative name→canonical-title database for this media type, queried
   * by `confrontWithDatabase` to clean up noisy marketplace names (e.g. IGDB for
   * games, TMDB for movies). Resolved by name, not barcode.
   */
  nameDatabase?: boolean;
  /**
   * Provider enforces a tight rate limit, so concurrent fallback-name
   * resolutions are throttled harder (e.g. ScreenScraper).
   */
  rateLimited?: boolean;
  /**
   * Provider fuzzy-matches by name and can return a different product, so its
   * result is validated against the requested title before being merged (the
   * name-searched game databases: IGDB, TheGamesDB, LaunchBox, RAWG).
   */
  requiresTitleAlignment?: boolean;
  /**
   * After the initial metadata pass, re-query with canonical fallback names when
   * the first hit is a weak or over-qualified title match (ScreenScraper).
   */
  metadataMatchRecheck?: boolean;
  /**
   * Game catalog whose clean title can backfill a weak merged title and preserve
   * the user's display wording as aliases when both refer to the same product
   * (PriceCharting).
   */
  catalogDisplayTitleFallback?: boolean;
  /**
   * Provider supplies the canonical screenshot / physical-box gallery expected
   * for a fully-enriched game item (ScreenScraper).
   */
  gameMediaGallerySource?: boolean;
  /**
   * Provider supplies the canonical music release gallery (Discogs covers/images).
   */
  musicGallerySource?: boolean;
  /** Retry metadata adapter probes on transient scrape/API failures. */
  mappingProbeRetry?: boolean;
  /**
   * Retail marketplace images embed catalog product titles in alt text; filter
   * gallery entries whose title names another product than the shelf item.
   */
  retailCatalogImageTitles?: boolean;
  /**
   * Cover platform must match the shelf — detected from URL/title, not just role.
   */
  strictShelfPlatformCover?: boolean;
  /** Provider-declared 3D box roles are authoritative (never demoted). */
  authoritative3dCoverRole?: boolean;
  /** Grid-style cover labels include a style token in attachment title. */
  gridStyleCoverLabels?: boolean;
  /** Collector age-rating facts map to cover region (e.g. PEGI → EU). */
  collectorCoverRegionFromAgeRating?: boolean;
  /** Default cover region when inferring 3D roles from filename hints. */
  coverDefaultRegion?: "fr" | "en" | "eu" | "us" | "jp" | "wor";
  /**
   * Friendlier mapping-audit message when a keyed provider is unconfigured
   * (falls back to a generic Missing env line).
   */
  mappingProbeConfigHint?: string;
  /** Public website linked from the admin provider matrix. */
  websiteUrl?: string;
  /** API key / developer console URL linked from admin health cards. */
  apiKeyDashboardUrl?: string;
}
