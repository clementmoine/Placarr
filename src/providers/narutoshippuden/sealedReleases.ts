/**
 * Le scellé du 疾風伝, tiré de la base produit officielle de Bandai.
 *
 * Source de vérité : `curated/sources/carddass-official-products.json`, moisson
 * de `sec.carddass.com` du 2026-08-20, scindée du pack Carddass le 2026-08-21 —
 * la base de Bandai mélange les deux jeux, chaque pack ne garde que les siens.
 *
 * Ce module vivait chez le Carddass, et ses dix-neuf SKU s'écrivaient dans
 * l'index scellé de l'autre jeu. Bandai en publie quinze, actes 2, 3, 4, 6, 7
 * et 8 — les actes 1 et 5 manquent à sa propre base.
 *
 * **Ces produits attestent huit actes.** Le catalogue de cartes n'en tient que
 * quatre : les listes officielles moissonnées (`carddas-jp-maku.json`) ne
 * couvraient que 第一幕…第四幕. La moitié du jeu manque encore côté cartes, et
 * c'est le scellé qui l'a révélé.
 *
 * L'acte 1 ne vient pas de là : Bandai ne le porte pas. Il est reconstitué
 * depuis `carddas.com`, le site de jeu de l'époque, qui gardait la page de
 * lancement de la ligne — voir `curated/sources/carddas-jp-products.json`.
 *
 * **Le distributeur automatique a son SKU.** `自販機ブースター` contient le même
 * tirage que la `ブースターパック`, mais Bandai lui donne un **JAN distinct** :
 * c'est un produit commercial séparé, qu'on achète et qu'on possède séparément.
 * Un catalogue de collection le compte donc à part — la décision suit le
 * code-barres, pas le contenu.
 */
import act1Ledger from "./curated/sources/carddas-jp-act1.json";
import official from "./curated/sources/carddass-official-products.json";

export type ShippudenFormat = "booster" | "vending" | "starter" | "coin";

export type ShippudenSealedSpec = {
  slug: string;
  kind: "booster" | "deck" | "coffret";
  category: string;
  setCode: string | null;
  name: string;
  lang: "JA";
  released: string | null;
  format: ShippudenFormat;
  /** Vide pour l'acte 1 : Bandai ne lui a jamais donné de fiche. */
  jan: string | null;
  stagingFile: string;
  /** Le dossier de staging d'où sort `stagingFile`. */
  stagingKind: "carddass-official" | "carddas-jp";
  attested: true;
};

const ACT_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  "１": 1,
  "２": 2,
  "３": 3,
  "４": 4,
  "５": 5,
  "６": 6,
  "７": 7,
  "８": 8,
};

/** `第三幕` / `第３幕` → 3. */
export function shippudenAct(title: string): number | null {
  const match = /第([一二三四五六七八１２３４５６７８])幕/.exec(title);
  return match ? (ACT_DIGITS[match[1]!] ?? null) : null;
}

/**
 * Le format, lu dans le titre officiel. `自販機` (distributeur) est testé avant
 * `ブースター` : les deux mots cohabitent dans « 自販機ブースター ».
 */
export function shippudenFormat(title: string): ShippudenFormat {
  if (/自販機/.test(title)) return "vending";
  if (/構築済み|スターター/.test(title)) return "starter";
  if (/Coin/i.test(title)) return "coin";
  return "booster";
}

function kindFor(format: ShippudenFormat): ShippudenSealedSpec["kind"] {
  if (format === "starter") return "deck";
  if (format === "coin") return "coffret";
  // Le distributeur reste un booster : son contenu est aléatoire.
  return "booster";
}

function categoryFor(kind: ShippudenSealedSpec["kind"]): string {
  if (kind === "booster") return "boosters";
  if (kind === "deck") return "decks";
  return "collector-boxes";
}

/**
 * Le premier acte, que la base produit de Bandai ignore.
 *
 * Sans lui le catalogue portait 75 cartes en `maku1` et aucun produit pour les
 * contenir. Les trois SKU sont ceux de la page de lancement : le sachet, le
 * 構築済みスターターBOX du premier tirage, et le distributeur.
 */
function shippudenAct1(): ShippudenSealedSpec[] {
  return act1Ledger.products.map((row) => {
    const format = shippudenFormat(row.title);
    const kind = kindFor(format);
    return {
      slug: row.slug,
      kind,
      category: categoryFor(kind),
      setCode: "maku1",
      name: row.title,
      lang: "JA" as const,
      released: "2007",
      format,
      jan: null,
      stagingFile: row.file,
      stagingKind: "carddas-jp" as const,
      attested: true as const,
    };
  });
}

export function shippudenSealedReleases(): ShippudenSealedSpec[] {
  const out: ShippudenSealedSpec[] = shippudenAct1();
  const seen = new Set<string>(out.map((row) => row.slug));
  for (const row of official.products) {
    if (!/疾風伝/.test(row.title)) continue;
    const format = shippudenFormat(row.title);
    const act = shippudenAct(row.title);
    if (format !== "coin" && act == null) continue;
    const slug =
      format === "coin"
        ? "coin-plus-shippuden-jp"
        : `${format === "vending" ? "vending" : format}-shippuden-act${act}-jp`;
    // Bandai liste deux fois le troisième acte ; le premier JAN gagne.
    if (seen.has(slug)) continue;
    seen.add(slug);
    const kind = kindFor(format);
    out.push({
      slug,
      kind,
      category: categoryFor(kind),
      setCode: act == null ? null : `maku${act}`,
      name: row.title,
      lang: "JA",
      released: row.released,
      format,
      jan: row.jan,
      stagingFile: `${slug}.jpg`,
      stagingKind: "carddass-official",
      attested: true,
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}
