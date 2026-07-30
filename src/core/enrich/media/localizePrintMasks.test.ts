import { describe, expect, it, vi } from "vitest";

import {
  localizePrintMasks,
  remoteMaskRequests,
  withLocalizedMasks,
} from "@/core/enrich/media/localizePrintMasks";

/** Stands in for `runWithConcurrency`, in order and without a pool. */
const runSerially = async <A, R>(
  items: readonly A[],
  worker: (item: A) => Promise<R>,
): Promise<R[]> => {
  const out: R[] = [];
  for (const item of items) out.push(await worker(item));
  return out;
};

const REMOTE = "https://api.lorcana.ravensburger.com/images/fr/set1/17_ab.jpg";
const REMOTE_2 =
  "https://api.lorcana.ravensburger.com/images/fr/set1/18_cd.jpg";

describe("remoteMaskRequests", () => {
  it("collects all three mask fields, and says which need baking", () => {
    // The varnish masks are normal maps: unusable as luminance until their blue
    // channel is pulled out. The foil mask is already a coverage map.
    expect(
      remoteMaskRequests([
        {
          foilMaskUrl: REMOTE,
          varnishMaskUrl: "https://x.test/v.jpg",
          secondVarnishMaskUrl: "https://x.test/v2.jpg",
        },
      ]),
    ).toEqual([
      { url: REMOTE, coverage: false },
      { url: "https://x.test/v.jpg", coverage: true },
      { url: "https://x.test/v2.jpg", coverage: true },
    ]);
  });

  it("asks once for a mask a whole shelf shares", () => {
    // A set reuses masks heavily; per-print fetches would hammer a host that
    // already rate-limits.
    expect(
      remoteMaskRequests([
        { foilMaskUrl: REMOTE },
        { foilMaskUrl: REMOTE },
        { foilMaskUrl: REMOTE_2 },
      ]),
    ).toEqual([
      { url: REMOTE, coverage: false },
      { url: REMOTE_2, coverage: false },
    ]);
  });

  it("keeps the raw and baked forms of one file apart", () => {
    // The same normal map could in principle serve both roles; one cache entry
    // for both would hand a foil layer a baked mask or vice versa.
    expect(
      remoteMaskRequests([{ foilMaskUrl: REMOTE, varnishMaskUrl: REMOTE }]),
    ).toEqual([
      { url: REMOTE, coverage: false },
      { url: REMOTE, coverage: true },
    ]);
  });

  it("ignores masks that are already local, and absent ones", () => {
    expect(
      remoteMaskRequests([
        { foilMaskUrl: "/uploads/abc.jpg" },
        { foilMaskUrl: null, varnishMaskUrl: undefined },
        {},
      ]),
    ).toEqual([]);
  });
});

describe("withLocalizedMasks", () => {
  it("swaps in the local copy", () => {
    expect(
      withLocalizedMasks(
        { foilMaskUrl: REMOTE },
        new Map([[`raw|${REMOTE}`, "/uploads/abc.jpg"]]),
      ),
    ).toEqual({ foilMaskUrl: "/uploads/abc.jpg" });
  });

  it("leaves a mask that has no local copy pointing at the publisher", () => {
    // A hotlinked mask still works in most browsers; dropping it would turn a
    // partial failure into an unmasked layer over the whole card.
    expect(withLocalizedMasks({ foilMaskUrl: REMOTE }, new Map())).toEqual({
      foilMaskUrl: REMOTE,
    });
  });

  it("keeps every other field of the print untouched", () => {
    const print = {
      foilMaskUrl: REMOTE,
      finishes: ["Silver"],
      varnishColor: "#FF474B",
    };

    expect(
      withLocalizedMasks(print, new Map([[`raw|${REMOTE}`, "/uploads/abc.jpg"]])),
    ).toEqual({
      foilMaskUrl: "/uploads/abc.jpg",
      finishes: ["Silver"],
      varnishColor: "#FF474B",
    });
  });
});

describe("localizePrintMasks", () => {
  it("localizes every print from one pass over the distinct files", async () => {
    const localize = vi.fn(async ({ url }: { url: string }) =>
      url === REMOTE ? "/uploads/aaa.jpg" : "/uploads/bbb.jpg",
    );

    const out = await localizePrintMasks(
      [{ foilMaskUrl: REMOTE }, { foilMaskUrl: REMOTE }],
      localize,
      runSerially,
    );

    expect(localize).toHaveBeenCalledTimes(1);
    expect(out).toEqual([
      { foilMaskUrl: "/uploads/aaa.jpg" },
      { foilMaskUrl: "/uploads/aaa.jpg" },
    ]);
  });

  it("does nothing, and asks nothing, when no mask is remote", async () => {
    const localize = vi.fn(async () => "/uploads/never.jpg");

    const out = await localizePrintMasks(
      [{ foilMaskUrl: "/uploads/already.jpg" }],
      localize,
      runSerially,
    );

    expect(localize).not.toHaveBeenCalled();
    expect(out).toEqual([{ foilMaskUrl: "/uploads/already.jpg" }]);
  });

  it("survives one unreachable mask without losing the others", async () => {
    const localize = vi.fn(async ({ url }: { url: string }) => {
      if (url === REMOTE) throw new Error("403");
      return "/uploads/bbb.jpg";
    });

    const out = await localizePrintMasks(
      [{ foilMaskUrl: REMOTE }, { foilMaskUrl: REMOTE_2 }],
      localize,
      runSerially,
    );

    expect(out).toEqual([
      { foilMaskUrl: REMOTE },
      { foilMaskUrl: "/uploads/bbb.jpg" },
    ]);
  });

  it("refuses anything the localizer did not actually bring home", async () => {
    // `downloadRemoteImage` hands back the remote URL when it decides a file is
    // worth keeping remote. Treating that as a local copy would be a lie.
    const localize = vi.fn(async ({ url }: { url: string }) => url);

    const out = await localizePrintMasks(
      [{ foilMaskUrl: REMOTE }],
      localize,
      runSerially,
    );

    expect(out).toEqual([{ foilMaskUrl: REMOTE }]);
  });
});
