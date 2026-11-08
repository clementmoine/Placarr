/**
 * Admin / browse face when print-role resolve hits disk.
 * Prefer concrete `/cards/…/art.*` (Affiche SSOT); print roles stay HTTP
 * fallbacks when the basename is unknown.
 */
import { resolvePrintFace } from "@/lib/media/resolvePrintFace";
import { assetsCardUrl, assetsPrintFaceUrl } from "@/lib/packAssetUrls";

export type PrintScopedCatalogueFace = {
  artUrl: string;
  thumbUrl: string;
  artFallbackFrom?: string;
};

export function resolvePrintScopedCatalogueFace(opts: {
  packId: string;
  printKey: string;
  lang: string;
}): PrintScopedCatalogueFace | null {
  const { packId, printKey, lang } = opts;
  const hit = resolvePrintFace({ pack: packId, printKey, lang, role: "face" });
  if (!hit) return null;
  const thumbHit = resolvePrintFace({
    pack: packId,
    printKey,
    lang,
    role: "thumb",
  });
  const artUrl = hit.artFile
    ? assetsCardUrl(packId, hit.disk, hit.artFile)
    : assetsPrintFaceUrl(packId, printKey, lang, "face");
  const thumbUrl =
    thumbHit?.artFile && thumbHit.artFile !== hit.artFile
      ? assetsCardUrl(packId, thumbHit.disk, thumbHit.artFile)
      : assetsPrintFaceUrl(packId, printKey, lang, "thumb");
  return {
    artUrl,
    thumbUrl,
    ...(hit.source === "borrowed" && hit.donorPrintKey
      ? { artFallbackFrom: hit.donorPrintKey }
      : {}),
  };
}
