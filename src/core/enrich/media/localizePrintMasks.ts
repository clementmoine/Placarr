import type { MaskKind } from "@/core/enrich/media/maskDownload";

/**
 * Bringing a print's foil masks onto our own origin.
 *
 * Covers have always been localized; masks were not, and stayed hotlinked to the
 * publisher's API. That is worse than an inconsistency:
 *
 * - **The publisher's host is not ours to rely on.** It answers 403 under load,
 *   and a missing mask does not degrade — an unmasked foil layer covers the whole
 *   card, text box included, which looks like a bug in the effect.
 * - **Cross-origin images in a mask are the fragile case.** Ravensburger's own
 *   viewer serves its masks with `access-control-allow-origin` pinned to its own
 *   domain; ours arrive with no CORS grant at all. Same-origin removes the
 *   question rather than answering it per engine.
 * - Offline and the service worker get them for free.
 *
 * **Never trimmed.** A mask is aligned to its artwork pixel for pixel; trimming
 * a margin would slide the foil off the card it belongs to.
 */

/** What a print carries that needs bringing home. Mirrors `PrintCandidate`. */
export type PrintMaskUrls = {
  foilMaskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
};

/**
 * The mask fields, and what each file *is*.
 *
 * Both kinds get baked into an alpha mask, by different formulas: a foil mask is
 * a greyscale coverage map, a varnish mask is a normal map. Named in one place
 * so a fourth mask cannot be added without deciding which kind it is.
 */
export const PRINT_MASK_FIELDS = {
  foilMaskUrl: { kind: "foil" },
  varnishMaskUrl: { kind: "varnish" },
  secondVarnishMaskUrl: { kind: "varnish" },
} as const satisfies Record<keyof PrintMaskUrls, { kind: MaskKind }>;

type MaskField = keyof typeof PRINT_MASK_FIELDS;

const MASK_FIELD_NAMES = Object.keys(PRINT_MASK_FIELDS) as MaskField[];

/** A file to fetch, and how to treat it once fetched. */
export type MaskRequest = { url: string; kind: MaskKind };

export type MaskLocalizer = (request: MaskRequest) => Promise<string | null>;

/** The kind is part of the key: one file can serve as either kind. */
function requestKey(request: MaskRequest): string {
  return `${request.kind}|${request.url}`;
}

/**
 * Every distinct remote mask across a batch of prints.
 *
 * Distinct because a set shares masks heavily — a whole shelf of one finish can
 * come down to a handful of files, and asking for each print separately would
 * hammer a host that already rate-limits.
 */
export function remoteMaskRequests(
  prints: readonly PrintMaskUrls[],
): readonly MaskRequest[] {
  const byKey = new Map<string, MaskRequest>();
  for (const print of prints) {
    for (const field of MASK_FIELD_NAMES) {
      const url = print[field];
      if (!url || !url.startsWith("http")) continue;
      const request = { url, kind: PRINT_MASK_FIELDS[field].kind };
      byKey.set(requestKey(request), request);
    }
  }
  return [...byKey.values()];
}

/**
 * Swap in the local copies a print's masks now have.
 *
 * A mask with no local copy is left pointing at the publisher: a hotlinked mask
 * still works in most browsers, and dropping it would turn a partial failure
 * into an unmasked layer over the whole card.
 */
export function withLocalizedMasks<T extends PrintMaskUrls>(
  print: T,
  localByKey: ReadonlyMap<string, string>,
): T {
  const localized = { ...print };
  for (const field of MASK_FIELD_NAMES) {
    const url = print[field];
    if (!url) continue;
    const local = localByKey.get(
      requestKey({ url, kind: PRINT_MASK_FIELDS[field].kind }),
    );
    if (local) localized[field] = local as T[typeof field];
  }
  return localized;
}

/**
 * Localize the masks of a batch of prints, in one pass over the distinct files.
 *
 * `localize` is injected so the pure shape of this is testable without touching
 * the disk or the network.
 */
export async function localizePrintMasks<T extends PrintMaskUrls>(
  prints: readonly T[],
  localize: MaskLocalizer,
  runBatch: <A, R>(
    items: readonly A[],
    worker: (item: A) => Promise<R>,
  ) => Promise<R[]>,
  options?: {
    /**
     * When a remote mask cannot be baked, drop it instead of keeping the
     * publisher URL. CSS `mask-mode: alpha` treats JPEG (opaque alpha) as
     * full-card coverage — worse than a plain card. Unity can sample RGB from
     * JPEG, but cross-origin publisher hosts usually deny WebGL texures anyway.
     */
    dropRemoteOnMiss?: boolean;
  },
): Promise<T[]> {
  const requests = remoteMaskRequests(prints);
  if (requests.length === 0) return [...prints];

  const results = await runBatch(requests, async (request) => {
    try {
      return await localize(request);
    } catch {
      // One unreachable mask must not cost the batch its other answers.
      return null;
    }
  });

  const localByKey = new Map<string, string>();
  requests.forEach((request, index) => {
    const local = results[index];
    if (
      local &&
      (local.startsWith("/uploads/") || local.startsWith("/assets/"))
    ) {
      localByKey.set(requestKey(request), local);
    }
  });

  const localized = prints.map((print) =>
    withLocalizedMasks(print, localByKey),
  );
  if (!options?.dropRemoteOnMiss) return localized;
  return localized.map((print) => dropUnbakedRemoteMasks(print));
}

/**
 * Strip leftover `http(s)` mask URLs after a localize pass.
 *
 * Publisher foil masks are JPEG coverage maps. Our CSS stack masks by alpha
 * (Safari never applies `mask-mode: luminance`), so an unbaked JPEG paints the
 * foil over the whole card — text box included. Prefer plain art.
 */
export function dropUnbakedRemoteMasks<T extends PrintMaskUrls>(print: T): T {
  const next = { ...print };
  for (const field of MASK_FIELD_NAMES) {
    const url = next[field];
    if (url && url.startsWith("http")) {
      next[field] = null as T[typeof field];
    }
  }
  return next;
}
