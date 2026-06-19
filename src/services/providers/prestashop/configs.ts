import type { PrestashopRetailerConfig } from "./types";

export const MONSIEURDE_CONFIG: PrestashopRetailerConfig = {
  id: "monsieurde",
  label: "Monsieur de",
  baseUrl: "https://www.monsieurde.com",
  searchPath: "/recherche",
  searchParam: "s",
};

export const LUDIFOLIE_CONFIG: PrestashopRetailerConfig = {
  id: "ludifolie",
  label: "Ludifolie",
  baseUrl: "https://www.ludifolie.com",
  searchPath: "/recherche",
  searchParam: "search_query",
};

export const BCDJEUX_CONFIG: PrestashopRetailerConfig = {
  id: "bcdjeux",
  label: "BCD Jeux",
  baseUrl: "https://www.bcd-jeux.fr",
  searchPath: "/recherche",
  searchParam: "search_query",
};

export const LEPASSETEMPS_CONFIG: PrestashopRetailerConfig = {
  id: "lepassetemps",
  label: "Le Passe-Temps",
  baseUrl: "https://www.le-passe-temps.com",
  searchPath: "/recherche",
  searchParam: "search_query",
};

export const ARCHICHOUETTE_CONFIG: PrestashopRetailerConfig = {
  id: "archichouette",
  label: "Archi-Chouette",
  baseUrl: "https://archi-chouette.fr",
  searchPath: "/recherche",
  searchParam: "search_query",
};

export const PRESTASHOP_RETAILER_CONFIGS: PrestashopRetailerConfig[] = [
  MONSIEURDE_CONFIG,
  LUDIFOLIE_CONFIG,
  BCDJEUX_CONFIG,
  LEPASSETEMPS_CONFIG,
  ARCHICHOUETTE_CONFIG,
];
