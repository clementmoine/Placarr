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

function decodeEntities(raw: string): string {
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
    if (!Number.isFinite(digits) || digits < 1 || digits > NINJA_RANKS_BASE_CARDS) {
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
    const name = decodeEntities(title[1]!);
    const thumbUrl = img[1]!;
    const parsed = parseColekaPrintedRef(printedRaw);
    if (!parsed) {
      rejected.push({
        ref: printedRaw,
        name,
        reason: "référence hors checklist (base 1–72 ou inserts FF/NW/SD/NS/GS)",
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
