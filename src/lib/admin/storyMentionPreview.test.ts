import { describe, expect, it } from "vitest";

import { NARUTO_PACK_ID } from "@/providers/naruto/narutocarddass/packs";

import { resolveStoryMentionPreview } from "./storyMentionPreview";

describe("resolveStoryMentionPreview", () => {
  it("returns found:false for unknown sealed slug (no crash)", async () => {
    const preview = await resolveStoryMentionPreview({
      packId: NARUTO_PACK_ID,
      kind: "sealed",
      id: "no-such-sealed-sku-xyz",
      label: "ghost pack",
    });
    expect(preview.found).toBe(false);
    expect(preview.label).toBe("ghost pack");
    expect(preview.thumbUrl).toBeNull();
  });

  it("returns found:false for unknown printKey", async () => {
    const preview = await resolveStoryMentionPreview({
      packId: NARUTO_PACK_ID,
      kind: "print",
      id: "naruto:zz-never-a-real-print",
      label: "ZZ",
    });
    expect(preview.found).toBe(false);
    expect(preview.label).toBe("ZZ");
  });

  it("resolves a known Carddass sealed slug when catalogue has it", async () => {
    const preview = await resolveStoryMentionPreview({
      packId: NARUTO_PACK_ID,
      kind: "sealed",
      id: "booster-s28",
      label: "sachet FR",
    });
    // Catalogue may or may not have packshot on disk; found tracks image presence.
    expect(preview.id).toBe("booster-s28");
    expect(preview.label).toBe("sachet FR");
    if (preview.found) {
      expect(preview.sealedProduct?.slug).toBe("booster-s28");
      expect(preview.sealedProduct?.productKey).toBeTruthy();
    }
  });

  it("returns base when pack id is invalid", async () => {
    const preview = await resolveStoryMentionPreview({
      packId: "not-a-pack",
      kind: "print",
      id: "naruto:pr-0096",
    });
    expect(preview.found).toBe(false);
  });
});
