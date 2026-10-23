/**
 * TCGdex CDN face URLs — quality + extension vary by card (some lack
 * `low.webp` but have `low.png`; others only have `high.*`).
 *
 * Prefer webp → png → jpg, then the other quality. Callers emit the first
 * candidate; UI advances on `onError` without bloating the checklist payload.
 */

export const TCGDEX_IMAGE_EXTS = ["webp", "png", "jpg"] as const;
export type TcgdexImageExt = (typeof TCGDEX_IMAGE_EXTS)[number];
export type TcgdexImageQuality = "high" | "low";

const QUALITY_RE = /\/(high|low)\.(webp|png|jpe?g)$/i;

export function tcgdexImageBaseFromUrl(
  url: string | null | undefined,
): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  const stripped = raw.replace(QUALITY_RE, "");
  return stripped === raw ? raw.replace(/\/+$/, "") : stripped;
}

/**
 * Ordered candidates for a CDN base (`…/base/base3/1`).
 * Preferred quality first (webp→png→jpg), then the other quality.
 */
export function tcgdexImageCandidates(
  imageBase: string | null | undefined,
  preferred: TcgdexImageQuality = "high",
): string[] {
  const base = imageBase?.trim().replace(/\/+$/, "");
  if (!base) return [];
  const qualities: TcgdexImageQuality[] =
    preferred === "low" ? ["low", "high"] : ["high", "low"];
  const urls: string[] = [];
  for (const quality of qualities) {
    for (const ext of TCGDEX_IMAGE_EXTS) {
      urls.push(`${base}/${quality}.${ext}`);
    }
  }
  return urls;
}

/** First candidate — stable default for API / metadata payloads. */
export function tcgdexImageUrl(
  imageBase: string | null | undefined,
  quality: TcgdexImageQuality = "high",
  extension?: TcgdexImageExt,
): string | null {
  if (extension) {
    const base = imageBase?.trim().replace(/\/+$/, "");
    if (!base) return null;
    return `${base}/${quality}.${extension}`;
  }
  return tcgdexImageCandidates(imageBase, quality)[0] ?? null;
}

/**
 * Display chain from any stored URL (absolute CDN or already-qualified).
 * Non-TCGdex / unparseable → `[url]` only.
 *
 * After format/quality for the URL's locale, try **EN** (PokéCardex / Live
 * disk stay preferred upstream). Covers sets where FR CDN 404s (old DP) while
 * EN exists — and sets where FR works (`ex5-53`).
 */
export function tcgdexDisplayCandidates(
  url: string | null | undefined,
): string[] {
  const raw = url?.trim();
  if (!raw) return [];
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return [raw];
  }
  if (host !== "assets.tcgdex.net") return [raw];

  const match = QUALITY_RE.exec(raw);
  const preferred: TcgdexImageQuality =
    match?.[1]?.toLowerCase() === "low" ? "low" : "high";
  const base = tcgdexImageBaseFromUrl(raw);
  if (!base) return [raw];

  const bases = [base];
  const asEn = base.replace(
    /^(https?:\/\/assets\.tcgdex\.net\/)(?!en\/)[a-z]{2}(?:-[a-z]+)?(\/)/i,
    "$1en$2",
  );
  if (asEn !== base) bases.push(asEn);

  const chain: string[] = [];
  for (const candidateBase of bases) {
    for (const candidate of tcgdexImageCandidates(candidateBase, preferred)) {
      if (!chain.includes(candidate)) chain.push(candidate);
    }
  }
  if (chain.length === 0) return [raw];
  const rest = chain.filter((candidate) => candidate !== raw);
  return chain.includes(raw) ? [raw, ...rest] : chain;
}

/** Next URL after a failed load, or null when the chain is exhausted. */
export function nextTcgdexDisplayUrl(
  failedUrl: string,
  chain: readonly string[],
): string | null {
  const idx = chain.indexOf(failedUrl);
  if (idx < 0) return chain[0] ?? null;
  return chain[idx + 1] ?? null;
}
