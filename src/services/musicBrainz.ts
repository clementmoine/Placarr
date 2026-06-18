import axios from "axios";

/**
 * MusicBrainz — base de données musicale ouverte et faisant autorité.
 * Lookup par code-barres (EAN/UPC d'une édition). Gratuit, sans clé d'API,
 * mais un User-Agent identifiable est obligatoire (sinon 403).
 *
 * Sert de source CANONIQUE pour le nom des albums (évite de retomber sur des
 * titres d'annonces eBay). Pas de couverture ici (Cover Art Archive redirige
 * vers des hôtes non whitelistés par next/image) : la pochette vient d'ailleurs
 * (Deezer), MusicBrainz fournit le nom de référence.
 */

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Placarr/1.0 (https://github.com/clementmoine/Placarr)";

export interface MusicBrainzResult {
  title: string;
  artist: string | null;
  releaseDate: string | null;
  imageUrl: string | null;
  mbid: string;
}

/** Construit un nom canonique "Artiste - Titre" sans dupliquer l'artiste. */
export function formatMusicTitle(
  artist: string | null,
  title: string,
): string {
  const t = (title || "").trim();
  const a = (artist || "").trim();
  if (!a || !t) return t;
  if (t.toLowerCase().includes(a.toLowerCase())) return t;
  return `${a} - ${t}`;
}

/** Extrait l'artiste depuis l'artist-credit MusicBrainz. */
export function artistFromCredit(artistCredit: unknown): string | null {
  if (!Array.isArray(artistCredit)) return null;
  const names = artistCredit
    .map((ac) =>
      ac && typeof ac === "object" && "name" in ac
        ? String((ac as { name?: unknown }).name ?? "")
        : "",
    )
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

export async function fetchFromMusicBrainz(
  barcode: string,
): Promise<MusicBrainzResult | null> {
  const clean = (barcode || "").replace(/[^\d]/g, "").trim();
  if (!clean) return null;

  try {
    const res = await axios.get(`${MB_BASE}/release/`, {
      params: { query: `barcode:${clean}`, fmt: "json", limit: 5 },
      headers: { "User-Agent": USER_AGENT },
      timeout: 8000,
    });

    const releases = res.data?.releases;
    if (!Array.isArray(releases) || releases.length === 0) return null;

    const best = releases
      .slice()
      .sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0];
    if (!best?.title) return null;

    const artist = artistFromCredit(best["artist-credit"]);
    return {
      title: formatMusicTitle(artist, best.title),
      artist,
      releaseDate: best.date || null,
      imageUrl: null,
      mbid: best.id,
    };
  } catch {
    return null;
  }
}
