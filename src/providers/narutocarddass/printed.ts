import { appearanceSetsOf, type NarutoAppearanceValue } from "./appearanceSets";
import { narutoSetsUnreleasedInFrench } from "./facts";

/**
 * Si une langue a réellement été **imprimée sur carton** pour ce set.
 *
 * La Série 6 française fut annoncée puis annulée : les entrées françaises du
 * catalogue sont des rendus de pré-production trouvés sur `carddass.fr`, pas
 * des cartes qu'on peut tenir. Les italiennes, elles, existent — le set a été
 * imprimé en Italie.
 *
 * **Le fait se lit dans le registre**, où il était déjà écrit (`released:
 * false` + la note `cancelled`). Il était en plus codé en dur ici, et je m'
 * apprêtais à l'écrire une troisième fois pour le filtre de langue : trois
 * copies d'une même chose, dont deux se seraient tues le jour où un autre set
 * subirait le même sort.
 *
 * Plusieurs séries (checklist papier) : imprimée dès qu’**une** série l’est.
 */
export function isNarutoLangPrinted(
  appearanceSet: NarutoAppearanceValue | null | undefined,
  lang: string,
): boolean {
  const code = lang?.trim().toLowerCase();
  if (code !== "fr" && code !== "fra") return true;
  const sets = appearanceSetsOf(appearanceSet);
  if (sets.length === 0) return true;
  const blocked = narutoSetsUnreleasedInFrench();
  return sets.some((set) => !blocked.has(set));
}

/**
 * One print, several locales: keep the retail appearance. An Italian S6 face
 * on the same NI number must not mark the French S2/S3 slot unprinted.
 */
export function preferNarutoAppearanceSet(
  current: string | null | undefined,
  next: string,
): string {
  const a = (current ?? "").trim().toLowerCase();
  const b = next.trim().toLowerCase();
  if (!a || a === "unknown") return b || "unknown";
  if (!b || b === "unknown") return a;
  if (a === "s6" && b !== "s6") return b;
  return a;
}
