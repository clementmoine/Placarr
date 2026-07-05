import type { ICollectMetadata } from "./types";

function pickString(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null | undefined {
  const next = incoming?.trim();
  if (next) return next;
  return existing ?? null;
}

function pickNumber(
  incoming: number | null | undefined,
  existing: number | null | undefined,
): number | null | undefined {
  if (typeof incoming === "number" && Number.isFinite(incoming) && incoming > 0) {
    return incoming;
  }
  return existing ?? null;
}

function mergeImages(
  existing: ICollectMetadata["images"],
  incoming: ICollectMetadata["images"],
): ICollectMetadata["images"] {
  const byUrl = new Map<string, { url: string; label?: string }>();
  for (const image of [...(existing || []), ...(incoming || [])]) {
    if (!image?.url) continue;
    const prev = byUrl.get(image.url);
    byUrl.set(image.url, {
      url: image.url,
      label: image.label || prev?.label,
    });
  }
  return [...byUrl.values()];
}

function mergeGenres(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  const merged = [
    ...new Set(
      [...(existing || []), ...(incoming || [])]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  return merged.length > 0 ? merged : undefined;
}

/** Complement/correct catalog rows — never drop existing fields on partial fetches. */
export function mergeICollectCatalogMetadata(
  existing: ICollectMetadata,
  incoming: ICollectMetadata,
): ICollectMetadata {
  const title = incoming.title?.trim()
    ? incoming.title.trim()
    : existing.title;

  return {
    itemId: existing.itemId || incoming.itemId,
    itemUrl: incoming.itemUrl || existing.itemUrl,
    title,
    barcode: pickString(incoming.barcode, existing.barcode) ?? null,
    platform: pickString(incoming.platform, existing.platform) ?? null,
    publisher: pickString(incoming.publisher, existing.publisher) ?? null,
    developer: pickString(incoming.developer, existing.developer) ?? null,
    description: pickString(incoming.description, existing.description) ?? null,
    releaseDate: pickString(incoming.releaseDate, existing.releaseDate) ?? null,
    coverUrl: pickString(incoming.coverUrl, existing.coverUrl) ?? null,
    images: mergeImages(existing.images, incoming.images),
    players: pickString(incoming.players, existing.players) ?? null,
    ageRating: pickString(incoming.ageRating, existing.ageRating) ?? null,
    estimatedValueCents: pickNumber(
      incoming.estimatedValueCents,
      existing.estimatedValueCents,
    ) ?? null,
    estimatedValueDate:
      pickString(incoming.estimatedValueDate, existing.estimatedValueDate) ??
      null,
    series: pickString(incoming.series, existing.series) ?? null,
    ignScore: pickString(incoming.ignScore, existing.ignScore) ?? null,
    genres: mergeGenres(existing.genres, incoming.genres),
    countryOfPurchase:
      pickString(incoming.countryOfPurchase, existing.countryOfPurchase) ??
      null,
    gameMode: pickString(incoming.gameMode, existing.gameMode) ?? null,
    mediaType: pickString(incoming.mediaType, existing.mediaType) ?? null,
    packaging: pickString(incoming.packaging, existing.packaging) ?? null,
    discCount: pickString(incoming.discCount, existing.discCount) ?? null,
    graphics: pickString(incoming.graphics, existing.graphics) ?? null,
    inputDevices:
      incoming.inputDevices && incoming.inputDevices.length > 0
        ? incoming.inputDevices
        : existing.inputDevices,
    in3d: pickString(incoming.in3d, existing.in3d) ?? null,
    vr: pickString(incoming.vr, existing.vr) ?? null,
    specialEdition:
      pickString(incoming.specialEdition, existing.specialEdition) ?? null,
    seriesOrder: pickString(incoming.seriesOrder, existing.seriesOrder) ?? null,
    dateAdded: pickString(incoming.dateAdded, existing.dateAdded) ?? null,
    catalogSource:
      incoming.catalogSource === "page" || existing.catalogSource === "page"
        ? "page"
        : (incoming.catalogSource ?? existing.catalogSource ?? "sitemap"),
  };
}
