/**
 * Le scellé japonais, tiré de la liste de sorties déjà curée.
 *
 * `curated/sources/cardcheckbox-jp.json` recense **30 sorties** japonaises avec
 * leur date, leur volumétrie et les plages de numéros qu'elles ouvrent. Le
 * catalogue n'en portait que **deux**, et pour une raison qui n'a rien à voir
 * avec ce qui a existé : l'ingest Naruto saute tout SKU sans packshot. Le
 * scellé japonais n'était donc pas incomplet parce qu'on ignorait ces sorties,
 * mais parce que personne n'en a photographié l'emballage.
 *
 * Ces specs portent `attested: true` : la sortie est attestée par un relevé
 * curé, on la catalogue sans visuel plutôt que de faire comme si elle n'avait
 * pas eu lieu. Le jour où un packshot arrive, il se pose dessus sans rien
 * changer d'autre.
 *
 * Le `kind` est déduit du vocabulaire de la source, jamais de sa position dans
 * la liste :
 *
 * | Ce que la sortie dit          | `kind`    |
 * | ----------------------------- | --------- |
 * | 巻ノ N, `BOOSTER`             | `booster` |
 * | スターターボックス            | `deck`    |
 * | `format: "jumbo"` (feuilles)  | `coffret` |
 * | le reste (boîte, coin,菓子)   | `coffret` |
 *
 * `coffret` sert de fourre-tout pour les feuilles jumbo, les boîtes de
 * collection, les coins et les cartes-bonbon : le vocabulaire de `kind` a
 * quatre cases et aucune ne dit « feuille d'extension ». Le libellé japonais
 * est conservé tel quel dans `name`, il porte la vérité.
 */
import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";

import ledger from "../curated/sources/cardcheckbox-jp.json";

export type JapaneseReleaseRow = {
  name: string;
  released?: string;
  kinds?: string;
  format?: string;
  numbering?: string;
  books?: string[];
  note?: string;
  last?: boolean;
  ni?: [number, number];
  te?: [number, number];
  ta?: [number, number];
  cl?: [number, number];
  ki?: [number, number];
};

export type JapaneseSealedSpec = {
  slug: string;
  kind: SealedKind;
  category: string;
  setCode: string | null;
  name: string;
  lang: "JA";
  released: string | null;
  /**
   * Cartes **par sachet**. Inconnu pour presque toutes ces sorties : le relevé
   * chiffre le nombre de cartes *différentes* du set, pas ce qu'on trouve dans
   * un paquet. Confondre les deux ferait dire au catalogue qu'un booster 巻ノ一
   * contient 70 cartes.
   */
  declaredCardCount: number | null;
  /** Cartes différentes ouvertes par la sortie (`70+P` → 70). Autre fait. */
  setKinds: number | null;
  /** Attestée par un relevé curé : catalogable sans packshot. */
  attested: true;
  /**
   * Visuel d'emballage, quand une source en publie un — Bandai d'abord, la
   * base de rachat Suruga-ya à défaut.
   *
   * La base produit de Bandai ne remonte pas jusqu'au début de la ligne : sur
   * les dix-sept volumes, quatre y ont une fiche avec packshot, deux autres
   * viennent de Suruga.
   */
  stagingFile?: string;
  /** Le dossier de staging d'où sort `stagingFile`. */
  stagingKind?:
    | "carddass-official"
    | "carddas-jp"
    | "suruga-kaitori"
    | "jp-boosters"
    | "tv-tokyo";
};

/**
 * Volumes dont Bandai publie encore le visuel de la ブースターパック.
 * Relevé sur `sec.carddass.com` le 2026-08-20 — voir
 * `curated/sources/carddass-official-products.json`.
 *
 * Le 巻ノ四 en est **sorti** : sa fiche illustre le produit par six cartes
 * étalées, sans le moindre emballage. Le site de jeu en montre le sachet, et
 * un sachet de 75×144 vaut mieux qu'une planche de cartes en 560×560 sur un
 * SKU de type booster.
 */
const OFFICIAL_BOOSTER_PACKSHOTS = new Set([12, 16, 17]);

/**
 * Volumes dont le sachet ne subsiste que sur `carddas.com`, le site de jeu de
 * l'époque, via son miroir Wayback — voir `curated/sources/carddas-jp-products.json`.
 *
 * Le nom de fichier porte l'ordinal du volume, et trois recoupements
 * indépendants l'attestent : `2nd.gif` se lit 巻ノ弐, `13th_logo.gif` se lit
 * 巻ノ十三, et les sachets des volumes 13, 14 et 15 impriment leur propre
 * numéro. Les volumes 4, 16 et 17 concordent en outre avec la base produit.
 *
 * Visuels petits — de 75×143 à 100×201 — donc placés après la base produit.
 */
const CARDDAS_JP_BOOSTER_PACKSHOTS: Record<number, string> = {
  2: "image/product/2nd.jpg",
  3: "image/product/3nd.jpg",
  4: "image/product/4nd.gif",
  5: "image/product/5nd.gif",
  13: "image/product/13th_pac.gif",
  14: "image/product/14th_pac.gif",
  15: "image/product/15/pac.gif",
};

/**
 * Sorties hors 巻ノ (et le sachet 巻ノ一) dont le miroir Wayback tient déjà
 * un packshot sous `image/new/` ou `image/product/`.
 *
 * `1st_pac.gif` vit sous `image/new/` — la note `carddas-jp-products.json`
 * parlait de `image/product/1st_pac.gif`, absent de la CDX ; le fichier new
 * est bien là (75×143, « 1パック10枚入り / 全70種 »).
 *
 * Pas de mapping inventé : ラムネ菓子, Vジャンプ special filing et 絵巻 弐
 * restent sans visuel tant qu'aucune photo d'emballage n'est attestée.
 */
const CARDDAS_JP_RELEASE_PACKSHOTS: Readonly<Record<string, string>> = {
  "booster-vol1-jp": "image/new/1st_pac.gif",
  "jp-release-07": "image/new/gokui.gif",
  "jp-release-12": "image/new/yukihime.gif",
  "jp-release-18": "image/new/coin_plus1.gif",
  "jp-release-21": "image/new/kakucyou.gif",
  "jp-release-23": "image/product/shinobi.gif",
  "jp-release-25": "image/product/ex_seat2_img.jpg",
  "jp-release-27": "image/new/coin_2.gif",
  "jp-release-29": "image/new/spc2_img.jpg",
};

/**
 * Volumes dont la photo d'emballage vient de la base de rachat Suruga-ya,
 * faute de fiche chez Bandai. URL collées, CDN lu directement.
 */
const SURUGA_BOOSTER_PACKSHOTS = new Set([7, 9]);

/**
 * Sorties sans numéro de volume dont Suruga publie l'emballage, par slug.
 * `jp-release-04` est le 秘技伝授スターターボックス ; la photo montre le
 * サスケの書, alors que la sortie couvre aussi le ナルトの書 — deux livres sous
 * un seul SKU, à séparer le jour où on aura les deux visuels.
 */
const SURUGA_RELEASE_PACKSHOTS = new Set(["jp-release-04"]);

/**
 * Volumes dont le visuel est une image de fiche **détourée à la main**, donc
 * rangée dans `curated/` : le staging se reconstruit par script et l'effacerait.
 */
const CURATED_BOOSTER_PACKSHOTS = new Set([6, 8]);

/**
 * Volumes illustrés par les pages officielles de TV Tokyo, faute de mieux.
 * Visuels petits — 102×215 et 182×250 — et retenus seulement là où rien
 * d'autre n'existe.
 */
const TVTOKYO_BOOSTER_PACKSHOTS = new Set([10, 11]);

/** Sorties sans numéro de volume dont le visuel est détouré à la main. */
const CURATED_RELEASE_PACKSHOTS = new Set(["jp-release-09"]);

const KANJI_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 一 → 1, 十 → 10, 十七 → 17. La série s'arrête à 十七, rien au-delà. */
export function kanjiVolumeNumber(text: string): number | null {
  const match = /^巻ノ([一二三四五六七八九十]+)/.exec(text.trim());
  if (!match) return null;
  const digits = match[1]!;
  const tenAt = digits.indexOf("十");
  if (tenAt < 0) return KANJI_DIGITS[digits] ?? null;
  const before = digits.slice(0, tenAt);
  const after = digits.slice(tenAt + 1);
  const tens = before ? (KANJI_DIGITS[before] ?? 0) : 1;
  const ones = after ? (KANJI_DIGITS[after] ?? 0) : 0;
  return tens * 10 + ones;
}

/**
 * `70+P` → 70, `18 new` → 18, `12 new` → 12. `unconfirmed` et `18+` ne
 * chiffrent rien de sûr : ils rendent `null` plutôt qu'un chiffre inventé.
 */
export function declaredKinds(kinds: string | undefined): number | null {
  if (!kinds) return null;
  if (/unconfirmed/i.test(kinds)) return null;
  // `18+` dit « au moins 18 » : ce n'est pas un compte.
  const openEnded = /^(\d+)\s*\+\s*$/.exec(kinds.trim());
  if (openEnded) return null;
  const match = /^(\d+)/.exec(kinds.trim());
  return match ? Number(match[1]) : null;
}

export function slugify(name: string, index: number): string {
  const volume = kanjiVolumeNumber(name);
  if (volume != null) return `booster-vol${volume}-jp`;
  // Les libellés japonais ne donnent pas de slug latin : le rang de la sortie
  // dans la liste est stable et vérifiable, contrairement à une translittération.
  return `jp-release-${String(index + 1).padStart(2, "0")}`;
}

export function classifyJapaneseRelease(
  row: JapaneseReleaseRow,
): JapaneseSealedSpec["kind"] {
  const name = row.name ?? "";
  if (/スターターボックス/.test(name)) return "deck";
  if (kanjiVolumeNumber(name) != null) return "booster";
  if (/BOOSTER/i.test(name)) return "booster";
  return "coffret";
}

function categoryFor(kind: JapaneseSealedSpec["kind"]): string {
  if (kind === "booster") return "boosters";
  if (kind === "deck") return "decks";
  if (kind === "display") return "displays";
  return "collector-boxes";
}

export function japaneseSealedReleases(): JapaneseSealedSpec[] {
  const rows = (ledger.releases ?? []) as JapaneseReleaseRow[];
  return rows.map((row, index) => {
    const kind = classifyJapaneseRelease(row);
    const volume = kanjiVolumeNumber(row.name ?? "");
    const official =
      volume != null && OFFICIAL_BOOSTER_PACKSHOTS.has(volume)
        ? {
            stagingFile: `booster-vol${volume}-jp.jpg`,
            kind: "carddass-official" as const,
          }
        : null;
    const slug = slugify(row.name ?? "", index);
    const suruga =
      volume != null && SURUGA_BOOSTER_PACKSHOTS.has(volume)
        ? {
            stagingFile: `booster-vol${volume}-jp.webp`,
            kind: "suruga-kaitori" as const,
          }
        : SURUGA_RELEASE_PACKSHOTS.has(slug)
          ? { stagingFile: `${slug}.webp`, kind: "suruga-kaitori" as const }
          : null;
    const curated =
      volume != null && CURATED_BOOSTER_PACKSHOTS.has(volume)
        ? {
            stagingFile: `booster-vol${volume}-jp.png`,
            kind: "jp-boosters" as const,
          }
        : CURATED_RELEASE_PACKSHOTS.has(slug)
          ? { stagingFile: `${slug}.png`, kind: "jp-boosters" as const }
          : null;
    const tvtokyo =
      volume != null && TVTOKYO_BOOSTER_PACKSHOTS.has(volume)
        ? {
            stagingFile: `booster-vol${volume}-jp.jpg`,
            kind: "tv-tokyo" as const,
          }
        : null;
    const carddasJp =
      volume != null && CARDDAS_JP_BOOSTER_PACKSHOTS[volume]
        ? {
            stagingFile: CARDDAS_JP_BOOSTER_PACKSHOTS[volume]!,
            kind: "carddas-jp" as const,
          }
        : CARDDAS_JP_RELEASE_PACKSHOTS[slug]
          ? {
              stagingFile: CARDDAS_JP_RELEASE_PACKSHOTS[slug]!,
              kind: "carddas-jp" as const,
            }
          : null;
    // L'éditeur d'abord, puis le revendeur, le détourage, et la petite vignette.
    const packshot = official ?? suruga ?? curated ?? carddasJp ?? tvtokyo;
    return {
      slug,
      kind,
      category: categoryFor(kind),
      setCode: volume != null ? `maki${volume}` : null,
      name: row.name ?? "",
      lang: "JA" as const,
      released: row.released ?? null,
      declaredCardCount: null,
      setKinds: declaredKinds(row.kinds),
      attested: true as const,
      ...(packshot
        ? { stagingFile: packshot.stagingFile, stagingKind: packshot.kind }
        : {}),
    };
  });
}
