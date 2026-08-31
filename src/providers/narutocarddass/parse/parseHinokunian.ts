/**
 * 火の国庵 — le relevé japonais des cartes NARUTO, page par sortie.
 *
 * Source de vérité : `curated/sources/hinokunian-jp.json` (53 pages).
 *
 * Ce que le site donne et que le catalogue japonais n'avait pas : le **nom
 * japonais** de chaque carte, sa rareté, et pour la ligne arcade la technique
 * imprimée. Corroboration mesurée : la page 巻ノ壱 rend 70 références, et
 * `cardcheckbox-jp.json` annonce « 70+P » pour cette sortie — deux relevés
 * indépendants d'accord au chiffre près.
 *
 * Ce qu'il ne donne pas : des scans. Les vignettes font 43×64.
 *
 * **La forme change d'une page à l'autre**, donc la lecture s'ancre sur la
 * référence et classe le reste par vocabulaire, jamais par numéro de colonne :
 *
 *   - volumes — trois colonnes, `忍-1 | うずまきナルト | R` ;
 *   - `cardbattle2-4` — six, `DN-002T | うずまきナルト | 忍術　連弾 | 新イラスト
 *     | 50円 | SR` ;
 *   - `cardbattle1` — rien en table : tout tient dans l'`alt` des vignettes,
 *     `DN-001T うずまきナルト -影分身の術-【ノーマル】`.
 *
 * Les pages sont en **SHIFT_JIS**. Les lire en UTF-8 ne rate pas bruyamment :
 * les références ASCII passent et les noms sortent en mojibake, ce qui donne un
 * relevé qui a l'air correct et ne l'est pas.
 */

/**
 * Référence imprimée, telle que la page l'écrit.
 *
 * `DT` et `CAN` sont venus du relevé lui-même, pas d'une liste devinée : la
 * quatrième vague arcade numérote `DT-002T` là où les trois premières écrivent
 * `DN-`, et le porte-cartes 木ノ葉絵巻 numérote `CAN-1`. Ce dernier corrobore
 * `cardcheckbox-jp.json`, qui annonçait déjà « CAN-1〜CAN-6 ».
 */
const REF_RE =
  /^(?:(?:PR[-－]?)?[忍術作依騎]|DN|DT|NM|CAN|N|J|M|C)[-－]?[0-9０-９]{1,4}[A-Za-zＴ]?$/;

/** Raretés relevées sur les 53 pages. Une case vide veut dire « normale ». */
const RARITY = new Set([
  "ノーマル",
  "N",
  "U",
  "R",
  "SR",
  "SSR",
  "激レア",
  "爆レア",
  "キラ",
]);

/** Mentions d'édition que le site pose à côté du nom. */
const EDITION_NOTE = /再録|新イラスト|新規|同柄/;

export type HinokunianCard = {
  /** Référence imprimée normalisée : `忍-1`, `DN-002T`. */
  printed: string;
  /** Personnage ou titre principal. */
  name: string | null;
  /** Technique / sous-titre, quand la page en donne un. */
  subtitle: string | null;
  rarity: string | null;
  /** `再録`, `新イラスト`… — l'état d'édition écrit par le site. */
  editionNote: string | null;
  /** Segments que le vocabulaire n'a pas placés, gardés tels quels. */
  extra: string[];
};

/** Le corps SHIFT_JIS que le site sert. */
export function decodeHinokunianHtml(bytes: Uint8Array): string {
  return new TextDecoder("shift_jis").decode(bytes);
}

/** `ＤＮ－００２Ｔ` → `DN-002T`. Le site mêle les deux chasses. */
export function toHalfWidth(value: string): string {
  return value
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[－ー−]/g, "-");
}

function cellText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[　\s]+/g, " ")
    .trim();
}

function place(card: HinokunianCard, cell: string): void {
  if (!cell || cell === "-") return;
  if (!card.rarity && RARITY.has(cell)) {
    card.rarity = cell;
    return;
  }
  if (!card.editionNote && EDITION_NOTE.test(cell)) {
    card.editionNote = cell;
    return;
  }
  // Les cotes du site ne sont pas une donnée de carte. Elles s'écrivent
  // `450円` en colonne, mais `2,000円(中古)` dans les encarts boutique.
  if (/^[0-9,]+円/.test(toHalfWidth(cell))) return;
  if (!card.name) {
    card.name = cell;
    return;
  }
  if (!card.subtitle) {
    card.subtitle = cell;
    return;
  }
  card.extra.push(cell);
}

/** Les lignes de table : `忍-1 | うずまきナルト | R`. */
export function parseHinokunianTable(html: string): HinokunianCard[] {
  const out: HinokunianCard[] = [];
  for (const row of html.matchAll(/<TR[^>]*>([\s\S]*?)<\/TR>/gi)) {
    const cells = [
      ...row[1]!.matchAll(/<T[DH][^>]*>([\s\S]*?)<\/T[DH]>/gi),
    ].map((m) => cellText(m[1]!));
    if (!cells.length) continue;
    const refAt = cells.findIndex((c) => REF_RE.test(toHalfWidth(c)));
    if (refAt < 0) continue;
    const card: HinokunianCard = {
      printed: toHalfWidth(cells[refAt]!),
      name: null,
      subtitle: null,
      rarity: null,
      editionNote: null,
      extra: [],
    };
    for (const [index, cell] of cells.entries()) {
      if (index === refAt) continue;
      place(card, cell);
    }
    out.push(card);
  }
  return out;
}

/**
 * La première vague arcade ne met rien en table : chaque carte est une
 * vignette dont l'`alt` porte tout.
 *
 *   `DN-001T うずまきナルト -影分身の術-【ノーマル】`
 */
export function parseHinokunianAlts(html: string): HinokunianCard[] {
  const out: HinokunianCard[] = [];
  for (const match of html.matchAll(/alt="([^"]{4,120})"/gi)) {
    const text = cellText(match[1]!);
    /*
      Les vignettes des encarts boutique portent la sortie d'origine entre
      crochets pleine chasse : `術-131 千鳥［巻ノ八/ウルトラレア］` sur la page
      du 巻ノ七. Les prendre pour des cartes de la page en cours attribuerait
      un tirage à la mauvaise sortie.
    */
    if (/［[^］]*巻[ノの][^］]*］/.test(text)) continue;
    const head = /^(\S+)\s+(.*)$/.exec(text);
    if (!head || !REF_RE.test(toHalfWidth(head[1]!))) continue;
    let rest = head[2]!;
    const rarity = /【([^】]+)】\s*$/.exec(rest);
    if (rarity) rest = rest.slice(0, rarity.index).trim();
    const subtitle = /[-－]([^-－]+)[-－]\s*$/.exec(rest);
    if (subtitle) rest = rest.slice(0, subtitle.index).trim();
    out.push({
      printed: toHalfWidth(head[1]!),
      name: rest || null,
      subtitle: subtitle?.[1]?.trim() ?? null,
      rarity: rarity?.[1]?.trim() ?? null,
      editionNote: null,
      extra: [],
    });
  }
  return out;
}

/**
 * Une page, quelle que soit sa forme. La table gagne quand elle donne quelque
 * chose : elle porte plus de colonnes que l'`alt` d'une vignette.
 */
export function parseHinokunianPage(html: string): HinokunianCard[] {
  const table = parseHinokunianTable(html);
  const rows = table.length ? table : parseHinokunianAlts(html);
  const seen = new Set<string>();
  return rows.filter((card) => {
    if (seen.has(card.printed)) return false;
    seen.add(card.printed);
    return true;
  });
}

export function hinokunianPageUrl(path: string): string {
  return `https://hinokunian.konohashigure.com/${path.replace(/^\/+/, "")}`;
}
