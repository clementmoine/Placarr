import type { PrestashopRetailerConfig } from "./types";

export const MONSIEURDE_CONFIG: PrestashopRetailerConfig = {
  id: "monsieurde",
  label: "Monsieur de",
  baseUrl: "https://www.monsieurde.com",
  searchPath: "/recherche",
  searchParam: "s",
  types: ["boardgames"],
  sample: { name: "Mille Sabords", barcode: "3421272109517" },
};

export const LUDIFOLIE_CONFIG: PrestashopRetailerConfig = {
  id: "ludifolie",
  label: "Ludifolie",
  baseUrl: "https://www.ludifolie.com",
  searchPath: "/recherche",
  searchParam: "search_query",
  types: ["boardgames"],
  sample: { name: "Mille Sabords", barcode: "3421272109517" },
};

export const BCDJEUX_CONFIG: PrestashopRetailerConfig = {
  id: "bcdjeux",
  label: "BCD Jeux",
  baseUrl: "https://www.bcd-jeux.fr",
  searchPath: "/recherche",
  searchParam: "search_query",
  types: ["boardgames"],
};

export const LEPASSETEMPS_CONFIG: PrestashopRetailerConfig = {
  id: "lepassetemps",
  label: "Le Passe-Temps",
  baseUrl: "https://www.le-passe-temps.com",
  searchPath: "/recherche",
  searchParam: "search_query",
  types: ["boardgames"],
  requestTimeoutMs: 30000,
};

export const ARCHICHOUETTE_CONFIG: PrestashopRetailerConfig = {
  id: "archichouette",
  label: "Archi-Chouette",
  baseUrl: "https://archi-chouette.fr",
  searchPath: "/recherche",
  searchParam: "search_query",
  types: ["boardgames"],
};

export const CHIPWELD_CONFIG: PrestashopRetailerConfig = {
  id: "chipweld",
  label: "ChipWeld",
  baseUrl: "https://www.chipweld.fr",
  searchPath: "/recherche",
  searchParam: "search_query",
  searchStrategy: "iqit",
  types: ["games"],
  capabilities: ["identify", "description", "cover", "price"],
  sample: {
    name: "Trine: Ultimate Collection",
    barcode: "5016488132497",
  },
  metadataInfo: {
    defaultLanguage: "fr",
    isRealBoxCover: true,
    isSecondary: true,
  },
};

export const LESGENTLEMENDUJEU_CONFIG: PrestashopRetailerConfig = {
  id: "lesgentlemendujeu",
  label: "Les Gentlemen du Jeu",
  baseUrl: "https://lesgentlemendujeu.com",
  searchPath: "/recherche",
  searchParam: "s",
  types: ["boardgames"],
  sample: { name: "Mille Sabords", barcode: "3421272109517" },
};

export const DIDACTO_CONFIG: PrestashopRetailerConfig = {
  id: "didacto",
  label: "Didacto",
  baseUrl: "https://www.didacto.com",
  searchPath: "/recherche",
  searchParam: "s",
  types: ["boardgames"],
  sample: { name: "Mille Sabords", barcode: "3421272109517" },
};

export const FAIRPLAYJEUX_CONFIG: PrestashopRetailerConfig = {
  id: "fairplayjeux",
  label: "Fairplay",
  // The shop lives under /fr; keep it in `searchPath` (an absolute searchPath
  // would otherwise reset the URL to the domain root and drop /fr).
  baseUrl: "https://www.fairplay-jeux.com",
  searchPath: "/fr/recherche",
  searchParam: "s",
  types: ["boardgames"],
  sample: { name: "Mille Sabords", barcode: "3421272109517" },
};

export const CESTLEJEU_CONFIG: PrestashopRetailerConfig = {
  id: "cestlejeu",
  label: "C'est le Jeu",
  baseUrl: "https://www.cestlejeu.com",
  searchPath: "/recherche",
  searchParam: "s",
  types: ["boardgames"],
  sample: { name: "Mille Sabords", barcode: "3421272109517" },
};

export const LUDOCORTEX_CONFIG: PrestashopRetailerConfig = {
  id: "ludocortex",
  label: "Ludocortex",
  baseUrl: "https://www.ludocortex.fr",
  searchPath: "/recherche",
  searchParam: "search_query",
  types: ["boardgames"],
  sample: { name: "Mille Sabords", barcode: "3421272109517" },
};

export const TOKYOGAMESTORY_CONFIG: PrestashopRetailerConfig = {
  id: "tokyogamestory",
  label: "Tokyo Game Story",
  baseUrl: "https://tokyogamestory.com",
  searchPath: "/fr/recherche",
  searchParam: "s",
  types: ["games"],
  capabilities: ["identify", "description", "cover", "price", "releaseDate"],
  sample: {
    name: "The Exit 8 + Platform 8",
    barcode: "4589794580661",
  },
};

export const NETGAMESRETRO_CONFIG: PrestashopRetailerConfig = {
  id: "netgamesretro",
  label: "NetGamesRetro",
  baseUrl: "https://www.netgamesretro.com",
  searchPath: "/fr/recherche",
  searchParam: "s",
  types: ["games", "hardware"],
  capabilities: ["identify", "description", "cover", "price"],
  sample: {
    name: "MX vs ATV : Extrême limite Xbox 360",
    barcode: "4005209102735",
  },
  metadataInfo: {
    defaultLanguage: "fr",
    isRealBoxCover: true,
    isSecondary: true,
    retailCatalogImageTitles: true,
    strictShelfPlatformCover: true,
    coverDefaultRegion: "fr",
  },
};

export const PRESTASHOP_RETAILER_CONFIGS: PrestashopRetailerConfig[] = [
  MONSIEURDE_CONFIG,
  LUDIFOLIE_CONFIG,
  BCDJEUX_CONFIG,
  LEPASSETEMPS_CONFIG,
  ARCHICHOUETTE_CONFIG,
  CHIPWELD_CONFIG,
  LESGENTLEMENDUJEU_CONFIG,
  DIDACTO_CONFIG,
  FAIRPLAYJEUX_CONFIG,
  CESTLEJEU_CONFIG,
  LUDOCORTEX_CONFIG,
  TOKYOGAMESTORY_CONFIG,
  NETGAMESRETRO_CONFIG,
];
