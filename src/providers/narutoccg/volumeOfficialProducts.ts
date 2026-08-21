/**
 * Les 巻ノ autres que la ブースターパック : distributeurs et starters nommés.
 *
 * Source de vérité : `curated/sources/carddass-official-products.json`.
 *
 * La ligne des dix-sept volumes n'était cataloguée que par ses boosters. Bandai
 * publie aussi, pour certains volumes, un **自販機ブースター** et un ou deux
 * **構築済みスターター** portant un nom de livre. Chacun a son JAN — donc son
 * SKU, comme pour le 疾風伝 : la décision suit le code-barres, pas le contenu.
 *
 * Les noms de livre corroborent le champ `books` de `cardcheckbox-jp.json` :
 * 豪雷の書 pour le volume 16, 木ノ葉の書 et 呪印の書 pour le douzième. Deux
 * relevés indépendants qui disent la même chose.
 */
import official from "./curated/sources/carddass-official-products.json";

export type VolumeProductFormat = "vending" | "starter";

export type VolumeOfficialSpec = {
  slug: string;
  kind: "booster" | "deck";
  category: string;
  setCode: string;
  name: string;
  lang: "JA";
  released: string | null;
  format: VolumeProductFormat;
  jan: string;
  stagingFile: string;
  attested: true;
};

const KANJI: Record<string, number> = {
  壱: 1,
  一: 1,
  弐: 2,
  二: 2,
  参: 3,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/** `巻ノ十二` → 12, `巻ノ四` → 4. */
export function volumeNumber(title: string): number | null {
  const match = /巻ノ([一二三四五六七八九十壱弐参]+)/.exec(title);
  if (!match) return null;
  const kanji = match[1]!;
  if (kanji.length === 1) return KANJI[kanji] ?? null;
  if (kanji.startsWith("十")) return 10 + (KANJI[kanji[1]!] ?? 0);
  return KANJI[kanji] ?? null;
}

/**
 * Les livres des starters, translittérés pour tenir dans un slug.
 *
 * Liste explicite plutôt que translittération automatique : ces trois noms
 * sont tout ce que Bandai publie, et une romanisation devinée serait un pari
 * sur des lectures kanji ambiguës.
 */
const BOOK_SLUGS: Record<string, string> = {
  豪雷の書: "gorai",
  呪印の書: "jyuin",
  木ノ葉の書: "konoha",
};

export function starterBook(title: string): string | null {
  for (const book of Object.keys(BOOK_SLUGS)) {
    if (title.includes(book)) return book;
  }
  return null;
}

export function volumeProductFormat(title: string): VolumeProductFormat | null {
  // `自販機ブースター` porte le mot `ブースター` : le distributeur passe avant.
  if (/自販機/.test(title)) return "vending";
  if (/構築済み|スターター/.test(title)) return "starter";
  return null;
}

export function volumeOfficialProducts(): VolumeOfficialSpec[] {
  const out: VolumeOfficialSpec[] = [];
  const seen = new Set<string>();
  for (const row of official.products) {
    const volume = volumeNumber(row.title);
    if (volume == null) continue;
    const format = volumeProductFormat(row.title);
    if (!format) continue;
    const book = format === "starter" ? starterBook(row.title) : null;
    const slug =
      format === "vending"
        ? `vending-vol${volume}-jp`
        : `starter-${book ? BOOK_SLUGS[book] : `vol${volume}`}-vol${volume}-jp`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      kind: format === "vending" ? "booster" : "deck",
      category: format === "vending" ? "boosters" : "decks",
      setCode: `maki${volume}`,
      name: row.title,
      lang: "JA",
      released: row.released,
      format,
      jan: row.jan,
      stagingFile: `${slug}.jpg`,
      attested: true,
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}
