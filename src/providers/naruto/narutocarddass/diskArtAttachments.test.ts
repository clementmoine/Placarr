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
    expect(attachments.every((a) => a.coverProvenance === "catalog")).toBe(
      true,
    );
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
});
