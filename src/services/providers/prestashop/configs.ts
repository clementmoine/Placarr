import type { PrestashopRetailerConfig } from "./types";

export const MONSIEURDE_CONFIG: PrestashopRetailerConfig = {
  id: "monsieurde",
  label: "Monsieur de",
  baseUrl: "https://www.monsieurde.com",
  searchPath: "/recherche",
  searchParam: "s",
  types: ["boardgames"],
};

export const LUDIFOLIE_CONFIG: PrestashopRetailerConfig = {
  id: "ludifolie",
  label: "Ludifolie",
  baseUrl: "https://www.ludifolie.com",
  searchPath: "/recherche",
  searchParam: "search_query",
  types: ["boardgames"],
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
};

export const ARCHICHOUETTE_CONFIG: PrestashopRetailerConfig = {
  id: "archichouette",
  label: "Archi-Chouette",
  baseUrl: "https://archi-chouette.fr",
  searchPath: "/recherche",
  searchParam: "search_query",
  types: ["boardgames"],
};

// Apriloshop is PrestaShop too (games / pop-culture shop). Its native search is
// currently empty (it moved to the IQIT search module → returns no results for
// now); kept on the native strategy until an IQIT search strategy is added.
export const APRILOSHOP_CONFIG: PrestashopRetailerConfig = {
  id: "apriloshop",
  label: "Apriloshop",
  baseUrl: "https://apriloshop.fr",
  searchPath: "/recherche",
  searchParam: "s",
  types: ["games"],
  capabilities: ["identify", "description", "cover", "price", "releaseDate"],
  sample: { name: "Mario Kart Wii", barcode: "0045496365226" },
};

export const PRESTASHOP_RETAILER_CONFIGS: PrestashopRetailerConfig[] = [
  MONSIEURDE_CONFIG,
  LUDIFOLIE_CONFIG,
  BCDJEUX_CONFIG,
  LEPASSETEMPS_CONFIG,
  ARCHICHOUETTE_CONFIG,
  APRILOSHOP_CONFIG,
];
