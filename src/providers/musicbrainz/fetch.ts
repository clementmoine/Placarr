import { httpGet, type JsonObject } from "@/lib/http/httpClient";

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
  /** Bare release title without artist prefix (official MB title). */
  releaseTitle: string | null;
  artist: string | null;
  releaseDate: string | null;
  imageUrl: string | null;
  mbid: string;
  score?: number | null;
  country?: string | null;
  status?: string | null;
  packaging?: string | null;
  label?: string | null;
  tracksCount?: number | null;
  format?: string | null;
  textLanguage?: string | null;
  textScript?: string | null;
  releaseType?: string | null;
  secondaryTypes?: string[];
  releaseGroupId?: string | null;
  tags?: string[];
  mediaSummaries?: string[];
  labels?: string[];
  /** Official MB aliases (release + release-group when fetched). */
  aliases?: string[];
}

/** Construit un nom canonique "Artiste - Titre" sans dupliquer l'artiste. */
export function formatMusicTitle(artist: string | null, title: string): string {
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

function aliasNamesFromMbPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const aliases = (payload as { aliases?: unknown }).aliases;
  if (!Array.isArray(aliases)) return [];
  return aliases
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const name = (entry as { name?: unknown }).name;
      return typeof name === "string" ? name.trim() : "";
    })
    .filter(Boolean);
}

async function fetchMusicBrainzReleaseAliases(mbid: string): Promise<string[]> {
  try {
    const res = await httpGet(`${MB_BASE}/release/${mbid}`, {
      params: { inc: "aliases", fmt: "json" },
      headers: { "User-Agent": USER_AGENT },
      timeout: 8000,
    });
    return aliasNamesFromMbPayload(res.data);
  } catch {
    return [];
  }
}

export async function fetchFromMusicBrainz(
  barcode: string,
): Promise<MusicBrainzResult | null> {
  const clean = (barcode || "").replace(/[^\d]/g, "").trim();
  if (!clean) return null;

  try {
    const res = await httpGet<JsonObject>(`${MB_BASE}/release/`, {
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
    const labelInfo = Array.isArray(best["label-info"])
      ? best["label-info"]
      : [];
    const firstLabel =
      typeof labelInfo[0]?.label?.name === "string"
        ? labelInfo[0].label.name
        : null;
    const labels = labelInfo
      .map((entry: { label?: { name?: unknown } }) =>
        typeof entry?.label?.name === "string" ? entry.label.name : "",
      )
      .filter(Boolean);
    const mediaEntries = Array.isArray(best.media) ? best.media : [];
    const firstMedia = mediaEntries[0] || null;
    const mediaSummaries = mediaEntries
      .map((entry: { format?: unknown; "track-count"?: unknown }) => {
        if (!entry || typeof entry !== "object") return "";
        const format = typeof entry.format === "string" ? entry.format : "";
        const discTracks =
          typeof entry["track-count"] === "number"
            ? entry["track-count"]
            : null;
        const parts = [
          format,
          discTracks != null
            ? `${discTracks} piste${discTracks > 1 ? "s" : ""}`
            : "",
        ].filter(Boolean);
        return parts.join(" — ");
      })
      .filter(Boolean);
    const tags = Array.isArray(best.tags)
      ? best.tags
          .map((tag: { name?: unknown }) =>
            typeof tag?.name === "string" ? tag.name : "",
          )
          .filter(Boolean)
      : [];
    const textRepresentation = best["text-representation"] || {};
    const releaseGroup = best["release-group"] || {};
    const tracksCount =
      typeof best["track-count"] === "number"
        ? best["track-count"]
        : typeof firstMedia?.["track-count"] === "number"
          ? firstMedia["track-count"]
          : null;

    const releaseTitle =
      typeof best.title === "string" ? best.title.trim() : "";
    const aliases = await fetchMusicBrainzReleaseAliases(best.id);

    return {
      title: formatMusicTitle(artist, releaseTitle),
      releaseTitle: releaseTitle || null,
      artist,
      releaseDate: best.date || null,
      imageUrl: null,
      mbid: best.id,
      score: typeof best.score === "number" ? best.score : null,
      country: best.country || null,
      status: best.status || null,
      packaging: best.packaging || null,
      label: typeof firstLabel === "string" ? firstLabel : null,
      tracksCount,
      format: typeof firstMedia?.format === "string" ? firstMedia.format : null,
      textLanguage:
        typeof textRepresentation.language === "string"
          ? textRepresentation.language
          : null,
      textScript:
        typeof textRepresentation.script === "string"
          ? textRepresentation.script
          : null,
      releaseType:
        typeof releaseGroup["primary-type"] === "string"
          ? releaseGroup["primary-type"]
          : null,
      secondaryTypes: Array.isArray(releaseGroup["secondary-types"])
        ? releaseGroup["secondary-types"].filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : [],
      releaseGroupId:
        typeof releaseGroup.id === "string" ? releaseGroup.id : null,
      tags: tags.length > 0 ? tags : undefined,
      mediaSummaries: mediaSummaries.length > 0 ? mediaSummaries : undefined,
      labels: labels.length > 0 ? labels : undefined,
      aliases: aliases.length > 0 ? aliases : undefined,
    };
  } catch {
    return null;
  }
}
