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

function decodeEntities(raw: string): string {
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

/** Le nom de fichier redit-il la référence ? `…card02front` / `…ff1front`. */
export function fileEchoesReference(
  imageUrl: string,
  printed: string,
): boolean {
  const stem = (imageUrl.split("/").pop() ?? "").toLowerCase();
  const ref = printed.trim().toLowerCase();
  const m = /^([a-z]{0,2})(\d{1,3})$/.exec(ref);
  if (!m) return false;
  const prefix = m[1]!;
  const digits = Number.parseInt(m[2]!, 10);
  const token = prefix
    ? `${prefix}${digits}`
    : `card${String(digits).padStart(2, "0")}`;
  return new RegExp(`naruto2002panini${token}(front|back)`).test(stem);
}

/** Compare deux noms de carte en ignorant casse, accents et séparateurs. */
export function namesAgree(a: string, b: string): boolean {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const left = fold(a);
  const right = fold(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // « Guy Kakashi » contre « Guy - Kakashi » : mêmes mots, même ordre.
  return left.split(" ").join(" ") === right.split(" ").join(" ");
}

export function arcadeListingUrls(): string[] {
  const base = `${ARCADE_ORIGIN}${ARCADE_CATEGORY_PATH}/`;
  return Array.from({ length: ARCADE_PAGES }, (_, i) =>
    i === 0 ? base : `${base}page/${i + 1}/`,
  );
}

export function parseArcadeListing(
  html: string,
  checklistName: (setCode: string, number: string) => string | null,
): ArcadeParse {
  const cards = new Map<string, ArcadeCard>();
  const rejected: ArcadeParse["rejected"] = [];

  for (const block of html.match(PRODUCT_RE) ?? []) {
    const title = block.match(TITLE_RE);
    const image = block.match(IMAGE_RE);
    if (!title || !image) continue;
    const full = decodeEntities(title[1]!);
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
    const expected = checklistName(card.setCode, card.number);
    if (!expected || !namesAgree(name, expected)) {
      rejected.push({
        printed,
        name,
        reason: expected
          ? `la checklist nomme « ${expected} » cette référence`
          : "référence absente de la checklist",
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
