/**
 * What a shelf may store as the back of its cards.
 *
 * The rule has to be one function, not one per side. It was written twice — the
 * form accepted an uploaded file's `/uploads/…` path, the API accepted only
 * absolute URLs — so picking an image saved successfully and stored nothing.
 */

/** A path served out of the local uploads directory, traversal excluded. */
function isLocalUploadPath(value: string): boolean {
  return (
    value.startsWith("/uploads/") &&
    !value.includes("..") &&
    !value.includes("\\")
  );
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Whether a string is something the card back can be set to: an image the
 * collector uploaded, or an address to hotlink.
 *
 * Deliberately narrow. The value ends up as an `<img src>`, so anything else a
 * URL bar accepts — `data:`, `javascript:`, a bare hostname — is refused rather
 * than stored and rendered.
 */
export function isCardBackUrl(value: string): boolean {
  const trimmed = value.trim();
  return isLocalUploadPath(trimmed) || isAbsoluteHttpUrl(trimmed);
}

/**
 * The value to persist, or `null` for "these cards do not turn over".
 *
 * Anything unusable becomes `null` rather than an error: the back is
 * decoration, and refusing to save a shelf over its ornament would be worse
 * than saving the shelf without one.
 */
export function normalizeCardBackUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isCardBackUrl(trimmed) ? trimmed : null;
}
