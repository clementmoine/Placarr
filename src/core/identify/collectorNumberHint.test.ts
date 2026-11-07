import { describe, expect, it } from "vitest";

import {
  parseCollectorNumberHint,
  printKeyMatchesCollectorHint,
  rerankMatchesByCollectorHint,
} from "./collectorNumberHint";

describe("parseCollectorNumberHint", () => {
  it("reads slash collector numbers", () => {
    expect(parseCollectorNumberHint("Foo 183/249 MKM")).toEqual({
      needle: "183",
      raw: "183/249",
      set: null,
      total: "249",
    });
  });

  it("reads Lorcana footer with set trailer", () => {
    expect(parseCollectorNumberHint("107/204 • FR • 2")).toEqual({
      needle: "107",
      raw: "107/204 • FR • 2",
      set: "2",
      total: "204",
    });
    expect(parseCollectorNumberHint("107/204-FR-2")).toMatchObject({
      needle: "107",
      set: "2",
      total: "204",
    });
  });

  it("reads set-number codes", () => {
    expect(parseCollectorNumberHint("BT01-015 Leader")).toEqual({
      needle: "bt1-15",
      raw: "BT01-015",
      set: "bt1",
      total: null,
    });
  });

  it("matches zero-padded One Piece BT01 printKeys", () => {
    const hint = parseCollectorNumberHint("BT01-015");
    expect(
      printKeyMatchesCollectorHint("onepiece:bt01-015", hint!),
    ).toBe(true);
  });

  it("returns null on empty noise", () => {
    expect(parseCollectorNumberHint("HOLYFOIL")).toBeNull();
  });
});

describe("printKeyMatchesCollectorHint", () => {
  it("matches lorcana set-card suffixes and card fields", () => {
    const hint = { needle: "184", raw: "184/204" };
    expect(printKeyMatchesCollectorHint("lorcana:2-184", hint)).toBe(true);
    expect(printKeyMatchesCollectorHint("lorcana:9-181", hint)).toBe(false);
    expect(printKeyMatchesCollectorHint("yugioh:sdcl-fr022", hint, "022")).toBe(
      false,
    );
    expect(printKeyMatchesCollectorHint("lorcana:2-1", hint, "184")).toBe(true);
  });

  it("matches DBS TB2-045 despite OCR zero-stripping", () => {
    const hint = parseCollectorNumberHint("TB2-045 SR");
    expect(hint?.needle).toBe("tb2-45");
    expect(
      printKeyMatchesCollectorHint("dbscg:tb2-045", hint!, "045"),
    ).toBe(true);
    expect(
      printKeyMatchesCollectorHint("dbscg:tb2-045-spr", hint!, "045-spr"),
    ).toBe(true);
    expect(
      printKeyMatchesCollectorHint("dbscg:tb2-044", hint!, "044"),
    ).toBe(false);
  });

  it("requireSet keeps Felicia on set 2, not every 107", () => {
    const hint = parseCollectorNumberHint("107/204 • FR • 2")!;
    expect(
      printKeyMatchesCollectorHint("lorcana:2-107", hint, "107", {
        requireSet: true,
      }),
    ).toBe(true);
    expect(
      printKeyMatchesCollectorHint("lorcana:1-107", hint, "107", {
        requireSet: true,
      }),
    ).toBe(false);
    expect(
      printKeyMatchesCollectorHint("pokemon:sv1-107", hint, "107", {
        requireSet: true,
      }),
    ).toBe(false);
  });
});

describe("rerankMatchesByCollectorHint", () => {
  it("promotes printKeys that contain the collector number", () => {
    const ranked = rerankMatchesByCollectorHint(
      [
        { printKey: "lorcana:1-10", distance: 100 },
        { printKey: "lorcana:1-177", distance: 120 },
        { printKey: "lorcana:2-50", distance: 110 },
      ],
      { needle: "177", raw: "177" },
    );
    expect(ranked[0]?.printKey).toBe("lorcana:1-177");
  });

  it("prefers set-agreeing Lorcana hits when OCR has set trailer", () => {
    const ranked = rerankMatchesByCollectorHint(
      [
        { printKey: "lorcana:1-107", distance: 90 },
        { printKey: "lorcana:2-107", distance: 120 },
      ],
      parseCollectorNumberHint("107/204 • FR • 2"),
    );
    expect(ranked[0]?.printKey).toBe("lorcana:2-107");
  });
});
