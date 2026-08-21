/**
 * Retrouver le module qui **possède** un pack de données.
 *
 * Le code partagé a régulièrement besoin de demander quelque chose au jeu qu'il
 * traite — où sont ses logos, comment il les rafraîchit. Sans ce détour il
 * branchait sur l'identifiant du pack, une ligne par jeu, et se retrouvait à
 * importer ses propres appelants : du partagé qui connaît le particulier.
 *
 * Le registre est chargé d'un bloc : si un module est là, tous le sont.
 */
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import type { ProviderModule } from "@/types/providerModule";

export function providerModuleForPack(
  packId: string,
): ProviderModule | undefined {
  return PROVIDER_MODULES.find(
    (provider) => provider.catalog?.dataPack === packId,
  );
}

/**
 * Demande au pack de remettre à jour son relevé de logos de set.
 *
 * Rend le message de progression du pack, ou `null` s'il n'a rien à rafraîchir
 * — la plupart des packs n'ont pas de logos à eux.
 */
export async function refreshPackSetLogos(
  packId: string,
  opts: { force?: boolean; offline?: boolean } = {},
): Promise<string | null> {
  const owner = providerModuleForPack(packId);
  if (!owner?.refreshSetLogos) return null;
  return owner.refreshSetLogos(opts);
}
