import type { ShopifyRetailerConfig } from "./types";

export const LATELIERDESJEUX_CONFIG: ShopifyRetailerConfig = {
  id: "latelierdesjeux",
  label: "L'Atelier des Jeux",
  baseUrl: "https://latelierdesjeux.com",
  types: ["boardgames"],
  sample: { name: "Mille Sabords", barcode: "3421272109517" },
};

export const SHOPIFY_RETAILER_CONFIGS: ShopifyRetailerConfig[] = [
  LATELIERDESJEUX_CONFIG,
];
