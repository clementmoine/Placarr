/**
 * Parse naruto-card.jp photo-archive HTML into printed refs + image URLs.
 *
 * Pages list cards as headings (`NM-003`, `忍伝-043`, `忍-368`) with nearby
 * `<img src="…">`. Vercel may challenge plain curl — Sync uses FlareSolverr.
 */

export type NarutocardjpFaceHit = {
  printedRef: string;
  /** Normalized Latin family when known (`nm`, `shi`, `ni`…). */
  family: string | null;
  number: string | null;
  imageUrl: string;
  title?: string;
};

const ARCHIVE_PATHS = {
  carddassJa: "/photo-archive/muin",
  shippuden: "/photo-archive/shippuden-cardgame",
  dataNm: "/series/dcd-ultimate-mission",
  dataNf: "/series/dcd-ultimate-formation",
  dataNx: "/photo-archive", // NX mixed in global archive; filter NX-
} as const;

export const NARUTOCARDJP_ORIGIN = "https://naruto-card.jp";

export function narutocardjpArchiveUrl(
  key: keyof typeof ARCHIVE_PATHS,
  page = 1,
): string {
  const path = ARCHIVE_PATHS[key];
  if (page <= 1) return `${NARUTOCARDJP_ORIGIN}${path}`;
  return `${NARUTOCARDJP_ORIGIN}${path}?page=${page}`;
}

/** Latin word boundary OR CJK prefix — `\b` alone misses 忍伝. */
const REF_RE =
  /(?:^|[^\w])((?:PR)?(?:忍伝|術伝|作伝|忍|術|作|依|騎)|(?:NM|NF|NX|NFP|NFC|NC|DN|DT|NXP|NXPF))-?\s*([学]?\d{1,4})(?!\d)/u;

/** Extract absolute image URL from an img tag attribute blob. */
export function narutocardjpAbsImageUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.startsWith("data:")) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("//")) return `https:${text}`;
  if (text.startsWith("/")) return `${NARUTOCARDJP_ORIGIN}${text}`;
  return null;
}

/**
 * Family + padded number from a printed ref (`NM-003` → nm/003,
 * `忍伝-043` → shi/043, `忍-368` → ni/368).
 */
export function parseNarutocardjpPrintedRef(raw: string): {
  printedRef: string;
  family: string | null;
  number: string | null;
} | null {
  const text = raw.replace(/\s+/g, "").trim();
  const m = text.match(REF_RE);
  if (!m) return null;
  const prefix = m[1]!;
  const numRaw = m[2]!;
  const printedRef = `${prefix}-${numRaw}`;
  const isGaku = numRaw.startsWith("学");
  const family = (() => {
    if (isGaku || prefix === "PR学") return "gaku";
    if (prefix === "忍伝" || prefix === "PR忍伝") return "shi";
    if (prefix === "術伝") return "mju";
    if (prefix === "作伝" || prefix === "PR作伝") return "msa";
    if (prefix === "忍") return "ni";
    if (prefix === "術") return "te";
    if (prefix === "作") return "ta";
    if (prefix === "依") return "cl";
    if (prefix === "騎") return "ki";
    return prefix.toLowerCase();
  })();
  const digits = numRaw.replace(/^学/, "");
  const pad = family === "gaku" ? 3 : 3;
  const number = digits ? digits.padStart(pad, "0") : null;
  return { printedRef, family, number };
}

/**
 * Walk HTML: prefer `<img alt="… 作-245のカード写真">` (gallery tiles), then
 * heading/card blocks with a nearby src / data-src / srcset.
 */
export function parseNarutocardjpArchiveHtml(html: string): NarutocardjpFaceHit[] {
  const hits: NarutocardjpFaceHit[] = [];
  const seen = new Set<string>();

  const push = (
    parsed: NonNullable<ReturnType<typeof parseNarutocardjpPrintedRef>>,
    imageUrl: string,
    title?: string,
  ) => {
    if (
      !/\.(jpe?g|png|webp)(\?|$)/i.test(imageUrl) &&
      !/cdn|upload|photo|image|media\/cards/i.test(imageUrl)
    ) {
      if (!/naruto-card|cloudinary|imgix|vercel|supabase/i.test(imageUrl)) {
        return;
      }
    }
    const key = `${parsed.printedRef}\0${imageUrl}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({
      printedRef: parsed.printedRef,
      family: parsed.family,
      number: parsed.number,
      imageUrl,
      ...(title ? { title } : {}),
    });
  };

  // Gallery tiles: alt carries "Name 作-245のカード写真".
  const imgTagRe = /<img\b([^>]*)>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgTagRe.exec(html))) {
    const attrs = imgMatch[1] ?? "";
    const alt = attrs.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
    if (!alt) continue;
    const parsed = parseNarutocardjpPrintedRef(alt);
    if (!parsed) continue;
    const src =
      attrs.match(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)?.[1] ??
      attrs.match(/\bsrcset=["']([^"' ]+)/i)?.[1];
    const imageUrl = src ? narutocardjpAbsImageUrl(src) : null;
    if (!imageUrl) continue;
    push(parsed, imageUrl, alt.trim() || undefined);
  }

  // Fallback: headings / labels with a following image in the same chunk.
  const chunks = html.split(/<(?:h[1-6]|figcaption|strong|span)[^>]*>/i);
  for (const chunk of chunks) {
    const refMatch = chunk.match(REF_RE);
    if (!refMatch) continue;
    const parsed = parseNarutocardjpPrintedRef(refMatch[0]!);
    if (!parsed) continue;

    const img =
      chunk.match(
        /<(?:img|source)[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i,
      ) ??
      chunk.match(/srcset=["']([^"' ]+)/i);
    const imageUrl = img ? narutocardjpAbsImageUrl(img[1]!) : null;
    if (!imageUrl) continue;
    push(parsed, imageUrl);
  }

  return hits;
}

export { ARCHIVE_PATHS as NARUTOCARDJP_ARCHIVE_PATHS };
