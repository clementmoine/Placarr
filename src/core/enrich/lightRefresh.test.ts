import { describe, expect, it } from "vitest";

import { isLightRefreshEligible } from "./lightRefresh";
import { scrapeProvidersForMetadataPass } from "./scrapePassGate";
import { stage1HasMetadataCapability } from "./metadataFetchGating";
import type { MetadataResult } from "@/types/metadataProvider";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 25);

/** A hardware fiche as stored: ScreenScraper cover, aligned title, gallery. */
function storedHardware(
  overrides: Partial<MetadataResult> = {},
): MetadataResult {
  return {
    title: "PlayStation 3 Slim",
    imageUrl: "/uploads/ps3-slim.jpg",
    description: "Console Sony",
    attachments: [
      {
        type: "cover",
        url: "/uploads/ps3-slim.jpg",
        source: "screenscraper",
        role: "fr",
      },
    ],
    ...overrides,
  };
}

describe("isLightRefreshEligible", () => {
  it("accepts a canonical, aligned fiche with recent prices", () => {
    expect(
      isLightRefreshEligible({
        type: "hardware",
        itemName: "PlayStation 3 Slim",
        stored: storedHardware(),
        priceLastUpdated: new Date(NOW - DAY_MS),
        now: NOW,
      }),
    ).toBe(true);
  });

  it("refuses when prices are stale", () => {
    expect(
      isLightRefreshEligible({
        type: "hardware",
        itemName: "PlayStation 3 Slim",
        stored: storedHardware(),
        priceLastUpdated: new Date(NOW - 30 * DAY_MS),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("refuses when the item was never priced", () => {
    expect(
      isLightRefreshEligible({
        type: "hardware",
        itemName: "PlayStation 3 Slim",
        stored: storedHardware(),
        priceLastUpdated: null,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("refuses when the stored title drifted from the item name", () => {
    expect(
      isLightRefreshEligible({
        type: "hardware",
        itemName: "Nintendo 64",
        stored: storedHardware(),
        priceLastUpdated: new Date(NOW - DAY_MS),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("refuses a marketplace listing photo as the only cover", () => {
    expect(
      isLightRefreshEligible({
        type: "hardware",
        itemName: "PlayStation 3 Slim",
        stored: storedHardware({
          attachments: [
            {
              type: "cover",
              url: "/uploads/bm-listing.jpg",
              source: "backmarket",
              role: "fr",
            },
          ],
        }),
        priceLastUpdated: new Date(NOW - DAY_MS),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("refuses without a stored fiche", () => {
    expect(
      isLightRefreshEligible({
        type: "hardware",
        itemName: "PlayStation 3 Slim",
        stored: null,
        priceLastUpdated: new Date(NOW - DAY_MS),
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe("scrapeProvidersForMetadataPass — light refresh", () => {
  const complete: MetadataResult[] = [
    {
      title: "PlayStation 3 Slim",
      imageUrl: "/uploads/ps3-slim.jpg",
      description: "Console Sony",
    },
  ];

  it("drops even the pinned scrapes when the fiche is fresh", () => {
    expect(
      scrapeProvidersForMetadataPass({
        type: "hardware",
        activeResults: complete,
        existingScrapeProviderIds: ["backmarket"],
        candidateScrapeProviderIds: ["backmarket", "chocobonplan"],
        hasCapability: stage1HasMetadataCapability,
        lightRefresh: true,
      }),
    ).toEqual([]);
  });

  it("still runs every candidate when a capability is missing", () => {
    expect(
      scrapeProvidersForMetadataPass({
        type: "hardware",
        activeResults: [{ title: "PlayStation 3 Slim" }],
        existingScrapeProviderIds: ["backmarket"],
        candidateScrapeProviderIds: ["backmarket", "chocobonplan"],
        hasCapability: stage1HasMetadataCapability,
        lightRefresh: true,
      }),
    ).toEqual(["backmarket", "chocobonplan"]);
  });

  it("keeps refreshing pinned scrapes without light refresh", () => {
    expect(
      scrapeProvidersForMetadataPass({
        type: "hardware",
        activeResults: complete,
        existingScrapeProviderIds: ["backmarket"],
        candidateScrapeProviderIds: ["backmarket", "chocobonplan"],
        hasCapability: stage1HasMetadataCapability,
      }),
    ).toEqual(["backmarket"]);
  });
});
