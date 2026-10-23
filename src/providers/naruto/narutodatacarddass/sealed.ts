/**
 * Data Carddass — pas de SKU scellé retail attesté (cartes borne / boosters arcade).
 *
 * Hunt 2026-09-20 : ledgers eBay mikanshop / takumi / Suruga = singles / promos
 * (DN/NM/NX, CAN non ouvert, pochettes NXpf) — **pas** de binder / start pack /
 * promo box retail minté. `hasSealedProducts: false` côté Catalogue.
 * Packshots produit à coller quand une source retail fiable apparaît.
 */
export function ingestDataCarddassSealedProducts(): {
  written: number;
  skipped: number;
  file: string;
} {
  return { written: 0, skipped: 0, file: "" };
}
