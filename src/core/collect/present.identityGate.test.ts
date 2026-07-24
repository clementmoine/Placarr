import { describe, expect, it } from "vitest";

import { presentItemFromStorage } from "@/core/collect/present";
import { withProviderAttachmentTraits } from "@/core/catalog/sourceTraits";

describe("presentItemFromStorage identity gates (golden)", () => {
  it("keeps aligned marketplace cover and purges cross-generation PS One link on PS5", () => {
    const bmGoodCover =
      "https://d2e6ccujb3mkqf.cloudfront.net/good-ps5-cover.jpg";
    const presented = presentItemFromStorage({
      id: "item-ps5",
      name: "PlayStation 5",
      imageUrl: bmGoodCover,
      barcode: null,
      shelf: { type: "hardware", name: "Consoles" },
      metadata: {
        id: "meta-ps5",
        title: "PlayStation 5",
        description: null,
        duration: null,
        pageCount: null,
        tracksCount: null,
        releaseDate: null,
        imageUrl: bmGoodCover,
        heroImageUrl: null,
        aliases: null,
        sourceType: "hardware",
        sourceQuery: "",
        lastFetched: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        attachments: [
          withProviderAttachmentTraits({
            id: "att-bm",
            metadataId: "meta-ps5",
            type: "cover",
            source: "backmarket",
            url: bmGoodCover,
            title: "Sony PlayStation 5",
            duration: null,
            role: null,
            coverProvenance: null,
            platformKey: null,
            width: null,
            height: null,
            meanLuminance: null,
            darkPixelRatio: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
        ],
        facts: JSON.stringify([
          {
            kind: "external-link",
            label: "Back Market",
            value: "Voir la fiche",
            source: "backmarket",
            url: "https://www.backmarket.fr/fr-fr/p/console-sony-playstation-5/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          },
          {
            kind: "external-link",
            label: "Back Market",
            value: "Voir la fiche",
            source: "backmarket",
            url: "https://www.backmarket.fr/fr-fr/p/console-sony-playstation-1/ffffffff-1111-2222-3333-444444444444",
          },
        ]),
        priceOffers: [
          {
            source: "Back Market",
            sourceUrl:
              "https://www.backmarket.fr/fr-fr/p/console-sony-playstation-1/ffffffff-1111-2222-3333-444444444444",
            productName: "Sony PlayStation 1",
            rawValue: {
              productName: "Sony PlayStation 1",
              coverUrl:
                "https://d2e6ccujb3mkqf.cloudfront.net/wrong-ps1-cover.jpg",
              sourceUrl:
                "https://www.backmarket.fr/fr-fr/p/console-sony-playstation-1/ffffffff-1111-2222-3333-444444444444",
            },
          },
        ],
      },
    } as Parameters<typeof presentItemFromStorage>[0]);

    const linkUrls =
      presented.metadata?.facts
        ?.filter((fact) => fact.kind === "external-link")
        .map((fact) => fact.url) ?? [];
    expect(linkUrls.some((url) => url?.includes("playstation-5"))).toBe(true);
    expect(linkUrls.some((url) => url?.includes("playstation-1"))).toBe(false);

    const coverUrls =
      presented.metadata?.attachments?.map((attachment) => attachment.url) ??
      [];
    expect(coverUrls).toContain(bmGoodCover);
    expect(
      coverUrls.some((url) => url.includes("wrong-ps1-cover")),
    ).toBe(false);
  });

  it("keeps write-persisted BM Mega Drive cover without list priceOffers.rawValue", () => {
    const bmCover =
      "https://d2e6ccujb3mkqf.cloudfront.net/d0df7a5d-d274-4cad-948c-c26b697bdd7a-1.jpg";
    const presented = presentItemFromStorage({
      id: "item-md",
      name: "Sega Megadrive",
      imageUrl: null,
      barcode: null,
      shelf: { type: "hardware", name: "Consoles" },
      metadata: {
        id: "meta-md",
        title: "Sega Megadrive",
        description: null,
        duration: null,
        pageCount: null,
        tracksCount: null,
        releaseDate: null,
        imageUrl: null,
        heroImageUrl: null,
        aliases: null,
        facts: null,
        sourceType: "hardware",
        sourceQuery: "",
        lastFetched: new Date("2026-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        // Cover already persisted at price-offer write — list present has no
        // priceOffers payload (and must not need rawValue to show the cover).
        attachments: [
          withProviderAttachmentTraits({
            id: "att-bm-md",
            metadataId: "meta-md",
            type: "cover",
            source: "backmarket",
            url: bmCover,
            title: "Sega Mega Drive - Noir",
            duration: null,
            role: null,
            coverProvenance: null,
            platformKey: null,
            width: null,
            height: null,
            meanLuminance: null,
            darkPixelRatio: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
        ],
      },
    } as Parameters<typeof presentItemFromStorage>[0]);

    expect(
      presented.metadata?.attachments?.some(
        (attachment) => attachment.url === bmCover,
      ),
    ).toBe(true);
  });
});
