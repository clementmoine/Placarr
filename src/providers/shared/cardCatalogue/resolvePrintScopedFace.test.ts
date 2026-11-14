import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePrintFace = vi.hoisted(() => vi.fn());

vi.mock("@/lib/media/resolvePrintFace", () => ({
  resolvePrintFace,
}));

import { resolvePrintScopedCatalogueFace } from "./resolvePrintScopedFace";

describe("resolvePrintScopedCatalogueFace", () => {
  beforeEach(() => {
    resolvePrintFace.mockReset();
  });

  it("returns null when print face resolve misses", () => {
    resolvePrintFace.mockReturnValue(null);
    expect(
      resolvePrintScopedCatalogueFace({
        packId: "pokemon",
        printKey: "pokemon:sv1-001",
        lang: "fr",
      }),
    ).toBeNull();
  });

  it("prefers /cards/…/art.* when the hit carries a basename", () => {
    const disk = { lang: "fr", set: "sv1", card: "001" };
    resolvePrintFace.mockImplementation(
      (opts: { role?: string }) => {
        if (opts.role === "thumb") {
          return {
            filePath: "/tmp/art.mcdn.webp",
            artFile: "art.mcdn.webp",
            source: "owned" as const,
            disk,
          };
        }
        return {
          filePath: "/tmp/art.mcdn.webp",
          artFile: "art.mcdn.webp",
          source: "owned" as const,
          disk,
        };
      },
    );

    expect(
      resolvePrintScopedCatalogueFace({
        packId: "pokemon",
        printKey: "pokemon:sv1-001",
        lang: "fr",
      }),
    ).toEqual({
      artUrl: "/assets/pokemon/cards/fr/sv1/001/art.mcdn.webp",
      // Same basename for thumb → print-role thumb URL (no duplicate art path).
      thumbUrl: "/assets/pokemon/prints/sv1-001-fr/thumb",
    });
  });

  it("stamps artFallbackFrom when the hit is borrowed", () => {
    const disk = { lang: "fr", set: "s1", card: "ni0017" };
    resolvePrintFace.mockReturnValue({
      filePath: "/tmp/art.carddass.webp",
      artFile: "art.carddass.webp",
      source: "borrowed",
      donorPrintKey: "naruto:s1-ni0017",
      disk,
    });

    expect(
      resolvePrintScopedCatalogueFace({
        packId: "naruto/carddass",
        printKey: "naruto:s1-ni0017-prerelease",
        lang: "fr",
      }),
    ).toEqual({
      artUrl:
        "/assets/naruto/carddass/cards/fr/s1/ni0017/art.carddass.webp",
      thumbUrl: "/assets/naruto/carddass/prints/prerelease-ni0017-fr/thumb",
      artFallbackFrom: "naruto:s1-ni0017",
    });
  });
});
