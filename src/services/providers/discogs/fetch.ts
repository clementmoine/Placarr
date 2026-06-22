import axios from "axios";

/**
 * Discogs — base musicale de référence (vinyles/CD), recherche par code-barres.
 * Nécessite un token API gratuit (Settings → Developers sur discogs.com) fourni
 * via DISCOGS_TOKEN. Sans token, la source est simplement inactive (pas d'appel,
 * pas d'erreur) — l'app continue avec les autres sources.
 *
 * Les titres Discogs sont déjà au format "Artiste - Album". Les pochettes et
 * scans (recto, verso, livret…) viennent du détail release (`images`).
 */

const DISCOGS_BASE = "https://api.discogs.com";
const USER_AGENT = "Placarr/1.0 +https://github.com/clementmoine/Placarr";

export type DiscogsImage = {
  url: string;
  kind: "primary" | "secondary";
  width?: number;
  height?: number;
};

export interface DiscogsResult {
  id: number;
  title: string;
  year: string | null;
  imageUrl: string | null;
  images?: DiscogsImage[];
  country?: string | null;
  label?: string | null;
  format?: string | null;
  formats?: string[];
  formatQuantity?: number | null;
  communityHave?: number | null;
  communityWant?: number | null;
  genres?: string[];
  styles?: string[];
}

let warnedMissingAuth = false;

/**
 * Auth Discogs : un token personnel (`DISCOGS_TOKEN`) OU un couple consumer
 * key/secret (`DISCOGS_CONSUMER_KEY` + `DISCOGS_CONSUMER_SECRET`). Les deux
 * passent en query params et suffisent aux endpoints database (pas besoin du
 * flow OAuth complet). Sans aucun, la source est inactive.
 */
export function getDiscogsAuthParams(): Record<string, string> | null {
  const token = process.env.DISCOGS_TOKEN?.trim();
  if (token) return { token };

  const key = process.env.DISCOGS_CONSUMER_KEY?.trim();
  const secret = process.env.DISCOGS_CONSUMER_SECRET?.trim();
  if (key && secret) return { key, secret };

  return null;
}

export async function fetchFromDiscogs(
  barcode: string,
): Promise<DiscogsResult | null> {
  const clean = (barcode || "").replace(/[^\d]/g, "").trim();
  if (!clean) return null;

  const auth = getDiscogsAuthParams();
  if (!auth) {
    if (!warnedMissingAuth) {
      warnedMissingAuth = true;
      console.warn(
        "[Discogs] Auth manquante (DISCOGS_TOKEN ou DISCOGS_CONSUMER_KEY/SECRET) — source désactivée.",
      );
    }
    return null;
  }

  try {
    const res = await axios.get(`${DISCOGS_BASE}/database/search`, {
      params: { barcode: clean, per_page: 5, ...auth },
      headers: { "User-Agent": USER_AGENT },
      timeout: 8000,
    });

    const results = res.data?.results;
    if (!Array.isArray(results) || results.length === 0) return null;

    const best = results.find((r) => r?.title) ?? null;
    if (!best?.title) return null;

    let formats: string[] | undefined;
    let formatQuantity: number | null = null;
    let communityHave: number | null = null;
    let communityWant: number | null = null;
    let imageUrl: string | null =
      typeof best.cover_image === "string" && best.cover_image.trim()
        ? best.cover_image.trim()
        : null;
    let images: DiscogsImage[] | undefined;

    if (typeof best.id === "number" && Number.isFinite(best.id)) {
      try {
        const releaseRes = await axios.get(
          `${DISCOGS_BASE}/releases/${best.id}`,
          {
            params: auth,
            headers: { "User-Agent": USER_AGENT },
            timeout: 8000,
          },
        );
        const release = releaseRes.data;
        if (Array.isArray(release?.images)) {
          const parsedImages = release.images
            .map(
              (entry: {
                type?: unknown;
                uri?: unknown;
                width?: unknown;
                height?: unknown;
              }) => {
                const url =
                  typeof entry?.uri === "string" ? entry.uri.trim() : "";
                if (!url) return null;
                return {
                  url,
                  kind:
                    entry?.type === "primary"
                      ? ("primary" as const)
                      : ("secondary" as const),
                  width:
                    typeof entry?.width === "number" ? entry.width : undefined,
                  height:
                    typeof entry?.height === "number"
                      ? entry.height
                      : undefined,
                };
              },
            )
            .filter(Boolean) as DiscogsImage[];
          if (parsedImages.length > 0) {
            images = parsedImages;
            imageUrl =
              parsedImages.find((image) => image.kind === "primary")?.url ||
              parsedImages[0]?.url ||
              imageUrl;
          }
        }
        if (Array.isArray(release?.formats)) {
          formats = release.formats
            .map((entry: { name?: unknown; descriptions?: unknown[] }) => {
              const name =
                typeof entry?.name === "string" ? entry.name.trim() : "";
              const descriptions = Array.isArray(entry?.descriptions)
                ? entry.descriptions
                    .filter(
                      (value: unknown): value is string =>
                        typeof value === "string",
                    )
                    .join(", ")
                : "";
              return [name, descriptions].filter(Boolean).join(" — ");
            })
            .filter(Boolean);
          formatQuantity = release.formats.reduce(
            (total: number, entry: { qty?: unknown }) =>
              total + (typeof entry?.qty === "number" ? entry.qty : 1),
            0,
          );
        }
        if (release?.community && typeof release.community === "object") {
          communityHave =
            typeof release.community.have === "number"
              ? release.community.have
              : null;
          communityWant =
            typeof release.community.want === "number"
              ? release.community.want
              : null;
        }
      } catch {
        // Search hit is still useful without release detail.
      }
    }

    if (!imageUrl && typeof best.thumb === "string" && best.thumb.trim()) {
      imageUrl = best.thumb.trim();
    }

    return {
      id: best.id,
      title: String(best.title).trim(),
      year: best.year ? String(best.year) : null,
      imageUrl,
      images,
      country: typeof best.country === "string" ? best.country : null,
      label:
        Array.isArray(best.label) && typeof best.label[0] === "string"
          ? best.label[0]
          : null,
      format:
        Array.isArray(best.format) && typeof best.format[0] === "string"
          ? best.format[0]
          : formats?.[0] || null,
      formats,
      formatQuantity,
      communityHave,
      communityWant,
      genres: Array.isArray(best.genre)
        ? best.genre.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : [],
      styles: Array.isArray(best.style)
        ? best.style.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : [],
    };
  } catch {
    return null;
  }
}
