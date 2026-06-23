import { describe, expect, it } from "vitest";

import { getAttachmentGalleryLabels } from "./attachmentDisplayLabels";

describe("attachmentDisplayLabels", () => {
  it("normalise ScreenScraper back/eu (chip = registry label propagée)", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "back-eu",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({
      provider: "ScreenScraper",
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
        providerLabel: "LaunchBox",
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
        providerLabel: "LaunchBox",
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
        providerLabel: "TheGamesDB",
      }),
    ).toMatchObject({
      provider: "TheGamesDB",
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
          providerLabel: "IGDB",
        },
        "en",
      ),
    ).toMatchObject({
      provider: "IGDB",
      detail: "Cover · United States",
    });
  });

  it("garde les libellés des tags synthétiques (barcode → Scan)", () => {
    expect(
      getAttachmentGalleryLabels({ type: "image", source: "barcode" }),
    ).toMatchObject({ provider: "Scan" });
  });

  it("title-case une source provider inconnue sans label propagé", () => {
    expect(
      getAttachmentGalleryLabels({ type: "cover", source: "screenscraper" }),
    ).toMatchObject({ provider: "Screenscraper" });
  });
});
