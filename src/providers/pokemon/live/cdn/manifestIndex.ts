/**
 * Index des bundles Live par dossier de contenu, d'après les AssetManifests
 * publics (`{contentpath}{bucket}/manifest_{locale}_{bucket}`).
 *
 * La liste des dossiers elle-même n'est pas publique (config-document
 * authentifié, cf. backlog « Foil via TCG Live » #14) : on la découvre
 * (`resolveLiveContentDirs`), puis chaque manifest dit où vit chaque bundle.
 * Un bundle qu'aucun manifest ne liste est absent du CDN — inutile de le
 * sonder dossier par dossier.
 */
export function splitByManifestIndex(
  names: readonly string[],
  bucketOf: ReadonlyMap<string, string>,
): { located: string[]; absent: string[] } {
  const located: string[] = [];
  const absent: string[] = [];
  for (const name of names) {
    if (bucketOf.has(name.toLowerCase())) located.push(name);
    else absent.push(name);
  }
  return { located, absent };
}
