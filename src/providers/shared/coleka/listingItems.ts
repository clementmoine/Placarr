/**
 * Tuiles d'une page de liste Coleka, quel que soit le gabarit servi :
 * - historique : `<a class="lib_has_2_lines" data-id …>` + `<h3 class="product-title">`
 *   + `<span class="ref">Ref. X</span>` ;
 * - « k5 » (servi depuis 2026-11) : `<article class="k5" data-id …>` +
 *   `<a class="k5-lien">` + `<h3>` + `<p>Ref. X</p>`.
 *
 * Les parseurs de chaque jeu filtrent ensuite `ref` selon leurs préfixes ;
 * un gabarit inconnu rend `[]` (honnête), jamais une tuile devinée.
 */

export type ColekaListingItem = {
  /** Identifiant Coleka (`data-id`), `""` s'il manque. */
  id: string;
  /** Chemin de la fiche (deep link de provenance). */
  href: string;
  title: string;
  /** Texte après « Ref. » (`NI-1363`, `Pr-096`…), `null` sans référence. */
  ref: string | null;
  thumbUrl: string | null;
};

const LEGACY_RE =
  /<a\s([^>]*class="[^"]*lib_has_2_lines[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
const K5_RE =
  /<article\s([^>]*class="[^"]*\bk5\b[^"]*"[^>]*)>([\s\S]*?)<\/article>/gi;

function decodeBasicEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function thumbOf(inner: string): string | null {
  return (
    inner.match(
      /<img[^>]+src="(https:\/\/thumbs\.coleka\.com\/[^"]+)"/i,
    )?.[1] ?? null
  );
}

function refOf(text: string | undefined): string | null {
  const ref = text?.match(/Ref\.\s*([^<]+?)\s*$/i)?.[1];
  if (!ref) return null;
  // k5 ajoute parfois l'année de sortie : `Ref. NI-01 · 2002`.
  return decodeBasicEntities(ref).replace(/\s*·\s*\d{4}$/, "") || null;
}

type Hit = { index: number; item: ColekaListingItem };

export function colekaListingItems(html: string): ColekaListingItem[] {
  const hits: Hit[] = [];
  for (const match of html.matchAll(LEGACY_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const href = attrs.match(/\bhref="([^"]+)"/i)?.[1];
    const title = inner.match(/<h3 class="product-title">([^<]+)<\/h3>/i)?.[1];
    if (!href || !title) continue;
    hits.push({
      index: match.index ?? 0,
      item: {
        id: attrs.match(/\bdata-id="(\d+)"/i)?.[1] ?? "",
        href,
        title: decodeBasicEntities(title),
        ref: refOf(inner.match(/<span class="ref">([^<]*)<\/span>/i)?.[1]),
        thumbUrl: thumbOf(inner),
      },
    });
  }
  for (const match of html.matchAll(K5_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const link = inner.match(/<a\s[^>]*class="[^"]*k5-lien[^"]*"[^>]*>/i)?.[0];
    const href = link?.match(/\bhref="([^"]+)"/i)?.[1];
    const title = inner.match(/<h3[^>]*>([^<]+)<\/h3>/i)?.[1];
    if (!href || !title) continue;
    hits.push({
      index: match.index ?? 0,
      item: {
        id: attrs.match(/\bdata-id="(\d+)"/i)?.[1] ?? "",
        href,
        title: decodeBasicEntities(title),
        ref: refOf(inner.match(/<p[^>]*>\s*(Ref\.[^<]*)<\/p>/i)?.[1]),
        thumbUrl: thumbOf(inner),
      },
    });
  }
  return hits.sort((a, b) => a.index - b.index).map((hit) => hit.item);
}

export type ColekaListingTemplate = "legacy" | "k5";

/** Gabarit d'une page de liste, `null` sans tuile (mur, page vide, inconnu). */
export function colekaListingTemplate(
  html: string,
): ColekaListingTemplate | null {
  if (new RegExp(K5_RE.source, "i").test(html)) return "k5";
  if (new RegExp(LEGACY_RE.source, "i").test(html)) return "legacy";
  return null;
}

/**
 * Une lecture de liste n'est complète que si toutes ses pages viennent du
 * même gabarit : les deux n'ont ni la même taille de page (48 / 60) ni le même
 * tri, et le cache CDN de Coleka sert parfois l'ancien pour une page. Mélangées,
 * des cartes ne tombent sur aucune page. Les pages sans tuile (fin de liste)
 * ne comptent pas.
 */
export function colekaListingPagesCoherent(pages: readonly string[]): boolean {
  const templates = new Set(
    pages
      .map((html) => colekaListingTemplate(html))
      .filter((t): t is ColekaListingTemplate => t != null),
  );
  return templates.size <= 1;
}

/** « Page 1 sur 3 » au-dessus des tuiles — `null` si la page ne le dit pas. */
export function colekaListingPageCount(html: string): number | null {
  const m = /Page\s+\d+\s+(?:sur|of)\s+(\d+)/i.exec(html);
  const n = m ? Number.parseInt(m[1]!, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * URLs d'une liste paginée d'après le nombre de pages qu'elle annonce :
 * la base est la 1re page, `?p=1` la 2e (k5, 60 tuiles par page).
 */
export function colekaListingPageUrls(
  baseUrl: string,
  pages: number,
): string[] {
  return Array.from({ length: Math.max(1, pages) }, (_, i) =>
    i === 0 ? baseUrl : `${baseUrl}?p=${i}`,
  );
}

/**
 * Pages à lire d'après la 1re (« Page 1 sur N » / « Page 1 of N ») ; à défaut,
 * la liste figée du parseur. Un calcul figé (48 par page avant k5, 60 depuis)
 * demandait des pages au-delà de la fin, servies périmées par le cache CDN.
 */
export function colekaListingUrlsFromFirstPage(
  firstPage: string,
  fallback: string[],
): string[] {
  const count = colekaListingPageCount(firstPage);
  return count && fallback[0]
    ? colekaListingPageUrls(fallback[0], count)
    : fallback;
}
