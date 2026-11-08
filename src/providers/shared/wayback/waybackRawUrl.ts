/**
 * Wayback Machine **raw asset** URL (`…/web/{ts}id_/…`).
 *
 * Digs use this for CDX originals (faces, PDFs, packshots). Distinct from
 * {@link waybackPublicCitationUrl} in core citations (UI-facing, may wrap
 * differently). Timestamp digits only — CDX rows sometimes include junk.
 */
export function waybackRawUrl(timestamp: string, original: string): string {
  const ts = timestamp.replace(/\D/g, "");
  return `https://web.archive.org/web/${ts}id_/${original}`;
}
