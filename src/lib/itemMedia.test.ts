import { describe, expect, it } from "vitest";

import { getCoverImage } from "./itemMedia";
import { getDisplayTitle, presentItem } from "./presentItem";

describe("getCoverImage", () => {
  it("uses canonical metadata.imageUrl when present", () => {
    expect(
      getCoverImage({
        metadata: {
          imageUrl: "/uploads/canonical-cover.jpg",
          attachments: [
            { type: "cover", source: "igdb", url: "/uploads/other.jpg" },
          ],
        },
      }),
    ).toBe("/uploads/canonical-cover.jpg");
  });

  it("prefers user local upload over metadata cover", () => {
    expect(
      getCoverImage({
        imageUrl: "/uploads/my-photo.jpg",
        metadata: {
          imageUrl: "/uploads/canonical-cover.jpg",
        },
      }),
    ).toBe("/uploads/my-photo.jpg");
  });

  it("scores front box art above back covers without provider priority", () => {
    expect(
      getCoverImage({
        metadata: {
          attachments: [
            {
              type: "cover",
              source: "provider-a",
              role: "back",
              url: "/uploads/back.jpg",
            },
            {
              type: "cover",
              source: "provider-b",
              role: "front",
              url: "/uploads/front.jpg",
            },
          ],
        },
      }),
    ).toBe("/uploads/front.jpg");
  });

  it("scores portrait box-like covers above landscape thumbnails", () => {
    expect(
      getCoverImage({
        metadata: {
          attachments: [
            {
              type: "cover",
              url: "/uploads/thumb-small.jpg",
              role: "thumb",
            },
            {
              type: "cover",
              url: "/uploads/box-front-large.jpg",
              role: "front box-2d",
            },
          ],
        },
      }),
    ).toBe("/uploads/box-front-large.jpg");
  });
});

describe("presentItem", () => {
  it("applies canonical title and cover across the payload", () => {
    const presented = presentItem({
      name: "Super Monkey Ball Banana Blitz Complet VF",
      imageUrl: null,
      metadata: {
        title: "Super Monkey Ball: Banana Blitz",
        imageUrl: "/uploads/cover.jpg",
      },
      shelf: { type: "games" },
    });

    expect(presented.name).toBe("Super Monkey Ball: Banana Blitz");
    expect(presented.storedName).toBe(
      "Super Monkey Ball Banana Blitz Complet VF",
    );
    expect(presented.imageUrl).toBe("/uploads/cover.jpg");
  });

  it("omits storedName when display title matches the stored name", () => {
    const presented = presentItem({
      name: "Mon jeu",
      metadata: { title: "Mon jeu" },
    });

    expect(presented.name).toBe("Mon jeu");
    expect(presented.storedName).toBeUndefined();
  });

  it("falls back to item name when metadata has no title", () => {
    expect(
      getDisplayTitle({
        name: "Mon jeu",
        metadata: {},
      }),
    ).toBe("Mon jeu");
  });
});
