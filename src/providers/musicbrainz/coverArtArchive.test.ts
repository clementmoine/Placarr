import { describe, expect, it } from "vitest";

import {
  attachmentsFromCoverArtArchive,
  caaImageRole,
  normalizeCaaUrl,
} from "./coverArtArchive";

describe("normalizeCaaUrl", () => {
  it("upgrades CAA http to https", () => {
    expect(
      normalizeCaaUrl(
        "http://coverartarchive.org/release/x/1.jpg",
      ),
    ).toBe("https://coverartarchive.org/release/x/1.jpg");
  });
});

describe("caaImageRole", () => {
  it("maps Front / Back / Spine-only / Medium", () => {
    expect(caaImageRole({ types: ["Front"], front: true })).toBe("front");
    expect(caaImageRole({ types: ["Back"], back: true })).toBe("back");
    expect(caaImageRole({ types: ["Spine"] })).toBe("spine");
    expect(caaImageRole({ types: ["Medium"] })).toBe("disc");
  });

  it("treats Back+Spine wraparound as back, not spine", () => {
    expect(caaImageRole({ types: ["Back", "Spine"], back: true })).toBe(
      "back",
    );
  });

  it("ignores booklet / tray", () => {
    expect(caaImageRole({ types: ["Booklet"] })).toBeNull();
    expect(caaImageRole({ types: ["Tray"] })).toBeNull();
  });
});

describe("attachmentsFromCoverArtArchive", () => {
  it("emits front, back, dedicated spine and disc when present", () => {
    const attachments = attachmentsFromCoverArtArchive({
      images: [
        {
          front: true,
          types: ["Front"],
          image: "http://coverartarchive.org/release/x/front.jpg",
          thumbnails: {
            "1200": "http://coverartarchive.org/release/x/front-1200.jpg",
          },
        },
        {
          back: true,
          types: ["Back", "Spine"],
          image: "http://coverartarchive.org/release/x/back.jpg",
        },
        {
          types: ["Spine"],
          image: "http://coverartarchive.org/release/x/spine.jpg",
        },
        {
          types: ["Medium"],
          image: "http://coverartarchive.org/release/x/disc.jpg",
        },
        {
          types: ["Booklet"],
          image: "http://coverartarchive.org/release/x/booklet.jpg",
        },
      ],
    });

    expect(attachments).toEqual([
      expect.objectContaining({
        role: "front",
        url: "https://coverartarchive.org/release/x/front-1200.jpg",
      }),
      expect.objectContaining({
        role: "back",
        url: "https://coverartarchive.org/release/x/back.jpg",
      }),
      expect.objectContaining({
        role: "spine",
        url: "https://coverartarchive.org/release/x/spine.jpg",
      }),
      expect.objectContaining({
        role: "disc",
        url: "https://coverartarchive.org/release/x/disc.jpg",
      }),
    ]);
  });

  it("does not invent a spine from Back+Spine alone", () => {
    const attachments = attachmentsFromCoverArtArchive({
      images: [
        {
          front: true,
          types: ["Front"],
          image: "https://coverartarchive.org/release/x/front.jpg",
        },
        {
          back: true,
          types: ["Back", "Spine"],
          image: "https://coverartarchive.org/release/x/back.jpg",
        },
      ],
    });
    expect(attachments.map((a) => a.role)).toEqual(["front", "back"]);
  });
});
