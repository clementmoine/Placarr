/**
 * Planches de la galerie Imadoki — l'édition **italienne** de Ninja Ranks.
 *
 * `imadokicollection.it` publie la collection en planches de neuf cartes,
 * grille régulière et gouttières blanches franches. Une planche n'est pas une
 * face : il faut la découper, et le découpage se **détecte** plutôt qu'il ne se
 * code en dur — on cherche les colonnes et les lignes quasi blanches sur toute
 * leur longueur, et on exige que le compte de cases tombe sur ce que le
 * manifeste annonce. Une planche qui ne tombe pas juste est refusée : mieux
 * vaut pas de face qu'une carte coupée de travers.
 *
 * Le site n'a pas de `robots.txt` — rien n'y est interdit.
 *
 * **Ce que la galerie couvre, et ce que notre pack modélise, ne coïncident
 * pas tout à fait.** Elle publie l'édition européenne : 72 de base, FF6, NW9,
 * **NS6**, SD6 et **GS3**. L'édition américaine Inkworks a BL3 et PN4 à la
 * place de NS6 et GS3. Deux correspondances mesurées :
 *
 * - `GS1-3` **sont** nos `bl1-3` — mêmes Naruto, Sakura et Sasuke à pastille
 *   « 7 », et `bl-0001` d'Inkworks est au pixel la même carte que GS1.
 * - `NS1-6` n'existe pas sur la feuille Inkworks US : on les modélise quand
 *   même comme tirages EU-only (`european-ns-checklist.json`), avec faces IT
 *   sur la planche `naruto_premiumtc_ns01-06.JPG`.
 */
export const IMADOKI_ORIGIN = "https://www.imadokicollection.it";
export const IMADOKI_GALLERY_PATH =
  "/WebImadoki_04_Card_Gallery/world_gallery/gallery_naruto_premiumtc.html";
const IMAGE_DIR = "/WebImadoki_04_Card_Gallery/image_world";
/** L'édition photographiée. */
export const IMADOKI_LANG = "it";
export const IMADOKI_SOURCE_ID = "imadoki";

/** Une case de la grille : une carte du pack, ou un emplacement vide. */
export type ImadokiSlot = { setCode: string; number: string } | null;

export type ImadokiSheet = {
  file: string;
  columns: number;
  rows: number;
  /** Les cases en ordre de lecture, ligne par ligne. */
  slots: readonly ImadokiSlot[];
  /**
   * `gutter` (défaut) — gouttières blanches détectées sur la planche.
   * `equal` — découpe régulière sans gouttières (foils paysage NS).
   */
  gridMode?: "gutter" | "equal";
};

function run(setCode: string, from: number, to: number): ImadokiSlot[] {
  const out: ImadokiSlot[] = [];
  for (let n = from; n <= to; n += 1) {
    out.push({ setCode, number: String(n).padStart(4, "0") });
  }
  return out;
}

export const IMADOKI_SHEETS: readonly ImadokiSheet[] = [
  ...[1, 10, 19, 28, 37, 46, 55, 64].map((first) => ({
    file: `naruto_premiumtc_${String(first).padStart(2, "0")}-${String(first + 8).padStart(2, "0")}.JPG`,
    columns: 3,
    rows: 3,
    slots: run("nr", first, first + 8),
  })),
  {
    file: "naruto_premiumtc_ff01-06.JPG",
    columns: 3,
    rows: 2,
    slots: run("ff", 1, 6),
  },
  {
    file: "naruto_premiumtc_nw01-09.JPG",
    columns: 3,
    rows: 3,
    slots: run("nw", 1, 9),
  },
  {
    /*
      Foils paysage — pas de gouttières blanches lisibles ; grille 2×3 mesurée
      sur le scan (~691×750).

      Grille 2×3, lecture gauche→droite puis haut→bas. Les noms sur la planche
      ne suivent pas NS1…NS6 :
      slot 0 Asuma → `ns-0004`, 1 Kakashi → `ns-0001`, 2 Iruka → `ns-0005`,
      3 Kurenai → `ns-0002`, 4 Ebisu → `ns-0006`, 5 vide — `ns-0003` *Guy*
      manque à la galerie Imadoki.
    */
    file: "naruto_premiumtc_ns01-06.JPG",
    columns: 2,
    rows: 3,
    gridMode: "equal",
    slots: [
      { setCode: "ns", number: "0004" },
      { setCode: "ns", number: "0001" },
      { setCode: "ns", number: "0005" },
      { setCode: "ns", number: "0002" },
      { setCode: "ns", number: "0006" },
      null,
    ],
  },
  {
    /*
      Mapping relevé sur la planche, pas déduit : « QUARTO HOKAGE » est notre
      `sd-0005` *Fourth Hokage*, « SHIKAMARU » notre `sd-0006`. La quatrième
      case est vide — `sd-0004` *Kakashi* manque à la galerie, et c'est
      justement la seule que le rip de blog nous avait donnée. Les trois
      dernières sont GS1-3, c'est-à-dire nos box loaders.
    */
    file: "naruto_premiumtc_sd01-06_gs01-03.JPG",
    columns: 3,
    rows: 3,
    slots: [...run("sd", 1, 3), null, ...run("sd", 5, 6), ...run("bl", 1, 3)],
  },
];

/** Planches vues et volontairement non moissonnées, avec leur raison. */
export const IMADOKI_SHEETS_SKIPPED: readonly {
  file: string;
  reason: string;
}[] = [
  {
    file: "naruto_premiumtc_pack.JPG",
    reason: "Photo du sachet, pas une carte — les packshots ont leur registre.",
  },
];

export function imadokiSheetUrl(file: string): string {
  return `${IMADOKI_ORIGIN}${IMAGE_DIR}/${file}`;
}

export function imadokiGalleryUrl(): string {
  return `${IMADOKI_ORIGIN}${IMADOKI_GALLERY_PATH}`;
}

/** Bandes contiguës où le prédicat tient, d'au moins `min` pixels. */
export function contiguousBands(
  flags: readonly boolean[],
  min = 3,
): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  flags.forEach((on, i) => {
    if (on && start === null) start = i;
    else if (!on && start !== null) {
      if (i - start >= min) out.push([start, i]);
      start = null;
    }
  });
  if (start !== null && flags.length - start >= min) {
    out.push([start, flags.length]);
  }
  return out;
}

/**
 * Coupe un axe en `expected` segments à partir des gouttières intérieures.
 *
 * Rend `null` si le compte ne tombe pas : une planche dont la grille ne se lit
 * pas ne doit pas être découpée au jugé.
 */
export function splitAxis(
  whiteRatio: readonly number[],
  expected: number,
  opts: { threshold?: number; minBand?: number } = {},
): [number, number][] | null {
  const threshold = opts.threshold ?? 0.9;
  const size = whiteRatio.length;
  const edge = Math.max(4, Math.round(size * 0.01));
  const gutters = contiguousBands(
    whiteRatio.map((v) => v > threshold),
    opts.minBand ?? 3,
  ).filter(([from, to]) => from > edge && to < size - edge);
  if (gutters.length > expected - 1) return null;
  const cuts: [number, number][] = [];
  let cursor = 0;
  for (const [from, to] of gutters) {
    cuts.push([cursor, from]);
    cursor = to;
  }
  cuts.push([cursor, size]);

  /*
    Une rangée entièrement vide ne laisse pas de gouttière : le blanc de la
    gouttière et celui de la rangée se confondent, et il en manque une au
    compte. Comme une planche-contact a un pas régulier par construction, on
    l'extrapole depuis les cases déjà lues plutôt que d'abandonner la planche —
    c'est ce qui récupère `19-27`, dont la troisième rangée est vide.
  */
  while (cuts.length < expected) {
    const first = cuts[0]!;
    const cell = first[1] - first[0];
    const pitch =
      cuts.length > 1
        ? cuts[1]![0] - cuts[0]![0]
        : cell + (gutters[0] ? gutters[0][1] - gutters[0][0] : 0);
    const start = cuts[cuts.length - 1]![0] + pitch;
    if (pitch <= 0 || start + cell > size + cell * 0.2) return null;
    cuts[cuts.length - 1] = [
      cuts[cuts.length - 1]![0],
      cuts[cuts.length - 1]![0] + cell,
    ];
    cuts.push([start, Math.min(size, start + cell)]);
  }
  return cuts.every(([a, b]) => b - a > size / (expected * 4)) ? cuts : null;
}
