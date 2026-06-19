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
  auth: ProviderAuth;
  canonical: boolean;
  notes?: string;
}
