import type { AttachmentType } from "@prisma/client";

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
