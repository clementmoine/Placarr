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
 * The mask fields, and whether each needs its coverage baked out.
 *
 * The varnish masks are normal maps — only their blue channel says where the
 * coat is stamped — so they are not usable as luminance until that channel is
 * pulled out. The foil mask is already a greyscale coverage map.
 *
 * Named in one place so a fourth mask cannot be added without deciding which
 * kind it is.
 */
export const PRINT_MASK_FIELDS = {
  foilMaskUrl: { coverage: false },
  varnishMaskUrl: { coverage: true },
  secondVarnishMaskUrl: { coverage: true },
} as const satisfies Record<keyof PrintMaskUrls, { coverage: boolean }>;

type MaskField = keyof typeof PRINT_MASK_FIELDS;

const MASK_FIELD_NAMES = Object.keys(PRINT_MASK_FIELDS) as MaskField[];

/** A file to fetch, and how to treat it once fetched. */
export type MaskRequest = { url: string; coverage: boolean };

export type MaskLocalizer = (request: MaskRequest) => Promise<string | null>;

/** The two are one cache key: a normal map serves as both raw and baked. */
function requestKey(request: MaskRequest): string {
  return `${request.coverage ? "coverage" : "raw"}|${request.url}`;
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
      const request = { url, coverage: PRINT_MASK_FIELDS[field].coverage };
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
      requestKey({ url, coverage: PRINT_MASK_FIELDS[field].coverage }),
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
    if (local && local.startsWith("/uploads/")) {
      localByKey.set(requestKey(request), local);
    }
  });

  return prints.map((print) => withLocalizedMasks(print, localByKey));
}
