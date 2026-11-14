import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createCardFaceChoice } from "./cardFaces";

describe("areaDecidesBelow", () => {
  /*
    Relevé le 2026-08-20 sur `booster-s4` : une vignette de boutique 200×300,
    rembourrée jusqu'au 2:3 idéal, scorait 656 contre 632 pour une photo
    286×500 qui montre deux fois plus de pack. Sous le plancher, la taille
    tranche (core catalogueFaceRank).
  */
  const choice = createCardFaceChoice<"petit" | "grand">({
    sources: ["petit", "grand"],
    areaDecidesBelow: 200_000,
  });

  it("prend la plus grande quand les deux sont sous le plancher", () => {
    const best = choice.pickBestFace(
      [
        { source: "petit", file: "art.petit.jpg", width: 200, height: 300 },
        { source: "grand", file: "art.grand.jpg", width: 286, height: 500 },
      ],
      "fr",
    );
    expect(best).toBe("grand");
  });

  it("laisse le score décider dès qu'une image passe le plancher", () => {
    // 800×1200 = 0,96 MP : au-dessus du plancher, plus de pixels gagne.
    const best = choice.pickBestFace(
      [
        { source: "petit", file: "art.petit.jpg", width: 800, height: 1200 },
        { source: "grand", file: "art.grand.jpg", width: 286, height: 500 },
      ],
      "fr",
    );
    expect(best).toBe("petit");
  });

  it("retombe sur l'ordre de déclaration à surface égale", () => {
    const best = choice.pickBestFace(
      [
        { source: "grand", file: "art.grand.jpg", width: 200, height: 300 },
        { source: "petit", file: "art.petit.jpg", width: 200, height: 300 },
      ],
      "fr",
    );
    expect(best).toBe("petit");
  });

  it("sans areaDecidesBelow, les pixels décident (pas le ratio scorer)", () => {
    const plain = createCardFaceChoice<"petit" | "grand">({
      sources: ["petit", "grand"],
    });
    expect(
      plain.pickBestFace(
        [
          { source: "petit", file: "art.petit.jpg", width: 200, height: 300 },
          { source: "grand", file: "art.grand.jpg", width: 286, height: 500 },
        ],
        "fr",
      ),
    ).toBe("grand");
  });

  it("prefers catalog provenance over a larger listing photo", () => {
    const ranked = createCardFaceChoice<"boutique" | "photo">({
      sources: ["boutique", "photo"],
      sourceCoverProvenance: (source) =>
        source === "photo" ? "listing_photo" : "catalog",
      areaDecidesBelow: 200_000,
    });
    expect(
      ranked.pickBestFace(
        [
          {
            source: "photo",
            file: "art.photo.jpg",
            width: 764,
            height: 1000,
          },
          {
            source: "boutique",
            file: "art.boutique.jpg",
            width: 336,
            height: 421,
          },
        ],
        "fr",
      ),
    ).toBe("boutique");
  });

  it("demotes near-square padded embeds vs a real packshot aspect", () => {
    const sealed = createCardFaceChoice<"potomac" | "drive">({
      sources: ["potomac", "drive"],
      priority: { en: ["potomac", "drive"] },
      areaDecidesBelow: 200_000,
    });
    expect(
      sealed.pickBestFace(
        [
          {
            source: "drive",
            file: "art.drive.png",
            width: 1600,
            height: 1600,
          },
          {
            source: "potomac",
            file: "art.potomac.jpg",
            width: 736,
            height: 597,
          },
        ],
        "en",
      ),
    ).toBe("potomac");
  });

  it("keeps a real listing photo when the only catalog dump is a stub GIF", () => {
    const ranked = createCardFaceChoice<"gif" | "photo" | "boutique">({
      sources: ["gif", "photo", "boutique"],
      sourceCoverProvenance: (source) =>
        source === "photo" ? "listing_photo" : "catalog",
      areaDecidesBelow: 200_000,
    });
    expect(
      ranked.pickBestFace(
        [
          { source: "gif", file: "art.gif.gif", width: 200, height: 247 },
          {
            source: "photo",
            file: "art.photo.jpg",
            width: 631,
            height: 810,
          },
        ],
        "fr",
      ),
    ).toBe("photo");
    // Boutique packshot under areaFloor but above stub floor still beats photo.
    expect(
      ranked.pickBestFace(
        [
          {
            source: "photo",
            file: "art.photo.jpg",
            width: 774,
            height: 1000,
          },
          {
            source: "boutique",
            file: "art.boutique.jpg",
            width: 336,
            height: 421,
          },
        ],
        "fr",
      ),
    ).toBe("boutique");
  });

  it("skips unmeasurable faces instead of falling back to source-name order", () => {
    expect(
      choice.pickBestFace(
        [
          { source: "petit", file: "art.petit.jpg", width: 0, height: 0 },
          { source: "grand", file: "art.grand.jpg", width: 0, height: 0 },
        ],
        "fr",
      ),
    ).toBeNull();
    expect(
      choice.pickBestFace(
        [
          { source: "petit", file: "art.petit.jpg", width: 0, height: 0 },
          { source: "grand", file: "art.grand.jpg", width: 400, height: 560 },
        ],
        "fr",
      ),
    ).toBe("grand");
  });
});

describe("recordFaceDecision", () => {
  const choice = createCardFaceChoice<"a" | "b">({
    sources: ["a", "b"],
  });

  function withFaceJsonWrites<T>(run: () => T): T {
    const prev = process.env.PLACARR_WRITE_FACE_JSON;
    process.env.PLACARR_WRITE_FACE_JSON = "1";
    try {
      return run();
    } finally {
      if (prev === undefined) delete process.env.PLACARR_WRITE_FACE_JSON;
      else process.env.PLACARR_WRITE_FACE_JSON = prev;
    }
  }

  it("skips writes by default (retired display SSOT)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "face-decision-off-"));
    choice.recordFaceDecision(dir, "art", "art.a.jpg");
    expect(existsSync(path.join(dir, "face.json"))).toBe(false);
  });

  it("does not rewrite face.json when the winner is unchanged", () => {
    withFaceJsonWrites(() => {
      const dir = mkdtempSync(path.join(tmpdir(), "face-decision-"));
      choice.recordFaceDecision(dir, "art", "art.a.jpg");
      const first = readFileSync(path.join(dir, "face.json"), "utf8");
      const mtimeMs = statSync(path.join(dir, "face.json")).mtimeMs;
      choice.recordFaceDecision(dir, "art", "art.a.jpg");
      expect(readFileSync(path.join(dir, "face.json"), "utf8")).toBe(first);
      expect(statSync(path.join(dir, "face.json")).mtimeMs).toBe(mtimeMs);
    });
  });

  it("rewrites when the winner changes (opt-in dig trail)", () => {
    withFaceJsonWrites(() => {
      const dir = mkdtempSync(path.join(tmpdir(), "face-decision-"));
      choice.recordFaceDecision(dir, "art", "art.a.jpg");
      choice.recordFaceDecision(dir, "art", "art.b.jpg");
      expect(
        JSON.parse(readFileSync(path.join(dir, "face.json"), "utf8")),
      ).toEqual({
        art: "art.b.jpg",
      });
    });
  });
});
