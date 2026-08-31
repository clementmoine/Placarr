/**
 * Ce qu'un produit scellé **contient**, tel que la boutique / le ledger l'écrit.
 *
 * Deux faits distincts, à ne pas confondre avec `declaredCardCount` des fiches
 * lorcards (souvent la taille du **set**, pas du sachet) :
 *
 * - `cardsPerPack` — cartes dans **un** sachet (Lorcana 12, Naruto 8).
 * - `packsContained` — sachets dans **ce** produit (booster = 1, display = 24).
 *
 * On ne lit que ce qui est écrit (nom, slug). Rien n'est inventé : absent =
 * `null`, et le conseil d'achat s'abstient plutôt que de supposer « 24 ».
 */

/** « Booster 12 cartes … » → 12. Au-delà de 100 = taille de set, pas de sachet. */
export function cardsPerPackFromShopText(
  text: string | null | undefined,
): number | null {
  const match = /\b(\d{1,3})\s*cartes?\b/i.exec(text ?? "");
  if (!match) return null;
  const size = Number(match[1]);
  return size > 0 && size <= 100 ? size : null;
}

/** « Display 24 boosters » / `display-24-boosters-…` → 24. */
export function packsContainedFromShopText(
  text: string | null | undefined,
): number | null {
  const match = /\b(\d{1,3})[\s-]*boosters?\b/i.exec(text ?? "");
  if (!match) return null;
  const packs = Number(match[1]);
  return packs > 0 && packs <= 100 ? packs : null;
}

export type SealedContents = {
  cardsPerPack: number | null;
  packsContained: number | null;
};

/**
 * Contenu d'un SKU, déduit du texte boutique + d'un éventuel compte annoncé.
 *
 * `declaredCardCount` ne sert de repli **sachet** que s'il est plausible
 * (≤ 100) — chez Naruto le ledger pose 8 ; chez lorcards le même champ porte
 * 420 (le set) et doit être ignoré ici.
 */
export function resolveSealedContents(input: {
  kind: string;
  name?: string | null;
  slug?: string | null;
  /** Compte boutique / ledger — sachet seulement s'il est petit. */
  declaredCardCount?: number | null;
}): SealedContents {
  const name = input.name ?? "";
  const slug = input.slug ?? "";
  const fromName = cardsPerPackFromShopText(name);
  const fromSlug = cardsPerPackFromShopText(slug);
  const declared = input.declaredCardCount;
  const declaredAsPack =
    declared != null && declared > 0 && declared <= 100 ? declared : null;

  const packsFromText =
    packsContainedFromShopText(name) ?? packsContainedFromShopText(slug);

  if (input.kind === "display") {
    return {
      cardsPerPack: fromName ?? fromSlug,
      packsContained: packsFromText,
    };
  }

  if (input.kind === "booster") {
    return {
      cardsPerPack: fromName ?? fromSlug ?? declaredAsPack,
      packsContained: packsFromText ?? 1,
    };
  }

  return {
    cardsPerPack: fromName ?? fromSlug ?? declaredAsPack,
    packsContained: packsFromText,
  };
}
