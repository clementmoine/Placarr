/**
 * Registre central des providers — source unique de vérité.
 *
 * Décrit, pour chaque provider : son rôle (quels champs il apporte), les types
 * d'objets couverts, et s'il nécessite une clé (et laquelle). Sert à :
 *   - la matrice "rôles" de l'admin (qui fait quoi : code-barre/prix/note/public…)
 *   - l'état de configuration (clé présente ?) et le statut (ping)
 *   - le teardown / playground (libellés, regroupement)
 *
 * `id` correspond au `source` utilisé dans les attachments et FieldEvidence.
 */

export type MediaType = "games" | "movies" | "musics" | "books" | "boardgames";

/** Les "colonnes" de la matrice : ce qu'un provider peut apporter. */
export type Capability =
  | "identify" // code-barre/nom → produit (résolution)
  | "price"
  | "rating" // note critique/utilisateurs
  | "ageRating" // PEGI / ESRB / certification (public conseillé)
  | "cover"
  | "description"
  | "screenshots"
  | "releaseDate"
  | "duration"
  | "people"; // auteurs / éditeurs / studios

export type ProviderAuth =
  | { kind: "none" } // gratuit, aucun secret
  | { kind: "scrape" } // pas d'API, scraping (gratuit mais fragile)
  | { kind: "key"; env: string[]; free: boolean }; // clé/secret requis

export interface ProviderInfo {
  id: string;
  label: string;
  types: MediaType[];
  capabilities: Capability[];
  auth: ProviderAuth;
  /** Source canonique fiable pour le nom (vs simple annonce marchande). */
  canonical: boolean;
  notes?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  // ── Jeux vidéo ────────────────────────────────────────────────────────────
  {
    id: "screenscraper",
    label: "ScreenScraper",
    types: ["games"],
    capabilities: [
      "identify",
      "cover",
      "description",
      "rating",
      "ageRating",
      "screenshots",
      "releaseDate",
      "people",
    ],
    auth: { kind: "key", env: ["SCREENSCRAPER_USER", "SCREENSCRAPER_PASSWORD"], free: true },
    canonical: true,
    notes: "Meilleur pour les jaquettes physiques scannées (box-2D/3D).",
  },
  {
    id: "igdb",
    label: "IGDB",
    types: ["games"],
    capabilities: [
      "identify",
      "description",
      "rating",
      "ageRating",
      "cover",
      "screenshots",
      "releaseDate",
      "people",
    ],
    auth: { kind: "key", env: ["IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET"], free: true },
    canonical: true,
  },
  {
    id: "rawg",
    label: "RAWG",
    types: ["games"],
    capabilities: ["identify", "rating", "description", "cover", "screenshots", "releaseDate"],
    auth: { kind: "key", env: ["RAWG_API_KEY"], free: true },
    canonical: true,
  },
  {
    id: "steamgriddb",
    label: "SteamGridDB",
    types: ["games"],
    capabilities: ["cover"],
    auth: { kind: "key", env: ["STEAMGRIDDB_API_KEY"], free: true },
    canonical: true,
    notes: "Artworks communautaires ; grille verticale = format boîte.",
  },
  {
    id: "steam",
    label: "Steam",
    types: ["games"],
    capabilities: [
      "identify",
      "rating",
      "ageRating",
      "description",
      "cover",
      "screenshots",
      "releaseDate",
    ],
    auth: { kind: "none" },
    canonical: true,
    notes: "Jeux PC uniquement (store API).",
  },
  {
    id: "howlongtobeat",
    label: "HowLongToBeat",
    types: ["games"],
    capabilities: ["cover", "duration"],
    auth: { kind: "scrape" },
    canonical: true,
    notes: "Durées de jeu (time-to-beat) + jaquette quand disponible.",
  },
  {
    id: "pricecharting",
    label: "PriceCharting",
    types: ["games"],
    capabilities: ["identify", "price"],
    auth: { kind: "none" },
    canonical: false,
    notes: "Prix de référence.",
  },
  {
    id: "coverproject",
    label: "Cover Project",
    types: ["games"],
    capabilities: ["cover"],
    auth: { kind: "scrape" },
    canonical: true,
  },
  // ── Musique ───────────────────────────────────────────────────────────────
  {
    id: "musicbrainz",
    label: "MusicBrainz",
    types: ["musics"],
    capabilities: ["identify", "releaseDate", "people"],
    auth: { kind: "none" },
    canonical: true,
    notes: "Lookup par code-barre, sans clé.",
  },
  {
    id: "discogs",
    label: "Discogs",
    types: ["musics"],
    capabilities: ["identify", "releaseDate"],
    auth: { kind: "key", env: ["DISCOGS_CONSUMER_KEY", "DISCOGS_CONSUMER_SECRET"], free: true },
    canonical: true,
    notes: "Noms latins (ex. Yoko Shimomura).",
  },
  {
    id: "deezer",
    label: "Deezer",
    types: ["musics"],
    capabilities: ["identify", "cover", "releaseDate"],
    auth: { kind: "none" },
    canonical: true,
  },
  // ── Films / séries ────────────────────────────────────────────────────────
  {
    id: "tmdb",
    label: "TMDB",
    types: ["movies"],
    capabilities: [
      "identify",
      "rating",
      "ageRating",
      "cover",
      "description",
      "releaseDate",
      "people",
    ],
    auth: { kind: "key", env: ["TMDB_API_KEY"], free: true },
    canonical: true,
    notes: "Films + séries (certifications = public conseillé).",
  },
  {
    id: "omdb",
    label: "OMDb",
    types: ["movies"],
    capabilities: ["identify", "rating", "ageRating", "releaseDate", "people"],
    auth: { kind: "key", env: ["OMDB_API_KEY"], free: true },
    canonical: true,
    notes: "Ratings complémentaires (IMDb/Rotten) + classification.",
  },
  // ── Livres ────────────────────────────────────────────────────────────────
  {
    id: "openlibrary",
    label: "OpenLibrary",
    types: ["books"],
    capabilities: ["identify", "cover", "description", "releaseDate", "people"],
    auth: { kind: "none" },
    canonical: true,
  },
  // ── Jeux de société ───────────────────────────────────────────────────────
  {
    id: "boardgamegeek",
    label: "BoardGameGeek",
    types: ["boardgames"],
    capabilities: ["identify", "rating", "description", "cover", "releaseDate", "people"],
    auth: { kind: "key", env: ["BGG_API_TOKEN"], free: true },
    canonical: true,
    notes: "XML API v2 avec token Bearer requis.",
  },
  // ── Multi-types : prix / annonces marchandes ──────────────────────────────
  {
    id: "chasseauxlivres",
    label: "Chasse aux Livres",
    types: ["books", "musics", "movies"],
    capabilities: ["identify", "price"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  {
    id: "achatmoinscher",
    label: "AchatMoinsCher",
    types: ["games", "movies", "musics", "books"],
    capabilities: ["identify", "price"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  {
    id: "ledenicheur",
    label: "LeDénicheur",
    types: ["games", "movies", "musics", "books"],
    capabilities: ["price"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  {
    id: "apriloshop",
    label: "Apriloshop",
    types: ["games"],
    capabilities: ["identify", "price"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  {
    id: "freakxy",
    label: "Freakxy",
    types: ["games"],
    capabilities: ["identify", "price"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  {
    id: "picclick",
    label: "PicClick (eBay)",
    types: ["games", "movies", "musics"],
    capabilities: ["identify", "price"],
    auth: { kind: "scrape" },
    canonical: false,
  },
  {
    id: "scandex",
    label: "ScanDex",
    types: ["games", "movies", "musics", "books", "boardgames"],
    capabilities: ["identify"],
    auth: { kind: "key", env: ["SCANDEX_ACCESS_TOKEN"], free: true },
    canonical: false,
  },
];

/** Provider configuré ? (toutes ses variables d'env présentes) */
export function isProviderConfigured(p: ProviderInfo): boolean {
  if (p.auth.kind !== "key") return true;
  return p.auth.env.every((name) => Boolean(process.env[name]?.trim()));
}

/** Providers couvrant un type d'objet donné. */
export function providersForType(type: MediaType): ProviderInfo[] {
  return PROVIDERS.filter((p) => p.types.includes(type));
}

/**
 * Couverture par (type × capacité) : combien de providers apportent une donnée.
 * Permet de repérer les trous (0) et les single-source dangereux (1).
 */
export function capabilityCoverage(
  type: MediaType,
  capability: Capability,
): { providers: string[]; count: number } {
  const providers = providersForType(type)
    .filter((p) => p.capabilities.includes(capability))
    .map((p) => p.id);
  return { providers, count: providers.length };
}
