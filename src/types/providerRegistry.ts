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
  isSecondary?: boolean;
}
