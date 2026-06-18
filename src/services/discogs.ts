import axios from "axios";

/**
 * Discogs — base musicale de référence (vinyles/CD), recherche par code-barres.
 * Nécessite un token API gratuit (Settings → Developers sur discogs.com) fourni
 * via DISCOGS_TOKEN. Sans token, la source est simplement inactive (pas d'appel,
 * pas d'erreur) — l'app continue avec les autres sources.
 *
 * Les titres Discogs sont déjà au format "Artiste - Album". Pas de couverture
 * ici (hôtes d'images non whitelistés par next/image) : la pochette vient de
 * Deezer ; Discogs sert de source canonique pour le nom + le consensus.
 */

const DISCOGS_BASE = "https://api.discogs.com";
const USER_AGENT = "Placarr/1.0 +https://github.com/clementmoine/Placarr";

export interface DiscogsResult {
  title: string;
  year: string | null;
  imageUrl: string | null;
}

let warnedMissingToken = false;

export async function fetchFromDiscogs(
  barcode: string,
): Promise<DiscogsResult | null> {
  const clean = (barcode || "").replace(/[^\d]/g, "").trim();
  if (!clean) return null;

  const token = process.env.DISCOGS_TOKEN;
  if (!token) {
    if (!warnedMissingToken) {
      warnedMissingToken = true;
      console.warn("[Discogs] DISCOGS_TOKEN manquant — source désactivée.");
    }
    return null;
  }

  try {
    const res = await axios.get(`${DISCOGS_BASE}/database/search`, {
      params: { barcode: clean, token, per_page: 5 },
      headers: { "User-Agent": USER_AGENT },
      timeout: 8000,
    });

    const results = res.data?.results;
    if (!Array.isArray(results) || results.length === 0) return null;

    const best = results.find((r) => r?.title) ?? null;
    if (!best?.title) return null;

    return {
      title: String(best.title).trim(),
      year: best.year ? String(best.year) : null,
      imageUrl: null,
    };
  } catch {
    return null;
  }
}
