import axios from "axios";
import levenshtein from "fast-levenshtein";

import { normalizeProductBarcode } from "@/lib/barcode/normalize";
import {
  makeObservationUsage,
  METADATA_OBSERVATION_SCHEMA_VERSION,
  observationsFromMetadataResult,
} from "@/lib/metadataObservations";
import type {
  MetadataAttachment,
  MetadataFact,
  MetadataResult,
} from "@/types/metadataProvider";
import type { ObservationEvidenceSignal } from "@/types/metadataObservation";

interface DeezerArtist {
  name?: string;
  picture_xl?: string;
}

interface DeezerGenre {
  name?: string;
}

interface DeezerTrack {
  title?: string;
  duration?: number;
  preview?: string;
}

interface DeezerAlbum {
  id?: number | string;
  title?: string;
  upc?: string;
  link?: string;
  label?: string;
  duration?: number;
  nb_tracks?: number;
  release_date?: string;
  cover_big?: string;
  artist?: DeezerArtist;
  contributors?: DeezerArtist[];
  tracks?: { data?: DeezerTrack[] };
  genres?: { data?: DeezerGenre[] };
  fans?: number;
  available?: boolean;
  explicit_lyrics?: boolean;
  explicit_content_lyrics?: boolean;
  explicit_content_cover?: boolean;
  error?: unknown;
}

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function buildDeezerFacts(album: DeezerAlbum): MetadataFact[] | undefined {
  const facts: MetadataFact[] = [];
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
    .map((genre) => String(genre?.name || "").trim())
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

  if (
    album?.explicit_lyrics === true ||
    album?.explicit_content_lyrics === true
  ) {
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

function normalizeDeezerId(album: DeezerAlbum): string | undefined {
  const value =
    album.id === undefined || album.id === null ? null : String(album.id).trim();
  return value || undefined;
}

function buildDeezerAuthors(
  album: DeezerAlbum,
): Array<{ name: string; imageUrl?: string | null }> | undefined {
  const people = new Map<string, { name: string; imageUrl?: string | null }>();
  for (const contributor of album.contributors || []) {
    const name = String(contributor?.name || "").trim();
    if (!name) continue;
    people.set(name.toLowerCase(), {
      name,
      imageUrl: contributor.picture_xl || undefined,
    });
  }

  if (people.size === 0 && album.artist?.name) {
    const name = String(album.artist.name).trim();
    if (name) {
      people.set(name.toLowerCase(), {
        name,
        imageUrl: album.artist.picture_xl || undefined,
      });
    }
  }

  return people.size > 0 ? Array.from(people.values()) : undefined;
}

function buildDeezerAttachments(
  album: DeezerAlbum,
): MetadataAttachment[] | undefined {
  const attachments: MetadataAttachment[] = [];
  if (album.cover_big) {
    attachments.push({
      type: "cover",
      url: album.cover_big,
      source: "deezer",
    });
  }

  for (const track of album.tracks?.data || []) {
    if (!track.preview) continue;
    attachments.push({
      type: "audio",
      title: track.title ? String(track.title) : undefined,
      duration:
        typeof track.duration === "number" && Number.isFinite(track.duration)
          ? track.duration
          : undefined,
      url: track.preview,
      source: "deezer",
    });
  }

  return attachments.length > 0 ? attachments : undefined;
}

function buildDeezerObservations(
  album: DeezerAlbum,
  metadata: MetadataResult,
  options: {
    barcodeInput?: string | null;
    includeTitleMatch?: boolean;
  },
) {
  const normalizedInput = normalizeProductBarcode(options.barcodeInput);
  const evidenceSignals: ObservationEvidenceSignal[] = ["structured_data"];
  if (options.includeTitleMatch) {
    evidenceSignals.push("title_match");
  }
  if (normalizedInput && metadata.barcode === normalizedInput) {
    evidenceSignals.push("barcode_match");
  }

  const sourceId = normalizeDeezerId(album);
  const sourceUrl = album.link || undefined;
  const observationMetadata: MetadataResult = {
    ...metadata,
    imageUrl: undefined,
    // `observationsFromMetadataResult` maps every attachment to an image
    // observation; keep only visual attachments to avoid audio-as-image records.
    attachments: (metadata.attachments || []).filter(
      (attachment) => attachment.type !== "audio",
    ),
  };

  const observations = observationsFromMetadataResult(observationMetadata, {
    providerId: "deezer",
    providerLabel: "Deezer",
    sourceDocumentRole: "api_object",
    sourceUrl,
    sourceId,
    evidenceSignals,
    titleRole: "object_title",
    aliasRole: "provider_grouped_alias",
    imageRole: "cover_front",
    factRole: "structured_fact",
    externalIdRole: "provider_record_id",
    language: "neutral",
  });

  if (metadata.barcode) {
    observations.push({
      kind: "external-id",
      role: "barcode",
      idKind: "ean13",
      value: metadata.barcode,
      provenance: {
        providerId: "deezer",
        providerLabel: "Deezer",
        sourceDocumentRole: "api_object",
        sourceUrl,
        sourceId,
        evidenceSignals,
      },
      usage: makeObservationUsage({
        evidence: "strong",
      }),
    });
  }

  return observations;
}

function mapDeezerMetadata(
  album: DeezerAlbum,
  title: string,
  options: {
    barcodeInput?: string | null;
    includeTitleMatch?: boolean;
  },
): MetadataResult {
  const normalizedBarcode = normalizeProductBarcode(album.upc || options.barcodeInput);
  const canonicalTitle = String(album.title || "").trim();
  const resolvedTitle = title.trim();
  const externalId = normalizeDeezerId(album);

  const metadata: MetadataResult = {
    title: resolvedTitle,
    barcode: normalizedBarcode,
    aliases:
      canonicalTitle && canonicalTitle !== resolvedTitle
        ? [canonicalTitle]
        : undefined,
    authors: buildDeezerAuthors(album),
    publishers: album.label ? [{ name: String(album.label) }] : undefined,
    duration:
      typeof album.duration === "number" && Number.isFinite(album.duration)
        ? album.duration
        : undefined,
    tracksCount:
      typeof album.nb_tracks === "number" && Number.isFinite(album.nb_tracks)
        ? album.nb_tracks
        : undefined,
    releaseDate: album.release_date || undefined,
    imageUrl: album.cover_big || undefined,
    attachments: buildDeezerAttachments(album),
    facts: buildDeezerFacts(album),
    externalIds: externalId ? { deezer: externalId } : undefined,
  };

  return {
    ...metadata,
    observations: buildDeezerObservations(album, metadata, options),
    observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
  };
}

export function createDeezerResolver() {
  return async function fetchFromDeezer(
    name: string,
    barcode?: string | null,
  ): Promise<MetadataResult | null> {
    const query = name.trim();
    const normalizedBarcode = normalizeProductBarcode(barcode);

    if (!query && normalizedBarcode) {
      try {
        const res = await axios.get(
          `https://api.deezer.com/album/upc:${normalizedBarcode}`,
        );
        const album = res.data as DeezerAlbum;
        if (album && album.title && !album.error) {
          const artistName = String(album.artist?.name || "").trim();
          const title = artistName
            ? `${artistName} - ${album.title}`
            : album.title;
          const albumDetailsRes = await axios.get(
            `https://api.deezer.com/album/${album.id}`,
          );
          const bestMatch = albumDetailsRes.data as DeezerAlbum;
          if (bestMatch && bestMatch.title) {
            return mapDeezerMetadata(bestMatch, String(title), {
              barcodeInput: normalizedBarcode,
            });
          }
        }
      } catch (error) {
        console.error(`[Deezer] Error looking up barcode "${barcode}":`, error);
      }
      return null;
    }

    if (!query) return null;

    const searchUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}`;
    const res = await axios.get(searchUrl);
    const data = res.data as { data?: Array<{ id?: number | string }> };

    if (!Array.isArray(data.data) || data.data.length === 0) return null;

    let bestMatch: DeezerAlbum | null = null;
    let minDistance = Infinity;

    for (const album of data.data) {
      if (!album.id) continue;
      const albumDetailsRes = await axios.get(
        `https://api.deezer.com/album/${album.id}`,
      );
      const albumDetails = albumDetailsRes.data as DeezerAlbum;
      if (!albumDetails?.title) continue;

      if (
        normalizedBarcode &&
        normalizeProductBarcode(albumDetails.upc) === normalizedBarcode
      ) {
        bestMatch = albumDetails;
        break;
      }

      const distance = levenshtein.get(
        query.toLowerCase(),
        String(albumDetails.title).toLowerCase(),
      );
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = albumDetails;
      }
    }

    if (!bestMatch) return null;

    return mapDeezerMetadata(bestMatch, String(bestMatch.title), {
      barcodeInput: normalizedBarcode,
      includeTitleMatch: true,
    });
  };
}

export { buildDeezerFacts, mapDeezerMetadata };
