import { parseRomanToken } from "@/core/enrich/titles/romanNumeral";

/**
 * Équivalence de tokens pour le matching de titres.
 *
 * Structurel uniquement : accents / casse, roman ↔ arabic (II ≡ 2).
 * Pas de dictionnaire FR↔EN inventé (couleurs, criquet/cricket, …) —
 * l'alias par-produit vient des DONNÉES provider (`regionalTitles` /
 * alternate names). Compound hyphenation ("Q-Force" ≡ "QForce") vit dans
 * residual identity.
 */

/**
 * Forme canonique d'un token : accents retirés, casse neutralisée.
 */
function normalizeEquivalentToken(token: string): string {
  return token.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function arabicSequelValue(token: string): number | null {
  if (!/^\d{1,2}$/.test(token)) return null;
  const value = Number.parseInt(token, 10);
  if (!Number.isFinite(value) || value < 1 || value > 99) return null;
  return value;
}

export function titleTokensEquivalent(a: string, b: string): boolean {
  const normalizedA = normalizeEquivalentToken(a);
  const normalizedB = normalizeEquivalentToken(b);
  if (normalizedA === normalizedB) return true;

  const romanA = parseRomanToken(normalizedA);
  const romanB = parseRomanToken(normalizedB);
  const arabicA = arabicSequelValue(normalizedA);
  const arabicB = arabicSequelValue(normalizedB);
  if (romanA != null && arabicB != null && romanA === arabicB) return true;
  if (romanB != null && arabicA != null && romanB === arabicA) return true;

  return false;
}

export function titleTokenPresentInSet(
  token: string,
  titleTokens: Set<string>,
): boolean {
  if (titleTokens.has(token)) return true;
  for (const candidate of titleTokens) {
    if (titleTokensEquivalent(token, candidate)) return true;
  }
  return false;
}
