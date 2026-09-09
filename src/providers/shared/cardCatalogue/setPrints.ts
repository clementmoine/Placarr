/**
 * Énumérer une extension entière, pour la check-list.
 *
 * `searchPrints` répond à « montre-moi quelques cartes » : il se borne, comme
 * il doit, à ce qu'un sélecteur affiche. Une check-list, elle, compte — et
 * compter un set de 452 cartes sur les deux cents premières annonce une
 * complétion fausse, fausse **par excès**.
 *
 * Ce module ne fait qu'une chose, et pour tous les packs : demander tout, puis
 * garder ce qui est bien dans la langue voulue. Le filtre après coup n'est pas
 * une précaution inutile — plusieurs packs rendent les autres langues en repli
 * quand la langue demandée manque, ce qui est le bon comportement pour un
 * sélecteur et le mauvais pour un décompte.
 */
import type { PrintCandidate } from "@/types/providerModule";

/** Assez haut pour le plus gros set connu, assez bas pour rester une borne. */
export const SET_ENUMERATION_LIMIT = 5000;

export async function enumerateSetPrints(input: {
  setId: string;
  language?: string | null;
  search: (opts: {
    query: string;
    setId: string;
    language?: string;
    limit: number;
  }) => PrintCandidate[] | Promise<PrintCandidate[]>;
}): Promise<PrintCandidate[]> {
  const setId = input.setId.trim();
  if (!setId) return [];
  const language = input.language?.trim().toLowerCase();
  const rows = await input.search({
    query: "",
    setId,
    language: language || undefined,
    limit: SET_ENUMERATION_LIMIT,
  });
  if (!language) return rows;
  return rows.filter(
    (row) => (row.language ?? "").trim().toLowerCase() === language,
  );
}
