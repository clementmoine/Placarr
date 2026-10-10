/**
 * Retrouver le(s) module(s) qui **possèdent** un pack de données.
 *
 * Le code partagé a régulièrement besoin de demander quelque chose au jeu qu'il
 * traite — où sont ses logos, comment il les rafraîchit. Sans ce détour il
 * branchait sur l'identifiant du pack, une ligne par jeu, et se retrouvait à
 * importer ses propres appelants : du partagé qui connaît le particulier.
 *
 * Le registre est chargé d'un bloc : si un module est là, tous le sont.
 *
 * Plusieurs modules peuvent partager le même `dataPack` (Pokémon : TCGdex =
 * identité / tirages, Live = scellés + logos). `.find()` sur le premier ne
 * suffit pas — il faut résoudre **par hook**.
 */
import { PROVIDER_MODULES } from "@/core/catalog/registry";
import type { ProviderModule } from "@/types/providerModule";

export function providerModulesForPack(packId: string): ProviderModule[] {
  return PROVIDER_MODULES.filter(
    (provider) => provider.catalog?.dataPack === packId,
  );
}

/**
 * Premier module déclarant ce `dataPack`. Préférer
 * {@link providerModuleProviding} / {@link providerModulesForPack} quand un
 * hook précis est requis — sinon un sibling sans le hook gagne par ordre de
 * registre.
 */
export function providerModuleForPack(
  packId: string,
): ProviderModule | undefined {
  return providerModulesForPack(packId)[0];
}

type PackFnHook = {
  [K in keyof ProviderModule]-?: NonNullable<ProviderModule[K]> extends (
    ...args: never[]
  ) => unknown
    ? K
    : never;
}[keyof ProviderModule];

/** Module du pack qui expose le hook (fonction). */
export function providerModuleProviding<K extends PackFnHook>(
  packId: string,
  hook: K,
): ProviderModule | undefined {
  return providerModulesForPack(packId).find(
    (provider) => typeof provider[hook] === "function",
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
  const owner = providerModuleProviding(packId, "refreshSetLogos");
  if (!owner?.refreshSetLogos) return null;
  return owner.refreshSetLogos(opts);
}
