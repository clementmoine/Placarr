const BOOKNODE_CDN_PREFIX = "https://cdn1.booknode.com/book_cover/";

function booknodeSlugVariants(slug: string): string[] {
  const variants = [slug];
  const hyphenSlug = slug.replace(/_/g, "-");
  if (hyphenSlug !== slug) variants.push(hyphenSlug);
  const underscoreSlug = slug.replace(/-/g, "_");
  if (underscoreSlug !== slug && !variants.includes(underscoreSlug)) {
    variants.push(underscoreSlug);
  }
  return variants;
}

function booknodeFullJpegCandidates(
  seriesId: string,
  slug: string,
  mediaId: string,
): string[] {
  const candidates: string[] = [];
  for (const variant of booknodeSlugVariants(slug)) {
    const value = `${BOOKNODE_CDN_PREFIX}${seriesId}/full/${variant}-${mediaId}.jpg`;
    if (!candidates.includes(value)) candidates.push(value);
  }
  return candidates;
}

function booknodeMod11WebpCandidates(
  seriesId: string,
  slug: string,
  mediaId: string,
): string[] {
  const candidates: string[] = [];
  const sizes = ["264-432", "132-216", "66-108"];
  for (const variant of booknodeSlugVariants(slug)) {
    for (const size of sizes) {
      const value = `${BOOKNODE_CDN_PREFIX}${seriesId}/mod11/${variant}-${mediaId}-${size}.webp`;
      if (!candidates.includes(value)) candidates.push(value);
    }
  }
  return candidates;
}

function booknodeCoverPartsFromUrl(
  url: string,
): { seriesId: string; slug: string; mediaId: string } | null {
  const fullJpeg = url.match(/\/book_cover\/(\d+)\/full\/(.+)-(\d+)\.jpe?g$/i);
  if (fullJpeg) {
    const [, seriesId, slug, mediaId] = fullJpeg;
    return { seriesId, slug, mediaId };
  }

  const mod11 = url.match(
    /\/book_cover\/(\d+)\/mod11\/(.+)-(\d+)-\d+-\d+\.webp$/i,
  );
  if (mod11) {
    const [, seriesId, slug, mediaId] = mod11;
    return { seriesId, slug, mediaId };
  }

  const thumb = url.match(/\/book_cover\/(\d+)\/(.+)-(\d+)-\d+-\d+\.webp$/i);
  if (thumb && !url.includes("/mod11/")) {
    const [, seriesId, slug, mediaId] = thumb;
    return { seriesId, slug, mediaId };
  }

  return null;
}

function addBooknodeCoverVariants(
  add: (value?: string | null) => void,
  seriesId: string,
  slug: string,
  mediaId: string,
) {
  for (const full of booknodeFullJpegCandidates(seriesId, slug, mediaId)) {
    add(full);
  }
  for (const mod11 of booknodeMod11WebpCandidates(seriesId, slug, mediaId)) {
    add(mod11);
  }
}

function booknodeCandidateScore(value: string): number {
  const path = value.split("/book_cover/")[1] || value;
  const tier = value.includes("/full/")
    ? 0
    : value.includes("/mod11/")
      ? 1
      : 2;
  const sizeScore = /264-432/.test(value)
    ? 0
    : /132-216/.test(value)
      ? 1
      : /66-108/.test(value)
        ? 2
        : /\.jpe?g$/i.test(value)
          ? 0
          : 1;
  return tier + sizeScore + (path.includes("_") ? 1 : 0);
}

function sortBooknodeCandidates(candidates: string[]): string[] {
  return [...candidates].sort(
    (a, b) => booknodeCandidateScore(a) - booknodeCandidateScore(b),
  );
}

/**
 * Booknode sert souvent une vignette .webp hotlink-protégée alors que le JPEG
 * plein format sous /full/ est téléchargeable côté serveur avec Referer.
 * Quand /full/ renvoie 403, les variantes /mod11/ restent accessibles.
 */
export function booknodeCoverDownloadCandidates(url: string): string[] {
  if (!url.includes("cdn1.booknode.com/book_cover/")) return [url];

  const candidates: string[] = [];
  const add = (value?: string | null) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  add(url);

  const parts = booknodeCoverPartsFromUrl(url);
  if (parts) {
    addBooknodeCoverVariants(add, parts.seriesId, parts.slug, parts.mediaId);
    return sortBooknodeCandidates(candidates);
  }

  const loose = url.match(/\/book_cover\/(\d+)\/([^/]+)\.(webp|jpe?g)$/i);
  if (loose && !url.includes("/full/") && !url.includes("/mod11/")) {
    const [, seriesId, basename] = loose;
    const base = basename.replace(/\.(webp|jpe?g)$/i, "");
    const mediaMatch = base.match(/^(.+)-(\d+)$/);
    if (mediaMatch) {
      const [, slug, mediaId] = mediaMatch;
      addBooknodeCoverVariants(add, seriesId, slug, mediaId);
    } else {
      add(`${BOOKNODE_CDN_PREFIX}${seriesId}/full/${base}.jpg`);
    }
  }

  return sortBooknodeCandidates(candidates);
}

export function normalizeBooknodeCoverUrl(
  url?: string | null,
): string | undefined {
  if (!url) return undefined;
  const candidates = booknodeCoverDownloadCandidates(url);
  return (
    candidates.find(
      (candidate) =>
        candidate.includes("/full/") && /\.jpe?g$/i.test(candidate),
    ) || url
  );
}
