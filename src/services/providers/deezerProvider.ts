import axios from "axios";
import levenshtein from "fast-levenshtein";

import type { MetadataResult } from "@/services/metadata";

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
    };
  };
}
