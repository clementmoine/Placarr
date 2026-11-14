/**
 * Stack an overlay bitmap over a base (same size). Used to restack Frost
 * cost disc onto Frame and CostNumber onto Chara when those plates are
 * separate catalogue files rather than shader samplers.
 */
export async function compositeImageBitmapOver(
  base: ImageBitmap,
  overlay: ImageBitmap,
): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return base;
  ctx.drawImage(base, 0, 0);
  ctx.drawImage(overlay, 0, 0, base.width, base.height);
  return createImageBitmap(canvas, { colorSpaceConversion: "none" });
}

/** Fetch overlay and paint it over base; missing / failed overlay → base. */
export async function compositeOptionalOverlay(
  base: ImageBitmap,
  overlayUrl: string | null | undefined,
  fetchBitmap: (url: string) => Promise<ImageBitmap>,
): Promise<ImageBitmap> {
  if (!overlayUrl) return base;
  try {
    const overlay = await fetchBitmap(overlayUrl);
    return compositeImageBitmapOver(base, overlay);
  } catch {
    return base;
  }
}
