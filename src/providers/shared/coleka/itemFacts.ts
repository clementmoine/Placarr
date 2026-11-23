/**
 * Fiche objet Coleka (`…_i<id>`) — faits de la liste `<dt>/<dd>` :
 * date de sortie (`itemprop="releaseDate"`) et « Prix dans le commerce ».
 * Champ absent ou illisible → `null`.
 */
export type ColekaItemFacts = {
  releaseDate: string | null;
  retailPriceCents: number | null;
};

function ddAfter(html: string, label: string): string | null {
  const re = new RegExp(
    `<dt>\\s*${label}\\s*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`,
    "i",
  );
  return html.match(re)?.[1] ?? null;
}

export function parseColekaItemFacts(html: string): ColekaItemFacts {
  const release = html.match(
    /itemprop="releaseDate"[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*</i,
  )?.[1];
  const priceRaw = ddAfter(html, "Prix dans le commerce")
    ?.replace(/<[^>]+>/g, " ")
    .match(/(\d+)(?:[,.](\d{1,2}))?\s*€/);
  let retailPriceCents: number | null = null;
  if (priceRaw) {
    const cents =
      Number(priceRaw[1]) * 100 + Number((priceRaw[2] ?? "0").padEnd(2, "0"));
    retailPriceCents = cents > 0 ? cents : null;
  }
  return { releaseDate: release ?? null, retailPriceCents };
}
