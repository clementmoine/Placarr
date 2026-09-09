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
import ledger from "../curated/sources/cardcheckbox-jp.json";
import {
  kanjiVolumeNumber,
  slugify,
  type JapaneseReleaseRow,
} from "./japaneseSealedReleases";

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
  const rows = (ledger.releases ?? []) as JapaneseReleaseRow[];
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
