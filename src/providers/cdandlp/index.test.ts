import { describe, expect, it } from "vitest";

import { mapCdandlpMetadata } from "./index";
import type { CdandlpListing } from "./parse";

const TOY_STORY_LD: CdandlpListing = {
  id: "118938116",
  formatSlug: "laser-disc",
  formatLabel: "Laser Disc",
  title: "Toy story",
  sourceUrl:
    "https://www.cdandlp.com/walt-disney-toy-story/toy-story-ld-laserdisc-france/laser-disc/r118938116/",
  barcode: "3459370676105",
  country: "France",
  year: 1995,
  publisher: "Walt disney home video",
  priceEur: 25,
  imageUrl: "https://img.cdandlp.com/2017/09/imgL/118938116.jpg",
};

describe("mapCdandlpMetadata", () => {
  it("maps cover + price for a LaserDisc listing under movies", () => {
    const meta = mapCdandlpMetadata(TOY_STORY_LD, "movies");
    expect(meta?.title).toBe("Toy story");
    expect(meta?.barcode).toBe("3459370676105");
    expect(meta?.imageUrl).toBe(
      "https://img.cdandlp.com/2017/09/imgL/118938116.jpg",
    );
    expect(meta?.attachments).toEqual([
      expect.objectContaining({
        type: "cover",
        role: "fr",
        source: "cdandlp",
        url: "https://img.cdandlp.com/2017/09/imgL/118938116.jpg",
      }),
    ]);
    expect(meta?.facts?.find((f) => f.kind === "price")).toMatchObject({
      value: "25,00 €",
      source: "cdandlp",
    });
    expect(meta?.facts?.find((f) => f.kind === "media-format")).toMatchObject({
      value: "Laser Disc",
    });
    expect(meta?.externalIds?.cdandlp).toBe("118938116");
  });

  it("infers cover region from listing slug when pressage country is missing", () => {
    const meta = mapCdandlpMetadata(
      {
        ...TOY_STORY_LD,
        country: undefined,
      },
      "movies",
    );
    expect(meta?.attachments?.[0]?.role).toBe("fr");
  });

  it("rejects laser-disc listings for musics", () => {
    expect(mapCdandlpMetadata(TOY_STORY_LD, "musics")).toBeNull();
  });
});
