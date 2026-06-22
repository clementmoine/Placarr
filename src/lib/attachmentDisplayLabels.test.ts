import { describe, expect, it } from "vitest";

import { getAttachmentGalleryLabels } from "./attachmentDisplayLabels";

describe("attachmentDisplayLabels", () => {
  it("normalise ScreenScraper back/eu", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "back-eu",
        source: "screenscraper",
      }),
    ).toMatchObject({
      provider: "SS",
      kind: "Dos",
      region: "Europe",
      detail: "Dos · Europe",
    });
  });

  it("normalise LaunchBox Europe cover", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "europe",
        title: "Box - Front",
        source: "launchbox",
      }),
    ).toMatchObject({
      provider: "LaunchBox",
      kind: "Jaquette",
      region: "Europe",
      detail: "Jaquette · Europe",
    });
  });

  it("normalise LaunchBox back from title when role is legacy", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "europe",
        title: "Box - Back",
        source: "launchbox",
      }),
    ).toMatchObject({
      kind: "Dos",
      region: "Europe",
      detail: "Dos · Europe",
    });
  });

  it("normalise TheGamesDB cover region", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "eu",
        source: "thegamesdb",
      }),
    ).toMatchObject({
      provider: "TGDB",
      detail: "Jaquette · Europe",
    });
  });

  it("supports english labels", () => {
    expect(
      getAttachmentGalleryLabels(
        {
          type: "cover",
          role: "us",
          source: "igdb",
        },
        "en",
      ),
    ).toMatchObject({
      provider: "IGDB",
      detail: "Cover · United States",
    });
  });
});
