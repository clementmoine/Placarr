import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { recordNarutoFaceDecision } from "./disk";
import {
  buildNarutoDiskArtAttachments,
  narutoLangFirstAssetsRest,
  narutoRetailAssetsRest,
  resolveNarutoArtDiskNumber,
  resolveNarutoArtDiskSet,
} from "./diskArtAttachments";

describe("buildNarutoDiskArtAttachments", () => {
  it("emits one catalog cover per art.* and defaults to face.json winner", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "naruto-multi-art-"));
    const cardDir = path.join(root, "fr", "s1", "ni0017");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.carddass.jpg"), "a");
    writeFileSync(path.join(cardDir, "art.coleka.webp"), "b");
    recordNarutoFaceDecision(cardDir, "art", "art.coleka.webp");

    const { attachments, defaultUrl } = buildNarutoDiskArtAttachments({
      printKey: "naruto:s1-ni0017",
      number: "ni0017",
      lang: "fr",
      source: "narutocarddass",
      title: "Haku",
      cardsRoot: root,
    });

    expect(attachments).toHaveLength(2);
    expect(
      attachments.find((a) => a.role === "naruto-face-carddass")
        ?.coverProvenance,
    ).toBe("catalog");
    expect(
      attachments.find((a) => a.role === "naruto-face-coleka")?.coverProvenance,
    ).toBe("listing_photo");
    expect(attachments.every((a) => a.source === "narutocarddass")).toBe(true);
    expect(defaultUrl).toBe(
      "/assets/naruto/carddass/cards/fr/s1/ni0017/art.coleka.webp",
    );
    expect(attachments[0]?.url).toBe(defaultUrl);
    expect(attachments.map((a) => a.role).sort()).toEqual(
      ["naruto-face-carddass", "naruto-face-coleka"].sort(),
    );
  });

  it("ignores foreign printKey games", () => {
    expect(
      buildNarutoDiskArtAttachments({
        printKey: "lorcana:1-1",
        number: "1",
        lang: "en",
        source: "narutocarddass",
      }).attachments,
    ).toEqual([]);
  });

  it("rewrites assets rest from promo stub folder onto retail", () => {
    expect(
      narutoRetailAssetsRest([
        "cards",
        "fr",
        "s2",
        "ta0081-promo",
        "art.carddass.jpg",
      ]),
    ).toEqual(["cards", "fr", "s2", "ta0081", "art.carddass.jpg"]);
    expect(
      narutoRetailAssetsRest([
        "cards",
        "fr",
        "s2",
        "ta0081",
        "art.carddass.jpg",
      ]),
    ).toBeNull();
  });

  it("rewrites legacy family/card/lang onto lang-first disk", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "naruto-legacy-url-"));
    const s6 = path.join(root, "fr", "s6", "ni0206");
    mkdirSync(s6, { recursive: true });
    writeFileSync(path.join(s6, "art.carddass.jpg"), "face");

    expect(
      narutoLangFirstAssetsRest(
        ["cards", "ninja", "ni0206", "fr", "art.carddass.jpg"],
        root,
      ),
    ).toEqual(["cards", "fr", "s6", "ni0206", "art.carddass.jpg"]);
    expect(
      narutoLangFirstAssetsRest([
        "cards",
        "s1",
        "fr",
        "ni0013",
        "art.carddass.jpg",
      ]),
    ).toEqual(["cards", "fr", "s1", "ni0013", "art.carddass.jpg"]);
    expect(
      narutoLangFirstAssetsRest([
        "cards",
        "fr",
        "s1",
        "ni0013",
        "art.carddass.jpg",
      ]),
    ).toBeNull();
  });

  it("resolves art set when printKey set folder is empty (primary appearance elsewhere)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "naruto-art-set-"));
    const s2 = path.join(root, "fr", "s2", "cl0005");
    mkdirSync(s2, { recursive: true });
    writeFileSync(path.join(s2, "art.carddass.jpg"), "face");

    expect(
      resolveNarutoArtDiskSet({
        number: "cl0005",
        lang: "fr",
        set: "s1",
        artFile: "art.carddass.jpg",
        cardsRoot: root,
      }),
    ).toBe("s2");

    const { defaultUrl } = buildNarutoDiskArtAttachments({
      printKey: "naruto:s1-cl0005",
      number: "cl0005",
      lang: "fr",
      source: "narutocarddass",
      cardsRoot: root,
    });
    expect(defaultUrl).toBe(
      "/assets/naruto/carddass/cards/fr/s2/cl0005/art.carddass.jpg",
    );
  });

  it("points promo stubs at the retail folder that holds the mirrored face", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "naruto-promo-disk-"));
    const retailDir = path.join(root, "fr", "s2", "ta0081");
    mkdirSync(retailDir, { recursive: true });
    writeFileSync(path.join(retailDir, "art.carddass.jpg"), "face");

    expect(
      resolveNarutoArtDiskNumber({
        number: "ta0081-promo",
        lang: "fr",
        set: "promo",
        artFile: "art.carddass.jpg",
        cardsRoot: root,
      }),
    ).toBe("ta0081");

    const { defaultUrl } = buildNarutoDiskArtAttachments({
      printKey: "naruto:promo-ta0081",
      number: "ta0081-promo",
      lang: "fr",
      source: "narutocarddass",
      cardsRoot: root,
    });
    // Promo printKey looks under fr/promo/…; bytes live on retail — resolve
    // finds ta0081 across sets under fr/.
    expect(defaultUrl).toBe(
      "/assets/naruto/carddass/cards/fr/s2/ta0081/art.carddass.jpg",
    );
  });

  it("surfaces reconstructed-only faces named by face.json", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "naruto-recon-art-"));
    const cardDir = path.join(root, "fr", "promo", "pr0093");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.reconstructed.webp"), "recon");
    recordNarutoFaceDecision(cardDir, "art", "art.reconstructed.webp");

    const { attachments, defaultUrl } = buildNarutoDiskArtAttachments({
      printKey: "naruto:promo-pr0093",
      number: "pr0093",
      lang: "fr",
      source: "narutocarddass",
      cardsRoot: root,
    });

    expect(defaultUrl).toBe(
      "/assets/naruto/carddass/cards/fr/promo/pr0093/art.reconstructed.webp",
    );
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.role).toBe("naruto-face-reconstructed");
    expect(attachments[0]?.coverProvenance).toBe("catalog");
  });
});
