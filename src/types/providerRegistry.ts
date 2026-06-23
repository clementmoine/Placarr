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
}
