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

  it("affiche la région d'une jaquette ScreenScraper australienne (au → Europe)", () => {
    // Regression: a `box-2D(au)` cover was stored with role "au" and showed
    // "Jaquette" with no region because the resolver only knew the 6 canonical
    // codes. Australia is a PAL territory → Europe bucket.
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "au",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({
      provider: "ScreenScraper",
      kind: "Jaquette",
      region: "Europe",
      detail: "Jaquette · Europe",
    });
  });

  it("résout les régions ISO ScreenScraper sur les rôles composés", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "back-sp",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({ kind: "Dos", region: "Europe", detail: "Dos · Europe" });

    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "3d-au",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({
      kind: "Jaquette 3D",
      region: "Europe",
      detail: "Jaquette 3D · Europe",
    });

    expect(
      getAttachmentGalleryLabels({
        type: "image",
        role: "disc-br",
        source: "screenscraper",
        providerLabel: "ScreenScraper",
      }),
    ).toMatchObject({
      kind: "Disque",
      region: "États-Unis",
      detail: "Disque · États-Unis",
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

  it("normalise PriceCharting back cover from title", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "back-eu",
        title: "Back Cover (PAL)",
        source: "pricecharting",
        providerLabel: "PriceCharting",
      }),
    ).toMatchObject({
      provider: "PriceCharting",
      kind: "Dos",
      region: "Europe",
      detail: "Dos · Europe",
    });
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "eu",
        title: "Cover (Back) [GER]",
        source: "pricecharting",
        providerLabel: "PriceCharting",
      }),
    ).toMatchObject({
      kind: "Dos",
      detail: "Dos · Europe",
    });
  });

  it("normalise PriceCharting spine from title", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "eu",
        title: "Spine/Sides",
        source: "pricecharting",
        providerLabel: "PriceCharting",
      }),
    ).toMatchObject({
      provider: "PriceCharting",
      kind: "Tranche",
      region: "Europe",
      detail: "Tranche · Europe",
    });
  });

  it("normalise iCollect back cover from Main Image 2", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "back-us",
        title: "Devil May Cry - Main Image 2",
        source: "icollect",
        providerLabel: "iCollect Everything",
      }),
    ).toMatchObject({
      provider: "iCollect Everything",
      kind: "Dos",
      region: "États-Unis",
      detail: "Dos · États-Unis",
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

  it("affiche les grilles SteamGridDB avec leur style", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "grid-vertical",
        title: "SteamGridDB - alternate",
        source: "steamgriddb",
        providerLabel: "SteamGridDB",
        gridStyleCoverLabelsSource: true,
      }),
    ).toMatchObject({
      kind: "Grille",
      detail: "Grille · Alternate",
    });
  });

  it("affiche les grilles 3D SteamGridDB material", () => {
    expect(
      getAttachmentGalleryLabels({
        type: "cover",
        role: "3d-grid-vertical",
        title: "SteamGridDB - material",
        source: "steamgriddb",
        providerLabel: "SteamGridDB",
        gridStyleCoverLabelsSource: true,
      }),
    ).toMatchObject({
      kind: "Grille 3D",
      detail: "Grille 3D · Material",
    });
  });
});
