/**
 * Naruto Carddass sealed product sources — DE releases, JP releases, JP volume bands.
 */

import type { SealedKind } from "@/providers/shared/sealedProducts/kinds";
import jpVolumesLedger from "../curated/sources/cardcheckbox-jp.json";
import ledger from "../curated/sources/comicplanet-de.json";

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
   * Visuel d'emballage primaire (éditeur > Suruga > détourage > carddas >
   * TV Tokyo) — pour le stagingKind du spec. Les dumps parallèles vivent dans
   * `packshots` ; productChoice décide l'affichage.
   */
  stagingFile?: string;
  /** Le dossier de staging d'où sort `stagingFile`. */
  stagingKind?: JapanesePackshotKind;
  /** Tous les dumps attestés — jamais un seul gagnant « parce que mieux ». */
  packshots?: readonly JapanesePackshot[];
};

export type JapanesePackshotKind =
  | "carddass-official"
  | "carddas-jp"
  | "suruga-kaitori"
  | "jp-boosters"
  | "tv-tokyo";

export type JapanesePackshot = {
  stagingFile: string;
  kind: JapanesePackshotKind;
};

/**
 * Volumes dont Bandai publie encore le visuel de la ブースターパック.
 * Relevé sur `sec.carddass.com` le 2026-08-20 — voir
 * `curated/sources/carddass-official-products.json`.
 *
 * Le 巻ノ四 en est **sorti** : sa fiche illustre le produit par six cartes
 * étalées, sans le moindre emballage. Le site de jeu en montre le sachet, et
 * un sachet de 75×144 vaut mieux qu'une planche de cartes en 560×560 sur un
 * SKU de type booster. L'officiel reste hors `packshots` pour ce volume —
 * mauvaise image produit, pas « déjà mieux ailleurs ».
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
 * Visuels petits — de 75×143 à 100×201 — tous archivés ; productChoice préfère
 * souvent Bandai / Suruga / détourage quand ils existent.
 */
const CARDDAS_JP_BOOSTER_PACKSHOTS: Record<number, string> = {
  2: "image/product/2nd.jpg",
  3: "image/product/3nd.jpg",
  4: "image/product/4nd.gif",
  5: "image/product/5nd.gif",
  6: "image/product/6.gif",
  7: "image/product/7th.jpg",
  8: "image/product/8th.jpg",
  9: "image/product/9th.gif",
  10: "image/product/10th.gif",
  11: "image/product/11th_pac.gif",
  13: "image/product/13th_pac.gif",
  14: "image/product/14th_pac.gif",
  15: "image/product/15/pac.gif",
  16: "image/product/16/pac.gif",
  17: "image/product/17/17th_pac_l.jpg",
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
 * Volumes dont la vignette TV Tokyo (グッズねっと) est attestée sous
 * `staging/tv-tokyo/booster-volN-jp.jpg`. Toujours moissonnée ; le choix
 * d'affichage peut préférer Bandai / Suruga / carddas — on ne jette plus la source.
 */
const TVTOKYO_BOOSTER_PACKSHOTS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
]);

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

function collectPackshots(input: {
  volume: number | null;
  slug: string;
}): JapanesePackshot[] {
  const { volume, slug } = input;
  const out: JapanesePackshot[] = [];
  const push = (shot: JapanesePackshot | null) => {
    if (shot) out.push(shot);
  };

  push(
    volume != null && OFFICIAL_BOOSTER_PACKSHOTS.has(volume)
      ? {
          stagingFile: `booster-vol${volume}-jp.jpg`,
          kind: "carddass-official",
        }
      : null,
  );
  push(
    volume != null && SURUGA_BOOSTER_PACKSHOTS.has(volume)
      ? {
          stagingFile: `booster-vol${volume}-jp.webp`,
          kind: "suruga-kaitori",
        }
      : SURUGA_RELEASE_PACKSHOTS.has(slug)
        ? { stagingFile: `${slug}.webp`, kind: "suruga-kaitori" }
        : null,
  );
  push(
    volume != null && CURATED_BOOSTER_PACKSHOTS.has(volume)
      ? {
          stagingFile: `booster-vol${volume}-jp.png`,
          kind: "jp-boosters",
        }
      : CURATED_RELEASE_PACKSHOTS.has(slug)
        ? { stagingFile: `${slug}.png`, kind: "jp-boosters" }
        : null,
  );
  push(
    volume != null && CARDDAS_JP_BOOSTER_PACKSHOTS[volume]
      ? {
          stagingFile: CARDDAS_JP_BOOSTER_PACKSHOTS[volume]!,
          kind: "carddas-jp",
        }
      : CARDDAS_JP_RELEASE_PACKSHOTS[slug]
        ? {
            stagingFile: CARDDAS_JP_RELEASE_PACKSHOTS[slug]!,
            kind: "carddas-jp",
          }
        : null,
  );
  push(
    volume != null && TVTOKYO_BOOSTER_PACKSHOTS.has(volume)
      ? {
          stagingFile: `booster-vol${volume}-jp.jpg`,
          kind: "tv-tokyo",
        }
      : null,
  );
  return out;
}

export function japaneseSealedReleases(): JapaneseSealedSpec[] {
  const rows = (jpVolumesLedger.releases ?? []) as JapaneseReleaseRow[];
  return rows.map((row, index) => {
    const kind = classifyJapaneseRelease(row);
    const volume = kanjiVolumeNumber(row.name ?? "");
    const slug = slugify(row.name ?? "", index);
    const packshots = collectPackshots({ volume, slug });
    // L'éditeur d'abord, puis le revendeur, le détourage, carddas, TV Tokyo.
    const packshot = packshots[0];
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
      packshots,
      ...(packshot
        ? { stagingFile: packshot.stagingFile, stagingKind: packshot.kind }
        : {}),
    };
  });
}

/**
 * Ranger une carte japonaise dans un **set japonais**, d'après son numéro.
 *
 * Le champ `set_code` d'un tirage porte le découpage **européen** : ce qu'un
 * collectionneur français ou italien a acheté en boutique. Or une série
 * européenne empaquette deux à trois volumes japonais — mesuré le 2026-08-20 :
 *
 * | Série | Volumes japonais |
 * | ----- | ---------------- |
 * | `s1`  | 巻ノ一 + 二 + 三 |
 * | `s2`  | 巻ノ四 + 五 + スターターボックス |
 * | `s3`  | 巻ノ六 + 七 + 拡張シート |
 * | `s4`  | 巻ノ八 + 九 |
 * | `s5`  | 巻ノ十 + 十一 |
 * | `s6`  | 巻ノ十二 + 十三 |
 *
 * Conséquence : **21 volumes japonais sur 25 étaient éclatés** sur plusieurs
 * sets, le 巻ノ十三 se retrouvant coupé entre `maki13`, `s6` et `unknown`. Un
 * seul champ portait deux vérités.
 *
 * Ce module ne touche pas à `set_code` — le catalogue européen en dépend. Il
 * dérive **en plus** le set japonais, et il le dérive du numéro imprimé, qui
 * fait autorité : la numérotation japonaise est continue sur toute la ligne et
 * chaque sortie a ouvert une plage connue (`cardcheckbox-jp.json`).
 *
 * **Ce que ce module dit et ne dit pas.** Il donne la sortie qui a *frappé* le
 * numéro, pas le produit dans lequel tel exemplaire est sorti. Le registre est
 * explicite : « Numbering is listed for NEW cards only; reprints in starter
 * boxes carry earlier numbers. » Un 忍-28 vendu dans un produit 巻ノ十 est une
 * réimpression — les deux faits sont vrais, ils ne répondent pas à la même
 * question. Confronté aux 336 fiches nikita, qui donnent le produit : 321
 * d'accord, 15 en désaccord, tous des réimpressions.
 */

/** Les cinq familles numérotées : 忍 / 術 / 作 / 依 / 騎. */
export const JAPANESE_NUMBERED_FAMILIES = [
  "ni",
  "te",
  "ta",
  "cl",
  "ki",
] as const;

export type JapaneseFamily = (typeof JAPANESE_NUMBERED_FAMILIES)[number];

export type JapaneseVolume = {
  /** `maki10` pour un 巻ノ, le slug de la sortie sinon (`jp-release-07`). */
  setCode: string;
  /** Le libellé japonais complet, tel que le registre l'écrit. */
  releaseName: string;
  /** Numéro de volume quand la sortie en est un, sinon `null`. */
  volume: number | null;
};

/**
 * Sorties qui **réimpriment** des numéros déjà frappés ailleurs.
 *
 * Le registre les signale : 忍兵法札絵巻 弐 publie 忍-230〜233 et d'autres,
 * « inside ranges 巻ノ十 already announced — reprint numbering, not a second
 * minting ». Les laisser dans la table ferait chevaucher deux plages et rendrait
 * la frappe ambiguë sur quatre numéros. Elles restent des sorties bien réelles :
 * on les écarte de la *frappe*, pas du catalogue.
 */
const REPRINT_RELEASES = new Set(["忍兵法札絵巻 弐"]);

type Band = {
  family: JapaneseFamily;
  from: number;
  to: number;
  volume: JapaneseVolume;
};

function buildBands(): Band[] {
  const rows = (jpVolumesLedger.releases ?? []) as JapaneseReleaseRow[];
  const bands: Band[] = [];
  rows.forEach((row, index) => {
    const name = row.name ?? "";
    if (REPRINT_RELEASES.has(name)) return;
    const volume = kanjiVolumeNumber(name);
    const setCode = volume != null ? `maki${volume}` : slugify(name, index);
    for (const family of JAPANESE_NUMBERED_FAMILIES) {
      const span = row[family];
      if (!span) continue;
      const [from, to] = span;
      bands.push({
        family,
        from,
        to,
        volume: { setCode, releaseName: name, volume },
      });
    }
  });
  return bands;
}

let bandsCache: Band[] | null = null;

function bands(): Band[] {
  bandsCache ??= buildBands();
  return bandsCache;
}

/** `ni0041` → `{ family: "ni", number: 41 }`. Rien d'autre n'est numéroté. */
export function parseJapaneseNumber(
  raw: string,
): { family: JapaneseFamily; number: number } | null {
  const match = /^([a-z]+)(\d+)$/.exec(raw.trim().toLowerCase());
  if (!match) return null;
  const family = match[1] as JapaneseFamily;
  if (!JAPANESE_NUMBERED_FAMILIES.includes(family)) return null;
  return { family, number: Number(match[2]) };
}

/**
 * Numéros que **deux sorties revendiquent** — le registre se contredit.
 *
 * 巻ノ十 annonce « 80+P » et ses plages font 81 cartes ; 巻ノ十一 annonce
 * « 57+P » et fait exactement 57. Chacun est cohérent seul, mais ensemble ils
 * réclament 56 numéros 忍 pour les 50 places de 205 à 254 : **忍-234 à 239 sont
 * comptés deux fois**. Rien dans la source ne dit lequel a frappé.
 *
 * Ces numéros ne sont donc pas attribués. Six cartes sans volume valent mieux
 * que six cartes rangées dans le mauvais.
 */
function contested(): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const band of overlappingJapaneseBands()) {
    let set = out.get(band.family);
    if (!set) {
      set = new Set<number>();
      out.set(band.family, set);
    }
    for (let n = band.from; n <= band.to; n += 1) set.add(n);
  }
  return out;
}

let contestedCache: Map<string, Set<number>> | null = null;

/** Les numéros qu'aucune sortie ne peut réclamer seule, par famille. */
export function contestedJapaneseNumbers(): Map<string, Set<number>> {
  contestedCache ??= contested();
  return contestedCache;
}

/**
 * La sortie qui a frappé ce numéro, ou `null`.
 *
 * `null` est une réponse, et elle couvre deux cas distincts : le numéro sort
 * des plages du registre (promo, famille non numérotée, trou du relevé), ou
 * bien deux sorties se le disputent. Dans les deux cas, inventer une sortie
 * serait pire que ne rien dire.
 */
export function japaneseVolumeForNumber(
  family: string,
  number: number,
): JapaneseVolume | null {
  if (contestedJapaneseNumbers().get(family)?.has(number)) return null;
  for (const band of bands()) {
    if (band.family !== family) continue;
    if (number >= band.from && number <= band.to) return band.volume;
  }
  return null;
}

/** Même chose depuis le numéro tel qu'il est stocké : `ni0041`. */
export function japaneseVolumeForPrintNumber(
  raw: string,
): JapaneseVolume | null {
  const parsed = parseJapaneseNumber(raw);
  return parsed ? japaneseVolumeForNumber(parsed.family, parsed.number) : null;
}

/**
 * Les plages qui se chevauchent encore, une fois les réimpressions écartées.
 *
 * Sert de garde : si une future édition du relevé en réintroduit, la dérivation
 * devient ambiguë et il vaut mieux le voir en test que de laisser la première
 * plage l'emporter en silence.
 */
export function overlappingJapaneseBands(): {
  family: JapaneseFamily;
  from: number;
  to: number;
  releases: string[];
}[] {
  const out: {
    family: JapaneseFamily;
    from: number;
    to: number;
    releases: string[];
  }[] = [];
  const all = bands();
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i]!;
      const b = all[j]!;
      if (a.family !== b.family) continue;
      const from = Math.max(a.from, b.from);
      const to = Math.min(a.to, b.to);
      if (from > to) continue;
      out.push({
        family: a.family,
        from,
        to,
        releases: [a.volume.releaseName, b.volume.releaseName],
      });
    }
  }
  return out;
}

/**
 * Les sorties japonaises, dans l'ordre où elles sont parues.
 *
 * Le catalogue range ses tirages selon la découpe **européenne** — `s1`…`s28` —
 * parce que c'est ce que donnent les sources qui le nourrissent. La découpe
 * japonaise ne s'y superpose pas : le 巻ノ十 recoupe les séries 4 et 5, et
 * 766 tirages sur 935 portent à la fois un titre japonais et un titre français.
 *
 * On ne peut donc pas l'écrire dans `set_code` — il n'y a qu'une colonne, et
 * l'y forcer sortirait ces cartes de leur série européenne. Elle se **calcule**
 * à la lecture, ce qui ne coûte rien : elle est entièrement déterminée par la
 * famille et le numéro imprimé.
 */
export function listJapaneseReleases(): {
  setCode: string;
  releaseName: string;
  volume: number | null;
}[] {
  const seen = new Map<
    string,
    { releaseName: string; volume: number | null }
  >();
  for (const band of bands()) {
    if (!seen.has(band.volume.setCode)) {
      seen.set(band.volume.setCode, {
        releaseName: band.volume.releaseName,
        volume: band.volume.volume,
      });
    }
  }
  return [...seen].map(([setCode, rest]) => ({ setCode, ...rest }));
}

/**
 * Les plages de numéros d'une sortie, par famille.
 *
 * C'est ce qui permet de borner une requête SQL sur la découpe japonaise sans
 * rien stocker : `maki10` devient « famille忍 entre 205 et 239, ou 術 entre 192
 * et 211, ou … ». Rendre les bornes plutôt qu'un prédicat garde le SQL chez
 * l'appelant, qui seul connaît ses colonnes.
 */
export function japaneseReleaseBands(
  setCode: string,
): { family: JapaneseFamily; from: number; to: number }[] {
  const wanted = setCode.trim().toLowerCase();
  return bands()
    .filter((band) => band.volume.setCode.toLowerCase() === wanted)
    .map((band) => ({ family: band.family, from: band.from, to: band.to }));
}
