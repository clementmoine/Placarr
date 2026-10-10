/**
 * Cover Art Archive (coverartarchive.org) — Front / Back / Spine / Medium.
 *
 * MusicBrainz release MBID → typed scans. A combined `Back`+`Spine` image is
 * treated as **back only** (wraparound scan ≠ a narrow GameBox3D spine strip).
 * Dedicated `Spine`-only images become `role: spine`.
 */

import { httpGet } from "@/lib/http/httpClient";
import type { MetadataAttachment } from "@/types/metadataProvider";

const CAA_ORIGIN = "https://coverartarchive.org";
const PROVIDER_ID = "musicbrainz";

export type CoverArtArchiveImage = {
  id?: number | string;
  image?: string;
  front?: boolean;
  back?: boolean;
  types?: string[];
  thumbnails?: Record<string, string>;
};

export type CoverArtArchivePayload = {
  images?: CoverArtArchiveImage[];
};

/** Prefer https CAA URLs (API historically returns http). */
export function normalizeCaaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === "http:" &&
      /(^|\.)coverartarchive\.org$/i.test(parsed.hostname)
    ) {
      parsed.protocol = "https:";
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
}

function pickImageUrl(image: CoverArtArchiveImage): string | null {
  const large =
    image.thumbnails?.["1200"] ||
    image.thumbnails?.large ||
    image.thumbnails?.["500"] ||
    image.image;
  if (typeof large !== "string" || !large.trim()) return null;
  return normalizeCaaUrl(large);
}

function typeSet(image: CoverArtArchiveImage): Set<string> {
  return new Set(
    (image.types ?? []).map((t) => String(t).trim().toLowerCase()),
  );
}

/**
 * Map one CAA image to a Placarr attachment role, or null when unused
 * (booklet, tray, matrix…).
 */
export function caaImageRole(
  image: CoverArtArchiveImage,
): "front" | "back" | "spine" | "disc" | null {
  const types = typeSet(image);
  if (image.front === true || types.has("front")) return "front";
  // Combined back+spine wraparound → back only (not a thin spine strip).
  if (types.has("back") || image.back === true) return "back";
  if (types.has("spine")) return "spine";
  if (types.has("medium")) return "disc";
  return null;
}

/** @internal pure — unit-tested */
export function attachmentsFromCoverArtArchive(
  payload: CoverArtArchivePayload | null | undefined,
): MetadataAttachment[] {
  const images = payload?.images;
  if (!Array.isArray(images) || images.length === 0) return [];

  const out: MetadataAttachment[] = [];
  const seenRoles = new Set<string>();
  const seenUrls = new Set<string>();

  // Prefer earlier approved-looking order as returned by CAA.
  for (const image of images) {
    const role = caaImageRole(image);
    if (!role) continue;
    // One attachment per face role (first wins — CAA lists front first).
    if (seenRoles.has(role)) continue;
    const url = pickImageUrl(image);
    if (!url || seenUrls.has(url)) continue;
    seenRoles.add(role);
    seenUrls.add(url);
    out.push({
      type: role === "front" ? "cover" : role === "disc" ? "image" : "image",
      url,
      role,
      title:
        role === "front"
          ? "Cover - Front"
          : role === "back"
            ? "Cover - Back"
            : role === "spine"
              ? "Cover - Spine"
              : "Medium",
      source: PROVIDER_ID,
    });
  }

  return out;
}

export async function fetchCoverArtArchiveAttachments(
  mbid: string,
  signal?: AbortSignal,
): Promise<MetadataAttachment[]> {
  const id = (mbid || "").trim();
  if (!id) return [];
  try {
    const res = await httpGet<CoverArtArchivePayload>(
      `${CAA_ORIGIN}/release/${encodeURIComponent(id)}`,
      {
        timeout: 10000,
        signal,
        validateStatus: (status) =>
          (status >= 200 && status < 300) || status === 404,
        headers: {
          Accept: "application/json",
          "User-Agent": "Placarr/1.0 (https://github.com/clementmoine/Placarr)",
        },
      },
    );
    if (res.status === 404) return [];
    return attachmentsFromCoverArtArchive(res.data);
  } catch {
    return [];
  }
}
