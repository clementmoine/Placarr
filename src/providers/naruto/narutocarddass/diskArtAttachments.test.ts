import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { recordNarutoFaceDecision } from "./disk";
import { buildNarutoDiskArtAttachments } from "./diskArtAttachments";

describe("buildNarutoDiskArtAttachments", () => {
  it("emits one catalog cover per art.* and defaults to face.json winner", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "naruto-multi-art-"));
    const cardDir = path.join(root, "ninja", "ni0017", "fr");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.carddass.jpg"), "a");
    writeFileSync(path.join(cardDir, "art.coleka.webp"), "b");
    recordNarutoFaceDecision(cardDir, "art", "art.coleka.webp");

    const { attachments, defaultUrl } = buildNarutoDiskArtAttachments({
      printKey: "naruto:ni-0017",
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
      "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.coleka.webp",
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

  it("surfaces reconstructed-only faces named by face.json", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "naruto-recon-art-"));
    const cardDir = path.join(root, "promo", "pr0093", "fr");
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
      "/assets/naruto/carddass/cards/promo/pr0093/fr/art.reconstructed.webp",
    );
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.role).toBe("naruto-face-reconstructed");
    expect(attachments[0]?.coverProvenance).toBe("catalog");
  });
});
