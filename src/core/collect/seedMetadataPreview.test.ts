import { describe, expect, it } from "vitest";

import { asSeedableMetadataPreview } from "./seedMetadataPreview";

describe("asSeedableMetadataPreview", () => {
  it("accepts a preview with title and attachments", () => {
    const preview = asSeedableMetadataPreview({
      title: "Giana Sisters",
      attachments: [{ type: "cover", url: "https://example.com/a.jpg" }],
    });
    expect(preview?.title).toBe("Giana Sisters");
  });

  it("rejects empty objects", () => {
    expect(asSeedableMetadataPreview({})).toBeNull();
    expect(asSeedableMetadataPreview(null)).toBeNull();
    expect(asSeedableMetadataPreview("x")).toBeNull();
  });
});
