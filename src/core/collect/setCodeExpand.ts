/**
 * Plan d'expansion set-scoped pour un exemplaire sans `setCode`.
 *
 * Un printKey listé dans plusieurs extensions (reprints Naruto) devient une
 * ligne par membership : l'item d'origine prend le premier set, les autres
 * sont à créer. Le collectionneur supprime ensuite celles qu'il n'a pas.
 */

/** Memberships triées, dédupliquées, prêtes à assigner. */
export function normalizeSetMemberships(
  setIds: readonly string[],
): string[] {
  const out = new Set<string>();
  for (const raw of setIds) {
    const id = raw.trim().toLowerCase();
    if (id) out.add(id);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export type SetCodeExpandPlan =
  | { kind: "none" }
  | { kind: "stamp"; setCode: string }
  | { kind: "expand"; keepSetCode: string; createSetCodes: string[] };

/**
 * `memberships` = extensions catalogue où ce printKey apparaît.
 * - 0 → rien (catalogue muet) ;
 * - 1 → poser le setCode sur l'item ;
 * - N → garder le 1ᵉʳ, dupliquer pour les autres.
 */
export function planSetCodeExpand(
  memberships: readonly string[],
): SetCodeExpandPlan {
  const sets = normalizeSetMemberships(memberships);
  if (sets.length === 0) return { kind: "none" };
  if (sets.length === 1) return { kind: "stamp", setCode: sets[0]! };
  const [keepSetCode, ...createSetCodes] = sets;
  return { kind: "expand", keepSetCode: keepSetCode!, createSetCodes };
}
