/**
 * Whether a downloaded buffer is actually an image — by binary magic bytes
 * (JPEG/PNG/GIF/WebP/AVIF) or an SVG root (text), optionally trusting an
 * `image/svg+xml` content-type. Rejects HTML/text bodies a server returned with
 * HTTP 200 (e.g. ScreenScraper's "Erreur de login …" once saved as a .jpg).
 */
export function looksLikeImageBuffer(
  buffer: Buffer,
  contentType?: string,
): boolean {
  if (!buffer || buffer.length === 0) return false;

  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isGif =
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38;
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";
  const isAvif =
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis", "mif1"].includes(buffer.toString("ascii", 8, 12));
  if (isJpeg || isPng || isGif || isWebp || isAvif) return true;

  const head = buffer.toString("utf8", 0, Math.min(buffer.length, 256));
  const trimmed = head.trimStart();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("<!doctype html") || lower.startsWith("<html")) {
    return false;
  }
  if (contentType?.toLowerCase().includes("svg") && lower.includes("<svg")) {
    return true;
  }
  return /^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(
    trimmed,
  );
}
