/**
 * Pure URL-shape helpers used before downloading a remote cover: recover the
 * full-resolution "original" of a resized retailer image and strip CDN transform
 * query args. Split out of `storage.ts`; no I/O, no state — just `URL` parsing.
 */

/**
 * Variante "originale" (pleine résolution, vrai ratio) d'une URL d'image
 * redimensionnée par PrestaShop/Philibert. Ces plateformes encodent la taille
 * via un segment `{id}-{taille}_default/` qui padde l'image en carré et la
 * sous-échantillonne ; le chemin nu `{id}/` sert le fichier d'origine. Renvoie
 * null quand l'URL ne suit pas ce motif (on ne touche donc que ces sources).
 */
export function retailerOriginalImageUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /^\/(\d+)-[a-z0-9_]*_default\/([^/?#]+)$/i,
    );
    if (!match) return null;
    parsed.pathname = `/${match[1]}/${match[2]}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

const IMAGE_TRANSFORM_QUERY_PARAMS = new Set([
  "auto",
  "compress",
  "compression",
  "crop",
  "dpr",
  "fit",
  "fm",
  "format",
  "h",
  "height",
  "im",
  "imheight",
  "imwidth",
  "ixid",
  "ixlib",
  "mode",
  "pithumbsize",
  "q",
  "quality",
  "resize",
  "rs",
  "sharp",
  "thumb",
  "thumbnail",
  "thumbsize",
  "tr",
  "transform",
  "w",
  "width",
]);

function isImageTransformParam(param: string): boolean {
  const normalized = param.toLowerCase();
  return (
    IMAGE_TRANSFORM_QUERY_PARAMS.has(normalized) ||
    normalized.startsWith("crop") ||
    normalized.startsWith("resize")
  );
}

function imageUrlWithoutTransformArgs(url: string): string | null {
  try {
    const parsed = new URL(url);
    let changed = false;

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (!isImageTransformParam(key)) continue;
      parsed.searchParams.delete(key);
      changed = true;
    }

    if (
      !changed &&
      (parsed.hostname.includes("cdn.pji.nu") ||
        parsed.hostname.includes("prisjakt.nu")) &&
      /\.(jpe?g|png|webp|gif|svg)$/i.test(parsed.pathname)
    ) {
      parsed.search = "";
      changed = true;
    }

    if (!changed) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function providerOriginalImageUrl(url: string): string | null {
  const retailerOriginal = retailerOriginalImageUrl(url);
  const baseUrl = retailerOriginal || url;
  const cleanUrl = imageUrlWithoutTransformArgs(baseUrl) || baseUrl;
  return cleanUrl !== url ? cleanUrl : null;
}
