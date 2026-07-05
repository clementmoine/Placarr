export interface ICollectMetadata {
  itemId: string;
  itemUrl: string;
  title: string;
  barcode?: string | null;
  platform?: string | null;
  publisher?: string | null;
  developer?: string | null;
  description?: string | null;
  releaseDate?: string | null;
  coverUrl?: string | null;
  images: Array<{ url: string; label?: string }>;
  players?: string | null;
  ageRating?: string | null;
  estimatedValueCents?: number | null;
  estimatedValueDate?: string | null;
  series?: string | null;
  ignScore?: string | null;
  genres?: string[];
  countryOfPurchase?: string | null;
  /** HTML-only collector fields (parsed when JSON-LD is incomplete). */
  gameMode?: string | null;
  mediaType?: string | null;
  packaging?: string | null;
  discCount?: string | null;
  graphics?: string | null;
  inputDevices?: string[];
  in3d?: string | null;
  vr?: string | null;
  specialEdition?: string | null;
  seriesOrder?: string | null;
  dateAdded?: string | null;
  /** Indexed catalog rows (`sitemap` / `page`) skip the on-demand TTL. */
  catalogSource?: "sitemap" | "page";
}
