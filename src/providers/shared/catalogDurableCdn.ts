/**
 * Durabilité d’accès des URLs catalogue — CDN joignable vs conservation locale.
 *
 * Contrat : docs/catalogue_contract.md. Trait déclaré par host / provider,
 * pas de magie core. Si non durable → download obligatoire à l’ingest.
 */
export type CatalogAssetDurability = "durable_cdn" | "ephemeral";

/** Hosts connus comme CDN stables (faces / assets officiels ou encyclopédie). */
const DURABLE_CDN_HOSTS: readonly string[] = [
  "assets.tcgdex.net",
  "api.lorcana.ravensburger.com",
  "cdn.ravensburger.com",
  "cards.lorcast.io",
  "static.dbscards.fr",
  "static.fw.dbscards.fr",
  "static.opecards.fr",
  "static.pkmcards.fr",
  "static.lorcards.fr",
  "static.mtgcards.fr",
  "static.ygocards.fr",
  "www.dbs-cardgame.com",
  "www.bandai.com",
  "cards.scryfall.io",
  "backs.scryfall.io",
];

function hostOf(urlOrHost: string): string | null {
  const raw = urlOrHost.trim().toLowerCase();
  if (!raw) return null;
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).hostname.replace(/^www\./, "");
    }
  } catch {
    /* fall through */
  }
  return raw.replace(/^www\./, "").split("/")[0] || null;
}

/**
 * `durable_cdn` → URL distante OK en base.
 * `ephemeral` → conservation locale obligatoire (marketplace, Wayback fragile…).
 */
export function catalogAssetDurability(
  urlOrHost: string,
): CatalogAssetDurability {
  const host = hostOf(urlOrHost);
  if (!host) return "ephemeral";
  for (const allowed of DURABLE_CDN_HOSTS) {
    const needle = allowed.replace(/^www\./, "");
    if (host === needle || host.endsWith(`.${needle}`)) {
      return "durable_cdn";
    }
  }
  return "ephemeral";
}

export function catalogUrlMayStayRemote(urlOrHost: string): boolean {
  return catalogAssetDurability(urlOrHost) === "durable_cdn";
}

export function catalogUrlRequiresLocalConservation(urlOrHost: string): boolean {
  return catalogAssetDurability(urlOrHost) === "ephemeral";
}
