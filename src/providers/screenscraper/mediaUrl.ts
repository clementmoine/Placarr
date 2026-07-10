import type { AttachmentType } from "@prisma/client";

export interface SSMedia {
  type: string;
  url: string;
  region?: string;
  format?: string;
  size?: string | number;
}

// ScreenScraper lists media it doesn't really have and serves a tiny solid
// "no image" placeholder for them (observed at 2742 bytes, e.g. box-2D-back(jp)
// on jeuid 14825). Real box art is always far larger (the smallest legitimate
// spine/side seen is ~8.7 KB), so a small `size` is a reliable, download-free
// signal to drop these before they reach the gallery or cover picker.
const SS_PLACEHOLDER_MAX_SIZE_BYTES = 4096;

export function isScreenScraperPlaceholderMedia(media: SSMedia): boolean {
  const size = Number(media.size);
  return (
    Number.isFinite(size) && size > 0 && size < SS_PLACEHOLDER_MAX_SIZE_BYTES
  );
}

/**
 * Picks the best cover image URL from ScreenScraper medias array.
 * Prefers a true front cover first, then the best region inside that type.
 * This keeps box-2D(eu) above decorative mix images such as mixrbv2(fr).
 */
export function pickSSCover(allMedias: SSMedia[]): string | null {
  const medias = allMedias.filter((m) => !isScreenScraperPlaceholderMedia(m));
  const preferredTypes = ["box-2D", "box-3D"];
  const regionOrder = ["fr", "eu", "wor", "us", "jp"];

  for (const type of preferredTypes) {
    for (const region of regionOrder) {
      const found = medias.find((m) => m.type === type && m.region === region);
      if (found) return found.url;
    }
  }

  for (const type of preferredTypes) {
    const found = medias.find((m) => m.type === type);
    if (found) return found.url;
  }

  return null;
}

export type ScreenScraperMediaAttachmentSemantics = {
  type: AttachmentType;
  role?: string;
};

export function screenScraperMediaAttachmentSemantics(media: {
  type?: string | null;
  region?: string | null;
}): ScreenScraperMediaAttachmentSemantics | null {
  const mediaType = media.type || "";
  const region = media.region || undefined;

  if (mediaType === "box-2D") {
    return { type: "cover", role: region || "wor" };
  }
  if (mediaType === "box-3D") {
    return { type: "cover", role: region ? `3d-${region}` : "3d-wor" };
  }
  if (mediaType === "box-2D-back" || mediaType === "box-back") {
    return { type: "image", role: region ? `back-${region}` : "back" };
  }
  if (mediaType === "support-2D" || mediaType === "support-texture") {
    return { type: "image", role: region ? `disc-${region}` : "disc" };
  }
  if (mediaType === "ss") {
    return { type: "screenshot", role: region || "wor" };
  }
  if (mediaType === "sstitle") {
    return { type: "screenshot", role: "title" };
  }
  if (mediaType === "wheel") {
    return { type: "logo" };
  }
  if (mediaType === "fanart") {
    return { type: "background" };
  }
  if (mediaType === "steamgrid") {
    return { type: "artwork" };
  }

  return null;
}

export function parseScreenScraperMediaUrl(url: string): {
  gameId?: number;
  systemId?: number;
  mediaType?: string;
  mediaRegion?: string;
} | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("screenscraper.fr")) return null;
    const gameId = Number(parsed.searchParams.get("jeuid"));
    const systemId = Number(parsed.searchParams.get("systemeid"));
    const media = parsed.searchParams.get("media") || "";
    const mediaMatch = media.match(/^([^()]+)(?:\(([^)]+)\))?$/);
    return {
      gameId: Number.isFinite(gameId) && gameId > 0 ? gameId : undefined,
      systemId:
        Number.isFinite(systemId) && systemId > 0 ? systemId : undefined,
      mediaType: mediaMatch?.[1] || undefined,
      mediaRegion: mediaMatch?.[2] || undefined,
    };
  } catch {
    return null;
  }
}

export function screenScraperAttachmentFromMediaUrl(
  url: string,
):
  | (ScreenScraperMediaAttachmentSemantics & { source: "screenscraper" })
  | null {
  const parsed = parseScreenScraperMediaUrl(url);
  if (!parsed?.mediaType) return null;

  const semantics = screenScraperMediaAttachmentSemantics({
    type: parsed.mediaType,
    region: parsed.mediaRegion,
  });
  return semantics ? { ...semantics, source: "screenscraper" } : null;
}
