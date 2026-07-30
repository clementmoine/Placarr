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
  it("collects all three mask fields, and says what each file is", () => {
    // The two kinds bake by different formulas: a foil mask is a coverage map,
    // a varnish mask is a normal map.
    expect(
      remoteMaskRequests([
        {
          foilMaskUrl: REMOTE,
          varnishMaskUrl: "https://x.test/v.jpg",
          secondVarnishMaskUrl: "https://x.test/v2.jpg",
        },
      ]),
    ).toEqual([
      { url: REMOTE, kind: "foil" },
      { url: "https://x.test/v.jpg", kind: "varnish" },
      { url: "https://x.test/v2.jpg", kind: "varnish" },
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
      { url: REMOTE, kind: "foil" },
      { url: REMOTE_2, kind: "foil" },
    ]);
  });

  it("keeps the two bakes of one file apart", () => {
    // One file could serve either role, and the bakes differ; a single cache
    // entry would hand a foil layer a varnish bake or the reverse.
    expect(
      remoteMaskRequests([{ foilMaskUrl: REMOTE, varnishMaskUrl: REMOTE }]),
    ).toEqual([
      { url: REMOTE, kind: "foil" },
      { url: REMOTE, kind: "varnish" },
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
        new Map([[`foil|${REMOTE}`, "/uploads/abc.jpg"]]),
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
      withLocalizedMasks(
        print,
        new Map([[`foil|${REMOTE}`, "/uploads/abc.jpg"]]),
      ),
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
