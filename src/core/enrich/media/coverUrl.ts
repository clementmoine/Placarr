/** Normalizes a localized cover path so edited derivatives match their source. */
/**
 * The original a derived edit came from.
 *
 * Two suffixes are stripped. Query strings first: re-editing overwrites the same
 * filename, so the UI appends a cache-busting `?v=` to force a refetch, and that
 * must never make two URLs look like different images.
 *
 * Then an optional role marker. An edit belongs to a file *and* a use — the same
 * artwork can be both the cover and the background, and editing one used to
 * rewrite the other's file. The marker sits *after* `_edited`
 * (`<name>_edited-background.webp`), never before it: a source name may
 * legitimately end in `-something`, so `<name>-background_edited.webp` would
 * have been indistinguishable from a plain edit of a file called
 * `<name>-background`.
 */
export function stripEditSuffixFromUrl(url: string): string {
  return url
    .split("?")[0]
    .split("#")[0]
    .replace(/_edited(?:-[a-z0-9]+)?(\.[^.]+)$/, "$1");
}

const UPLOADS_PREFIX = "/uploads/";

/**
 * Comparison key for "these name the same picture".
 *
 * For our own uploads the *extension* is dropped as well as the edit suffix:
 * every derivative is written as WebP whatever the source arrived as, so
 * `<hash>_edited.webp` and `<hash>.png` are one image. Matching on the full name
 * put an edit in the gallery as a second, unlabelled tile beside the original —
 * and stopped the selected row from following it. Remote URLs keep their
 * extension: two files on a provider CDN that differ only by extension are not
 * ours to declare identical.
 */
function localizedImageKey(url: string): string {
  const stripped = stripEditSuffixFromUrl(url);
  if (!stripped.startsWith(UPLOADS_PREFIX)) return stripped;
  return stripped.replace(/\.[^./]+$/, "");
}

export function urlsReferToSameLocalizedImage(a: string, b: string): boolean {
  return localizedImageKey(a) === localizedImageKey(b);
}

/**
 * True for a file this app derived by editing, whatever role it was edited for.
 * Re-editing overwrites the same name, so these are the URLs a gallery has to
 * cache-bust; matching only the bare `_edited` left every role-scoped derivative
 * showing its previous framing.
 */
export function isEditDerivativeUrl(url: string): boolean {
  return url !== stripEditSuffixFromUrl(url.split("?")[0].split("#")[0]);
}

/** The role whose edit keeps the bare `_edited` name, with no marker. */
export const DEFAULT_EDIT_ROLE = "cover";

/**
 * Name of the edit derived from `baseName` for this role, extension excluded.
 *
 * Paired with {@link stripEditSuffixFromUrl}, which must be able to take the
 * marker back off — that round trip is what lets the app find the original an
 * edit came from, and it is checked in the tests.
 */
export function editDerivativeBaseName(baseName: string, role: string): string {
  const marker =
    role && role !== DEFAULT_EDIT_ROLE && /^[a-z]+$/.test(role)
      ? `-${role}`
      : "";
  return `${baseName}_edited${marker}`;
}

const COVER_ELIGIBLE_ATTACHMENT_TYPES = new Set(["cover", "artwork", "image"]);

/** True for attachment types that may serve as the default box cover. */
export function isCoverEligibleAttachmentType(type?: string | null): boolean {
  return Boolean(type && COVER_ELIGIBLE_ATTACHMENT_TYPES.has(type));
}

function attachmentSourceKey(source?: string | null): string {
  return (source || "").split(/[·/]/)[0].toLowerCase().trim();
}

/**
 * Match a display URL to a gallery row. When several rows share the same file
 * (honor pin + catalog provider), prefer the catalog source so chips keep
 * Booknode / ScreenScraper instead of a synthetic "Perso".
 */
export function findAttachmentForUrl<
  T extends {
    type?: string | null;
    url?: string | null;
    source?: string | null;
  },
>(attachments: readonly T[], url: string): T | undefined {
  const matches = attachments.filter(
    (attachment) =>
      attachment.url && urlsReferToSameLocalizedImage(attachment.url, url),
  );
  if (matches.length === 0) return undefined;
  const catalog = matches.find((attachment) => {
    const key = attachmentSourceKey(attachment.source);
    return key.length > 0 && key !== "user";
  });
  return catalog ?? matches[0];
}

/** Backgrounds/logos must not become the pinned default cover. */
export function isUrlEligibleDefaultCover<
  T extends { type?: string | null; url?: string | null },
>(url: string | null | undefined, attachments: readonly T[]): boolean {
  if (!url) return false;
  const match = findAttachmentForUrl(attachments, url);
  if (!match) return true;
  return isCoverEligibleAttachmentType(match.type);
}
