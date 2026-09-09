/**
 * Le scellé allemand, d'après comicplanet.de.
 *
 * Source de vérité : `curated/sources/comicplanet-de.json`.
 *
 * Le catalogue ne portait **rien** en allemand : ni carte, ni produit. Cette
 * ligne existe pourtant — neuf séries de boosters, plus au moins un display —
 * et comicplanet.de est la seule source de packshots qu'on lui connaisse.
 *
 * Ce qui reste à établir : la **numérotation** des cartes allemandes. Si elle
 * reprend celle du CCG américain (N-/J-/M-/C-), l'allemand serait un problème
 * de titres et non de faces, puisque les 4 261 faces anglaises sont déjà là.
 * Tant que ce n'est pas vérifié sur une carte, on ne mint que le scellé.
 */
import ledger from "../curated/sources/comicplanet-de.json";

export type GermanSealedSpec = {
  slug: string;
  kind: "booster" | "display";
  category: string;
  setCode: string;
  name: string;
  lang: "DE";
  stagingFile: string;
  attested: true;
};

/** `booster-s4-de` → `s4`. */
export function germanSetCode(slug: string): string | null {
  return /-(s\d{1,2})-de$/.exec(slug)?.[1] ?? null;
}

export function germanSealedReleases(): GermanSealedSpec[] {
  const out: GermanSealedSpec[] = [];
  for (const row of ledger.products) {
    const setCode = germanSetCode(row.slug);
    if (!setCode) continue;
    const kind = row.slug.startsWith("display") ? "display" : "booster";
    const n = setCode.replace(/^s/, "");
    out.push({
      slug: row.slug,
      kind,
      category: kind === "display" ? "displays" : "boosters",
      setCode,
      // Libellé aligné FR/IT (le titre boutique DE reste dans le ledger).
      name: kind === "display" ? `Display Série ${n}` : `Booster Série ${n}`,
      lang: "DE",
      stagingFile: `${row.slug}.png`,
      attested: true,
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}
