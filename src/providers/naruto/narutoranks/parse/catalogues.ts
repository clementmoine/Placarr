/**
 * Naruto Ninja Ranks — pure catalogue / listing parsers.
 * Harvest & install live in sources/faces.ts.
 */

// ─── Coleka Ninja Ranks ──────────────────────────────────────────────────

/**
 * Scans Coleka de Naruto: Ninja Ranks (Panini/Inkworks, 2006).
 *
 * Coleka écrit `Ref. 001` pour la base, ou `Ref. FF01` / `NW09` / `GS03` pour
 * les inserts EU. Les visuels sont des photos de collectionneur (~1057×1500),
 * pas des rendus éditeur.
 *
 * **Deux signaux, jamais un.** La référence dit le tirage, et le nom de fichier
 * de la vignette le répète (`…-carte-n-7-007`, `…-carte-ff1-ff01`,
 * `…-holographique-nw05`). Une fiche dont le fichier ne porte pas sa ref est
 * écartée. Un gabarit « pas encore photographiée » (436×600, slug répété) est
 * refusé même si le numéro s'y relit.
 *
 * `GS1-3` = nos `bl1-3` (Group Seven EU) — attesté Panini Online / PaniniMania.
 */
export const COLEKA_NINJA_RANKS_ORIGIN = "https://www.coleka.com";
/** Branche EN : la FR déclenche le mur de vérification plus vite. */
export const COLEKA_NINJA_RANKS_LISTING_PATH =
  "/en/trading-cards/panini-cards/naruto-ninja-ranks_r25928";
/**
 * Langue du tirage photographié — `fr`.
 *
 * Coleka photographie l'édition **française** : la carte 68 s'y intitule
 * « Secon examen des survivants » là où Inkworks écrit « Second Exam
 * Survivors », et la 44 « Gaï » contre « Guy ».
 */
export const COLEKA_NINJA_RANKS_LANG = "fr";
/** Set de base sans préfixe imprimé. */
export const COLEKA_NINJA_RANKS_SET = "nr";
export const NINJA_RANKS_BASE_CARDS = 72;

export const COLEKA_NINJA_RANKS_SLUG = "naruto-ninja-ranks";

/** GS EU = box loaders BL du pack (Panini Online « Group Seven »). */
const COLEKA_INSERT_PREFIX: Readonly<Record<string, string>> = {
  ff: "ff",
  nw: "nw",
  sd: "sd",
  ns: "ns",
  gs: "bl",
};

export type ColekaParsedRef = {
  setCode: string;
  number: string;
  /** Ref. Coleka telle qu'imprimée — `7`, `FF01`, `GS03`. */
  printed: string;
};

export type ColekaNinjaRanksCard = ColekaParsedRef & {
  name: string;
  thumbUrl: string;
  faceUrl: string;
};

export type ColekaNinjaRanksParse = {
  cards: ColekaNinjaRanksCard[];
  rejected: { ref: string; name: string; reason: string }[];
};

const ITEM_RE =
  /<a\s([^>]*class="[^"]*lib_has_2_lines[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;

function decodeColekaEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCharCode(Number.parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le nom de fichier répète-t-il le slug de la collection ? Alors c'est un gabarit. */
export function thumbIsPlaceholder(thumbUrl: string): boolean {
  const stem = (thumbUrl.split("/").pop() ?? "").replace(/_\d+x\d+\.\w+$/, "");
  const parts = stem.split(COLEKA_NINJA_RANKS_SLUG);
  return parts.length > 2;
}

export function parseColekaPrintedRef(raw: string): ColekaParsedRef | null {
  const printed = raw.trim().toUpperCase();
  const base = /^(\d{1,4})$/.exec(printed);
  if (base) {
    const digits = Number.parseInt(base[1]!, 10);
    if (
      !Number.isFinite(digits) ||
      digits < 1 ||
      digits > NINJA_RANKS_BASE_CARDS
    ) {
      return null;
    }
    return {
      setCode: COLEKA_NINJA_RANKS_SET,
      number: String(digits).padStart(4, "0"),
      printed: String(digits),
    };
  }
  const insert = /^(FF|NW|SD|NS|GS)(\d{1,2})$/.exec(printed);
  if (!insert) return null;
  const prefix = insert[1]!.toLowerCase();
  const setCode = COLEKA_INSERT_PREFIX[prefix];
  if (!setCode) return null;
  const digits = Number.parseInt(insert[2]!, 10);
  if (!Number.isFinite(digits) || digits < 1) return null;
  return {
    setCode,
    number: String(digits).padStart(4, "0"),
    printed,
  };
}

/** Le nom de fichier répète-t-il le numéro nu de la base ? */
export function thumbCorroboratesRef(thumbUrl: string, ref: number): boolean {
  const stem = (thumbUrl.split("/").pop() ?? "").replace(/_\d+x\d+\.\w+$/, "");
  return new RegExp(`(^|[^0-9])0*${ref}([^0-9]|$)`, "i").test(stem);
}

/** Le nom de fichier répète-t-il la ref imprimée (`FF01`, `NW9`) ? */
export function thumbCorroboratesPrintedRef(
  thumbUrl: string,
  printed: string,
): boolean {
  const stem = (thumbUrl.split("/").pop() ?? "")
    .replace(/_\d+x\d+\.\w+$/, "")
    .toLowerCase();
  const token = printed.trim().toLowerCase();
  if (!token) return false;
  const parsed = parseColekaPrintedRef(printed);
  if (!parsed) return false;
  if (parsed.setCode === COLEKA_NINJA_RANKS_SET) {
    return thumbCorroboratesRef(thumbUrl, Number.parseInt(parsed.number, 10));
  }
  if (stem.includes(token)) return true;
  const compact = token.replace(/^([a-z]+)0+(\d+)$/, "$1$2");
  return compact !== token && stem.includes(compact);
}

export function colekaNinjaRanksFaceUrl(thumbUrl: string): string {
  return thumbUrl.replace(/_\d+x\d+(?=\.(?:webp|jpe?g|png|gif)(?:\?|$))/i, "");
}

export function colekaNinjaRanksWwwFaceUrl(faceUrl: string): string {
  const url = new URL(faceUrl);
  url.hostname = "www.coleka.com";
  return url.toString();
}

export function colekaNinjaRanksBackUrlCandidates(faceUrl: string): string[] {
  const url = new URL(faceUrl);
  url.hostname = "www.coleka.com";
  const m = url.pathname.match(/^(.*)(\.[a-z]+)$/i);
  if (!m) return [];
  const base = m[1]!;
  const ext = m[2]!;
  return ["-001", "-002"].map((suffix) => {
    const candidate = new URL(url);
    candidate.pathname = `${base}${suffix}${ext}`;
    return candidate.toString();
  });
}

export function colekaNinjaRanksBackUrl(faceUrl: string): string {
  return colekaNinjaRanksBackUrlCandidates(faceUrl)[0]!;
}

export function colekaNinjaRanksListingPageUrls(): string[] {
  const base = `${COLEKA_NINJA_RANKS_ORIGIN}${COLEKA_NINJA_RANKS_LISTING_PATH}`;
  return [base, `${base}?p=1`, `${base}?p=2`];
}

export function colekaNinjaRanksCardKey(card: {
  setCode: string;
  number: string;
}): string {
  return `${card.setCode.trim().toLowerCase()}-${card.number.trim()}`;
}

export function parseColekaNinjaRanksListing(
  html: string,
): ColekaNinjaRanksParse {
  const byKey = new Map<string, ColekaNinjaRanksCard>();
  const rejected: ColekaNinjaRanksParse["rejected"] = [];

  for (const match of html.matchAll(ITEM_RE)) {
    const attrs = match[1]!;
    const inner = match[2]!;
    const refMatch = inner.match(
      /<span class="ref">\s*Ref\.\s*([A-Za-z0-9]{1,4})\s*<\/span>/i,
    );
    if (!refMatch) continue;
    const printedRaw = refMatch[1]!.trim();
    const title = inner.match(/<h3 class="product-title">([^<]+)<\/h3>/i);
    const img = inner.match(
      /<img[^>]+src="(https:\/\/thumbs\.coleka\.com\/media\/item\/[^"]+)"/i,
    );
    if (!title || !img || !attrs.includes("href=")) continue;
    const name = decodeColekaEntities(title[1]!);
    const thumbUrl = img[1]!;
    const parsed = parseColekaPrintedRef(printedRaw);
    if (!parsed) {
      rejected.push({
        ref: printedRaw,
        name,
        reason:
          "référence hors checklist (base 1–72 ou inserts FF/NW/SD/NS/GS)",
      });
      continue;
    }
    if (thumbIsPlaceholder(thumbUrl)) {
      rejected.push({
        ref: parsed.printed,
        name,
        reason:
          "gabarit « pas encore photographiée » : le nom de fichier répète le slug de la collection",
      });
      continue;
    }
    if (!thumbCorroboratesPrintedRef(thumbUrl, parsed.printed)) {
      rejected.push({
        ref: parsed.printed,
        name,
        reason:
          "le nom de fichier ne porte pas la référence — un seul signal ne suffit pas",
      });
      continue;
    }

    const key = colekaNinjaRanksCardKey(parsed);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      ...parsed,
      name,
      thumbUrl,
      faceUrl: colekaNinjaRanksFaceUrl(thumbUrl),
    });
  }

  return {
    cards: [...byKey.values()].sort((a, b) => {
      const setCmp = a.setCode.localeCompare(b.setCode);
      if (setCmp !== 0) return setCmp;
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    }),
    rejected,
  };
}


// ─── Imadoki sheets ──────────────────────────────────────────────────────

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


// ─── Arcade Game Cards ───────────────────────────────────────────────────

/**
 * arcadegamecards.com — l'édition **américaine** de Ninja Ranks.
 *
 * Une boutique qui vend les cartes à l'unité, donc une photo par carte : les 72
 * de base sans un trou, plus neuf inserts, en 740×1036. Le tirage photographié
 * est bien l'américain — la carte 2 y porte « GROUP 7 », là où la française dit
 * « GROUPE 7 » et l'italienne « GRUPPO 7 ».
 *
 * **Trois signaux, et il les faut tous.** Le titre du produit donne la
 * référence (`Card 02`, `Card FF1`), le nom de fichier la redonne
 * (`…card02front.jpg`, `…ff1front.jpg`), et le nom de la carte doit tomber sur
 * celui de la checklist Inkworks. La boutique a justement deux fiches SD dont
 * les noms sont intervertis — « SD3 Kakashi » sur le fichier `sd3` et « SD3
 * Sasuke » sur le fichier `sd4`, quand la checklist dit sd3 = Sasuke et
 * sd4 = Kakashi. Aucune des deux ne passe, et c'est bien ainsi : les deux
 * cartes ont déjà leur face par ailleurs.
 */
export const ARCADE_ORIGIN = "https://www.arcadegamecards.com";
export const ARCADE_CATEGORY_PATH = "/product-category/naruto-2002-panini";
/** L'édition photographiée. */
export const ARCADE_LANG = "en";
export const ARCADE_SOURCE_ID = "arcadegamecards";
/** Trois pages de listing au 2026-08-22. */
export const ARCADE_PAGES = 3;

export type ArcadeCard = {
  setCode: string;
  /** Numéro à quatre chiffres, comme la clé de tirage. */
  number: string;
  /** Référence telle que la boutique l'écrit : `02`, `FF1`. */
  printed: string;
  name: string;
  imageUrl: string;
};

export type ArcadeParse = {
  cards: ArcadeCard[];
  rejected: { printed: string; name: string; reason: string }[];
};

const PRODUCT_RE = /<li[^>]*class="[^"]*\bproduct\b[^"]*"[\s\S]*?<\/li>/g;
const TITLE_RE = /woocommerce-loop-product__title[^>]*>([^<]+)</;
const IMAGE_RE = /(https:\/\/[^"'\s]*naruto2002panini[^"'\s]*?\.jpg)/i;
/** `Naruto 2002 Panini Card 02 Group 7 Naruto Sakura` → `02` + le reste. */
const REFERENCE_RE = /Card\s+([A-Za-z]{0,2}\d{1,3})\s+(.+)$/i;

function decodeArcadeEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `02` → `nr`/`0002` ; `FF1` → `ff`/`0001`. */
export function arcadeReferenceToCard(
  printed: string,
): { setCode: string; number: string } | null {
  const m = /^([A-Za-z]{0,2})(\d{1,3})$/.exec(printed.trim());
  if (!m) return null;
  const prefix = m[1]!.toLowerCase();
  const digits = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(digits) || digits < 1) return null;
  const setCode = prefix || "nr";
  return { setCode, number: String(digits).padStart(4, "0") };
}

function foldCardName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(raw: string): string[] {
  return foldCardName(raw).split(/\s+/).filter(Boolean);
}

/** Le nom de fichier redit-il la référence ? `…card02front` / `…ff1front`. */
export function fileEchoesReference(
  imageUrl: string,
  printed: string,
): boolean {
  const stem = (imageUrl.split("/").pop() ?? "").toLowerCase().split("?")[0]!;
  const ref = printed.trim().toLowerCase();
  const m = /^([a-z]{0,2})(\d{1,3})$/.exec(ref);
  if (!m) return false;
  const prefix = m[1]!;
  const digits = Number.parseInt(m[2]!, 10);
  if (prefix) {
    const token = `${prefix}${digits}`;
    return new RegExp(`naruto2002panini${token}(front|back)`).test(stem);
  }
  // Base : `card10`, `card010`, `card010front-e161` — zéros optionnels après `card`.
  return new RegExp(`naruto2002paninicard0*${digits}(front|back)`).test(stem);
}

/** Compare deux noms de carte en ignorant casse, accents et séparateurs. */
export function namesAgree(a: string, b: string): boolean {
  const left = foldCardName(a);
  const right = foldCardName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const aTokens = nameTokens(a);
  const bTokens = nameTokens(b);
  if (aTokens.length && aTokens.length === bTokens.length) {
    const bag = (tokens: string[]) => [...tokens].sort().join(" ");
    if (bag(aTokens) === bag(bTokens)) return true;
  }
  // « Group 7 puzzle » vs « Group 7 Naruto Sakura » : le vendeur suffixe des persos.
  if (bTokens.length >= 2 && left.startsWith(bTokens.slice(0, -1).join(" "))) {
    return true;
  }
  return false;
}

export type ArcadeNameCheck = (
  setCode: string,
  number: string,
  vendorName: string,
) => boolean;

/** Dérive le verso à partir du recto déjà validé : `…card72front.jpg` → `…card72back.jpg`. */
export function arcadeBackImageUrl(frontUrl: string): string {
  return frontUrl.replace(/front/i, "back");
}

export function arcadeListingUrls(): string[] {
  const base = `${ARCADE_ORIGIN}${ARCADE_CATEGORY_PATH}/`;
  return Array.from({ length: ARCADE_PAGES }, (_, i) =>
    i === 0 ? base : `${base}page/${i + 1}/`,
  );
}

export function parseArcadeListing(
  html: string,
  nameCheck: ArcadeNameCheck,
): ArcadeParse {
  const cards = new Map<string, ArcadeCard>();
  const rejected: ArcadeParse["rejected"] = [];

  for (const block of html.match(PRODUCT_RE) ?? []) {
    const title = block.match(TITLE_RE);
    const image = block.match(IMAGE_RE);
    if (!title || !image) continue;
    const full = decodeArcadeEntities(title[1]!);
    const ref = REFERENCE_RE.exec(full);
    if (!ref) continue;
    const printed = ref[1]!;
    const name = ref[2]!.trim();
    const card = arcadeReferenceToCard(printed);
    if (!card) {
      rejected.push({ printed, name, reason: "référence illisible" });
      continue;
    }
    if (!fileEchoesReference(image[1]!, printed)) {
      rejected.push({
        printed,
        name,
        reason: `le nom de fichier ne redit pas la référence (${image[1]!.split("/").pop()})`,
      });
      continue;
    }
    if (!nameCheck(card.setCode, card.number, name)) {
      rejected.push({
        printed,
        name,
        reason: "le nom vendeur ne concorde pas avec la checklist",
      });
      continue;
    }
    const key = `${card.setCode}-${card.number}`;
    if (!cards.has(key)) {
      cards.set(key, { ...card, printed, name, imageUrl: image[1]! });
    }
  }

  return {
    cards: [...cards.values()].sort((a, b) =>
      `${a.setCode}${a.number}`.localeCompare(`${b.setCode}${b.number}`),
    ),
    rejected,
  };
}

