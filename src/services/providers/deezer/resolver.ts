import axios from "axios";
import levenshtein from "fast-levenshtein";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import type { MetadataResult } from "@/types/metadataProvider";

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function buildDeezerFacts(album: any) {
  const facts = [];
  if (album?.link) {
    facts.push({
      kind: "external-link",
      label: "Deezer",
      value: "Voir l'album",
      url: String(album.link),
      source: "deezer",
      confidence: 0.7,
      priority: 41,
    });
  }

  const genres = (album?.genres?.data || [])
    .map((genre: any) => String(genre?.name || "").trim())
    .filter(Boolean);
  if (genres.length > 0) {
    facts.push({
      kind: "genre",
      label: "Genres",
      value: genres.slice(0, 3).join(" • "),
      source: "deezer",
      confidence: 0.68,
      priority: 40,
    });
  }

  if (typeof album?.fans === "number" && album.fans > 0) {
    facts.push({
      kind: "popularity",
      label: "Fans Deezer",
      value: new Intl.NumberFormat("fr-FR").format(album.fans),
      source: "deezer",
      confidence: 0.62,
      priority: 35,
    });
  }

  const duration = formatDuration(Number(album?.duration || 0));
  if (duration) {
    facts.push({
      kind: "duration",
      label: "Durée totale",
      value: duration,
      source: "deezer",
      confidence: 0.74,
      priority: 52,
    });
  }

  if (album?.explicit_lyrics === true || album?.explicit_content_lyrics === true) {
    facts.push({
      kind: "content-warning",
      label: "Contenu explicite",
      value: "Paroles explicites",
      source: "deezer",
      confidence: 0.72,
      priority: 54,
    });
  }

  if (album?.explicit_content_cover === true) {
    facts.push({
      kind: "content-warning",
      label: "Contenu explicite",
      value: "Pochette explicite",
      source: "deezer",
      confidence: 0.7,
      priority: 53,
    });
  }

  if (typeof album?.available === "boolean") {
    facts.push({
      kind: "availability",
      label: "Deezer",
      value: album.available ? "Disponible" : "Indisponible",
      source: "deezer",
      confidence: 0.66,
      priority: 24,
    });
  }

  return facts.length > 0 ? facts : undefined;
}

export function createDeezerResolver() {
  return async function fetchFromDeezer(
    name: string,
    barcode?: string | null,
  ): Promise<MetadataResult | null> {
    if (!name && barcode) {
      try {
        const res = await axios.get(`https://api.deezer.com/album/upc:${barcode}`);
        const album = res.data;
        if (album && album.title && !album.error) {
          const artistName = album.artist?.name || "";
          const title = artistName ? `${artistName} - ${album.title}` : album.title;
          const albumDetailsRes = await axios.get(
            `https://api.deezer.com/album/${album.id}`,
          );
          const bestMatch = albumDetailsRes.data;
          if (bestMatch && bestMatch.title) {
            return {
              title,
              barcode: normalizeProductBarcode(bestMatch.upc || barcode),
              authors:
                bestMatch.contributors?.map(
                  (c: { name: string; picture_xl: string }) => ({
                    name: c.name,
                    imageUrl: c.picture_xl,
                  }),
                ) || [],
              publishers: [{ name: bestMatch.label }],
              duration: bestMatch.duration,
              tracksCount: bestMatch.nb_tracks,
              releaseDate: bestMatch.release_date,
              imageUrl: bestMatch.cover_big,
              attachments: [
                ...(bestMatch.cover_big
                  ? [
                      {
                        type: "cover" as const,
                        url: bestMatch.cover_big,
                        source: "deezer",
                      },
                    ]
                  : []),
                ...(bestMatch.tracks?.data?.map(
                  (track: {
                    title: string;
                    duration: number;
                    preview: string;
                  }) => ({
                    type: "audio" as const,
                    title: track.title,
                    duration: track.duration,
                    url: track.preview,
                    source: "deezer",
                  }),
                ) || []),
              ],
              facts: buildDeezerFacts(bestMatch),
            };
          }
        }
      } catch (error) {
        console.error(`[Deezer] Error looking up barcode "${barcode}":`, error);
      }
      return null;
    }

    const searchUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(name)}`;
    const res = await axios.get(searchUrl);
    const data = res.data;

    if (!data.data || data.data.length === 0) return null;

    let bestMatch = null;
    let minDistance = Infinity;

    for (const album of data.data) {
      const albumDetailsRes = await axios.get(`https://api.deezer.com/album/${album.id}`);
      const albumDetails = albumDetailsRes.data;

      if (barcode && albumDetails.upc === barcode) {
        bestMatch = albumDetails;
        break;
      }

      const distance = levenshtein.get(
        name.toLowerCase(),
        albumDetails.title.toLowerCase(),
      );
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = albumDetails;
      }
    }

    if (!bestMatch) return null;

    return {
      title: bestMatch.title,
      barcode: normalizeProductBarcode(bestMatch.upc || barcode),
      authors: bestMatch.contributors.map(
        (c: { name: string; picture_xl: string }) => ({
          name: c.name,
          imageUrl: c.picture_xl,
        }),
      ),
      publishers: [{ name: bestMatch.label }],
      duration: bestMatch.duration,
      tracksCount: bestMatch.nb_tracks,
      releaseDate: bestMatch.release_date,
      imageUrl: bestMatch.cover_big,
      attachments: [
        ...(bestMatch.cover_big
          ? [
              {
                type: "cover" as const,
                url: bestMatch.cover_big,
                source: "deezer",
              },
            ]
          : []),
        ...bestMatch.tracks.data.map(
          (track: { title: string; duration: number; preview: string }) => ({
            type: "audio" as const,
            title: track.title,
            duration: track.duration,
            url: track.preview,
            source: "deezer",
          }),
        ),
      ],
      facts: buildDeezerFacts(bestMatch),
    };
  };
}
