"use client";

/**
 * Foil masks, fetched into memory before they are ever named in CSS.
 *
 * WebKit on iOS does not apply a CSS mask whose image has not finished loading
 * by the time the style is resolved — and it never re-invalidates when the image
 * does arrive. The mask silently means nothing, so the layer covers the entire
 * card: artwork, text box, borders. Chrome invalidates correctly, which is why
 * this looked finished on a desktop for days.
 *
 * Nothing about the *form* of the reference matters, which is what cost so much
 * time to establish. An SVG `<mask>`, a cross-origin URL, a same-origin
 * `/uploads/` path and `mask-type="luminance"` all fail the same way, because all
 * of them still name an image that has not loaded yet. What works is handing CSS
 * a resource that is already in memory — a `blob:` object URL. It is what
 * Ravensburger's own viewer does on iOS, and reading that off the device is the
 * only reason this was ever found.
 *
 * Shared, because a shelf of fifteen cards comes down to a handful of files and
 * one blob each is the point.
 */

/** Source URL -> object URL of the fetched bytes. */
const blobs = new Map<string, string>();
/** Fetched but not back yet, so a second card does not fetch again. */
const pending = new Set<string>();
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

export function subscribeToMaskBlobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The object URL if it is ready — never a fetch. */
export function peekMaskBlob(url: string | null | undefined): string | null {
  if (!url) return null;
  return blobs.get(url) ?? null;
}

/**
 * Fetch a mask into memory, if nobody has.
 *
 * The object URL is deliberately **never revoked**. Masks are immutable and few,
 * every card of a printing shares one, and revoking while another card still
 * wears it would blank that card's foil. A handful of decoded masks is a smaller
 * cost than a card that loses its effect on a re-render.
 */
export function requestMaskBlob(url: string | null | undefined): void {
  if (!url) return;
  if (blobs.has(url) || pending.has(url)) return;

  pending.add(url);
  void (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const blob = await response.blob();
      // Guard against two tabs of the same session racing to the same file.
      if (!blobs.has(url)) blobs.set(url, URL.createObjectURL(blob));
      announce();
    } catch {
      // A mask that cannot be fetched leaves the card plain, which is the
      // honest fallback: an unmasked layer would wash over the whole card.
    } finally {
      pending.delete(url);
    }
  })();
}

/** @internal test hook — the cache is deliberately session-long otherwise. */
export function resetMaskBlobStore(): void {
  for (const objectUrl of blobs.values()) URL.revokeObjectURL(objectUrl);
  blobs.clear();
  pending.clear();
  listeners.clear();
}
