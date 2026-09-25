/**
 * Langue d'un SKU scellé — normalisée pour matcher les codes cartes / buyAdvice.
 */

export function normalizeSealedLang(
  code: string | null | undefined,
): string | null {
  const trimmed = code?.trim().toLowerCase() ?? "";
  if (!trimmed || trimmed === "unknown" || trimmed === "—" || trimmed === "-") {
    return null;
  }
  if (trimmed === "jp") return "ja";
  if (trimmed === "pt-br") return "ptbr";
  return trimmed;
}

/**
 * Quand la fiche n'a pas de `Langue`, déduire depuis le slug.
 *
 * Uniquement préfixe TCG Cards (`en-…`, `japanese-…`) ou suffixe locale
 * (`…-it`, `…-jp`) — jamais un `-de-` au milieu d'un titre FR
 * (`le-regne-de-jafar`).
 */
export function inferSealedLangFromSlug(
  slug: string | null | undefined,
): string | null {
  const s = (slug ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("japanese-")) return "ja";
  if (/^(en|fr|de|it|es|ja|jp)[-_]/.test(s)) {
    const prefix = /^(en|fr|de|it|es|ja|jp)/.exec(s)![1]!;
    return prefix === "jp" ? "ja" : prefix;
  }
  const suffix = /-(en|fr|de|it|es|ja|jp)$/.exec(s);
  if (suffix) return suffix[1] === "jp" ? "ja" : suffix[1]!;
  return null;
}

export function resolveSealedLang(input: {
  lang?: string | null;
  slug?: string | null;
}): string | null {
  return (
    normalizeSealedLang(input.lang) ?? inferSealedLangFromSlug(input.slug)
  );
}
