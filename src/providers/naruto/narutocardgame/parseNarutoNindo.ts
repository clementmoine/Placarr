/**
 * Parse HTML nindodb.com — listing `/…/cards` + fiches `dt`/`dd`.
 *
 * Identité alignée sur narutomarket (demo / promo / premium00 / preview)
 * pour fusionner titres + faces. SAMPLE-NN → gallery preview/gNN.
 */
import { canonicalNarutoCardgameCollector } from "./canonicalCollector";

export type NarutoNindoCard = {
  slug: string;
  name: string;
  code: string;
  setSlug: string;
  type: string;
  rarity: string;
  color: string;
  illustrator: string;
  firstShown: string;
  faceUrl: string;
  pagePath: string;
  stats: Record<string, string>;
};

export type NarutoNindoIdentity = {
  setCode: string;
  number: string;
  grouping?: string | null;
};

const ORIGIN = "https://nindodb.com";

export function absoluteNarutoNindoUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (!t) return ORIGIN;
  if (/^https?:\/\//i.test(t)) return t;
  return `${ORIGIN}${t.startsWith("/") ? t : `/${t}`}`;
}

export function narutoNindoListingUrl(locale = "fr"): string {
  const code = locale.trim().toLowerCase() || "fr";
  return `${ORIGIN}/${code}/cards`;
}

export function narutoNindoDetailUrl(slug: string, locale = "fr"): string {
  const code = locale.trim().toLowerCase() || "fr";
  const s = slug.trim().toLowerCase();
  return `${ORIGIN}/${code}/cards/${s}`;
}

export function parseNarutoNindoListingSlugs(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /href="\/(?:en|fr|it|es)\/cards\/([a-z0-9-]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = (m[1] ?? "").toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function stripTags(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDtDd(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = stripTags(m[1] ?? "");
    const value = stripTags(m[2] ?? "");
    if (key && value) out[key] = value;
  }
  return out;
}

const STAT_KEYS = new Set([
  "DMG",
  "POW",
  "HP",
  "LIFE",
  "Chakra",
  "CHAKRA",
]);

export function parseNarutoNindoDetail(
  html: string,
  slug: string,
  locale = "fr",
): NarutoNindoCard | null {
  const s = slug.trim().toLowerCase();
  if (!s) return null;

  const fields = parseDtDd(html);
  const h1 = html.match(/<h1\b[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim();
  const code = fields.Code || fields.Código || fields.Codice || "";
  const name =
    h1 ||
    html
      .match(/property="og:title"\s+content="([^"]+)"/i)?.[1]
      ?.replace(/\s*[·|].*$/, "")
      .trim() ||
    s;
  const faceUrl =
    html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1]?.trim() ||
    "";
  const setSlug =
    html.match(/href="\/(?:en|fr|it|es)\/sets\/([a-z0-9-]+)"/i)?.[1]?.toLowerCase() ||
    "";

  const stats: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (STAT_KEYS.has(k)) stats[k.toUpperCase()] = v;
  }

  return {
    slug: s,
    name,
    code: code || s.toUpperCase(),
    setSlug,
    type: fields.Type || fields.Tipo || "",
    rarity: fields["Rareté"] || fields.Rarity || fields.Rareza || fields.Rarità || "",
    color: fields.Couleur || fields.Color || fields.Colore || fields.Colour || "",
    illustrator:
      fields.Illustrateur ||
      fields.Illustrator ||
      fields.Ilustrador ||
      fields.Illustratore ||
      "",
    firstShown:
      fields["Montrée pour la première fois"] ||
      fields["First shown"] ||
      fields["Mostrada por primera vez"] ||
      fields["Mostrata per la prima volta"] ||
      "",
    faceUrl,
    pagePath: `/${(locale || "fr").trim().toLowerCase()}/cards/${s}`,
    stats,
  };
}

function normalizePrintedRef(raw: string): string | null {
  const m = raw.trim().toUpperCase().match(/^([A-Z]{1,3})-?(\d{1,4})$/);
  if (!m) return null;
  return canonicalNarutoCardgameCollector(
    `${m[1]!.toLowerCase()}${m[2]!.padStart(3, "0")}`,
  );
}

/**
 * `n-009` / `N-009` → demo/n009.
 * `sample-01` → preview/g01 (galerie Bandai card01…card12).
 * `c-001` + set pcc00 → premium00/c001.
 * `cp-001-con` → promo/cp001 gencon ; yankees / event idem.
 */
export function narutoNindoIdentity(
  card: Pick<NarutoNindoCard, "slug" | "code" | "setSlug">,
): NarutoNindoIdentity | null {
  const slug = card.slug.trim().toLowerCase();
  const setSlug = card.setSlug.trim().toLowerCase();
  const code = (card.code || slug).trim().toUpperCase();

  const sample = slug.match(/^sample-(\d{1,2})$/);
  if (sample || setSlug === "sample") {
    const n = sample?.[1] ?? code.match(/SAMPLE-?(\d{1,2})/i)?.[1];
    if (!n) return null;
    return {
      setCode: "preview",
      number: `g${n.padStart(2, "0")}`,
    };
  }

  if (slug === "cp-001-yankees" || /yankee/i.test(code)) {
    return { setCode: "promo", number: "cp001", grouping: "yankees" };
  }
  if (slug === "cp-001-con" || /cp-001-con/i.test(code)) {
    return { setCode: "promo", number: "cp001", grouping: "gencon" };
  }
  if (slug === "cp-001" || code === "CP-001") {
    return { setCode: "promo", number: "cp001", grouping: "event" };
  }

  const number = normalizePrintedRef(code.replace(/-CON$/i, "").replace(/-YANKEES$/i, ""));
  if (!number) return null;

  if (setSlug === "pcc00" || setSlug === "premium00") {
    return { setCode: "premium00", number, grouping: "premiumvol00" };
  }
  if (setSlug === "promo") {
    return { setCode: "promo", number, grouping: "event" };
  }

  return { setCode: "demo", number };
}
