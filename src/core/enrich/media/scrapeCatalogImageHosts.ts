/**
 * Scrape-catalog + dedicated shop domains whose product images live on the shop
 * host. Frozen for middleware (registry-free); kept in sync by
 * `nextImageRemoteHosts.test.ts` against PrestaShop/Shopify configs + dedicated.
 */
export const SCRAPE_CATALOG_IMAGE_BASE_URLS = [
  "https://www.monsieurde.com",
  "https://www.ludifolie.com",
  "https://www.bcd-jeux.fr",
  "https://www.le-passe-temps.com",
  "https://archi-chouette.fr",
  "https://www.chipweld.fr",
  "https://lesgentlemendujeu.com",
  "https://www.didacto.com",
  "https://www.fairplay-jeux.com",
  "https://www.cestlejeu.com",
  "https://www.ludocortex.fr",
  "https://tokyogamestory.com",
  "https://www.netgamesretro.com",
  "https://latelierdesjeux.com",
  "https://www.espritjeu.com",
  "https://www.myludo.fr",
  "https://www.play-in.com",
  "https://www.okkazeo.com",
  "https://www.philibertnet.com",
] as const;
