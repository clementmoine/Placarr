import { describe, expect, it } from "vitest";

import {
  consoleShelfRejectsWebOnlyGameMetadata,
  shouldSkipRedundantBookScrapeRound,
} from "./fetch";
import type { ProviderInfo } from "@/types/providerRegistry";
import type { MetadataResult } from "@/types/metadataProvider";

describe("consoleShelfRejectsWebOnlyGameMetadata", () => {
  it("rejects web-only catalog hits when the shelf targets a physical release", () => {
    expect(
      consoleShelfRejectsWebOnlyGameMetadata(
        {
          title: "Halo",
          facts: [{ kind: "platform", label: "Platform", value: "Web" }],
        },
        "xbox",
      ),
    ).toBe(true);
  });

  it("allows web facts when the shelf targets PC", () => {
    expect(
      consoleShelfRejectsWebOnlyGameMetadata(
        {
          title: "Civilization",
          facts: [{ kind: "platform", label: "Platform", value: "Web" }],
        },
        "pc",
      ),
    ).toBe(false);
  });

  it("allows mixed platform facts on a physical shelf", () => {
    expect(
      consoleShelfRejectsWebOnlyGameMetadata(
        {
          title: "Halo",
          facts: [
            { kind: "platform", label: "Platform", value: "Web" },
            { kind: "platform", label: "Platform", value: "Xbox" },
          ],
        },
        "xbox",
      ),
    ).toBe(false);
  });
});

describe("shouldSkipRedundantBookScrapeRound", () => {
  const secondaryScrape = {
    id: "decitre",
    auth: { kind: "scrape" as const },
    isSecondary: true,
  } as ProviderInfo;

  const primaryScrape = {
    id: "booknode",
    auth: { kind: "scrape" as const },
    isSecondary: false,
  } as ProviderInfo;

  const titledCover: MetadataResult = {
    title: "Astérix",
    imageUrl: "https://cdn.example/cover.jpg",
  };

  it("skips secondary scrapes once title+cover exist (preview and background)", () => {
    expect(
      shouldSkipRedundantBookScrapeRound(
        "books",
        secondaryScrape,
        [titledCover],
        false,
      ),
    ).toBe(true);
    expect(
      shouldSkipRedundantBookScrapeRound(
        "books",
        secondaryScrape,
        [titledCover],
        true,
      ),
    ).toBe(true);
  });

  it("does not skip primary scrapes here (Pass 2 gate owns that)", () => {
    expect(
      shouldSkipRedundantBookScrapeRound(
        "books",
        primaryScrape,
        [titledCover],
        true,
      ),
    ).toBe(false);
    expect(
      shouldSkipRedundantBookScrapeRound(
        "books",
        primaryScrape,
        [titledCover],
        false,
      ),
    ).toBe(false);
  });

  it("still runs secondary scrapes when cover is missing", () => {
    expect(
      shouldSkipRedundantBookScrapeRound(
        "books",
        secondaryScrape,
        [{ title: "Astérix" }],
        true,
      ),
    ).toBe(false);
  });
});
