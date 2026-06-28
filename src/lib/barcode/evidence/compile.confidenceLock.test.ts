import { describe, expect, it } from "vitest";

import { compileResultForType } from "./compile";

/**
 * CONFIDENCE / PLATFORM lock — the safety net for the override unification.
 *
 * The existing `compile.consensusOverride.test.ts` asserts the leader's TITLE and
 * the absence of wrong-edition alternates, but never the *confidence number* or
 * the *platformKey*. Those two dimensions are the only thing the marketplace
 * overrides still uniquely protect (a consensus-contradicted canonical must not
 * impose its platform, and its demotion shapes the final confidence). Before any
 * refactor that replaces the three overrides with one consensus-derived rule,
 * these values pin today's correct behaviour so a silent confidence/platform
 * regression fails loudly. Values are deterministic (pure compile over fixtures,
 * no network) and captured from the current pipeline. See
 * docs/barcode_consensus_refactor.md §3.
 *
 * If a deliberate change moves one of these, update the expected value in the
 * same commit — never delete the assertion.
 */

type Src = {
  providerName: string;
  products: { name: string; platformKey?: string }[];
};

const compile = (barcode: string, sources: Src[]) =>
  compileResultForType("games", sources, barcode);

describe("contradicted-canonical confidence/platform lock", () => {
  it("#3307210117168 — a contradicted '… 2 / xbox' canonical cannot impose its platform", async () => {
    const result = await compile("3307210117168", [
      {
        providerName: "ScreenScraper",
        products: [{ name: "Tom Clancy's Ghost Recon 2", platformKey: "xbox" }],
      },
      {
        providerName: "PicClick",
        products: [{ name: "Tom Clancy's Ghost Recon", platformKey: "pc" }],
      },
      {
        providerName: "AchatMoinsCher",
        products: [{ name: "Tom Clancy's Ghost Recon", platformKey: "pc" }],
      },
      {
        providerName: "Freakxy",
        products: [{ name: "Tom Clancy's Ghost Recon", platformKey: "pc" }],
      },
    ]);

    expect(result?.matches[0]?.name).toBe("Tom Clancy's Ghost Recon");
    expect(result?.platformKey).toBe("pc");
    expect(result?.matches[0]?.confidence).toBe(0.55);
    expect(result?.matches).toHaveLength(1);
  });

  it("#3307210117168 — dominant single-marketplace volume denies the '2' (Classics kept)", async () => {
    const result = await compile("3307210117168", [
      {
        providerName: "ScreenScraper",
        products: [{ name: "Tom Clancy's Ghost Recon 2", platformKey: "xbox" }],
      },
      {
        providerName: "PicClick",
        products: [
          {
            name: "Tom Clancy's Ghost Recon - Big Box - PC",
            platformKey: "pc",
          },
          {
            name: "Tom Clancy's Ghost Recon Version Française",
            platformKey: "xbox",
          },
          {
            name: "Tom Clancy's Ghost Recon pour PC Big Box",
            platformKey: "pc",
          },
          { name: "Ghost Recon Xbox", platformKey: "xbox" },
          { name: "Tom Clancy's Ghost Recon Classics", platformKey: "xbox" },
        ],
      },
      {
        providerName: "AchatMoinsCher",
        products: [{ name: "Ghost Recon", platformKey: "xbox" }],
      },
    ]);

    expect(result?.matches[0]?.name).toBe(
      "Tom Clancy's Ghost Recon — Classics",
    );
    expect(result?.platformKey).toBeNull();
    expect(result?.matches[0]?.confidence).toBe(0.45);
    expect(result?.matches).toHaveLength(1);
  });

  it("#3307210117168 — an uncorroborated edition subtitle (Island Thunder) is denied on xbox", async () => {
    const result = await compile("3307210117168", [
      {
        providerName: "ScreenScraper",
        products: [
          { name: "Ghost Recon : Island Thunder", platformKey: "xbox" },
        ],
      },
      {
        providerName: "PicClick",
        products: [
          {
            name: "Tom Clancy's Ghost Recon Classics Xbox",
            platformKey: "xbox",
          },
          {
            name: "Tom Clancy's Ghost Recon Version Française Xbox",
            platformKey: "xbox",
          },
          { name: "Ghost Recon Xbox", platformKey: "xbox" },
          {
            name: "Tom Clancy's Ghost Recon 1 sans notice Xbox",
            platformKey: "xbox",
          },
          { name: "Ghost Recon Classics Edition Xbox", platformKey: "xbox" },
          {
            name: "Tom Clancy's Ghost Recon pour PC - Complet FRA - Big Box Ubisoft Rainbow six",
            platformKey: "pc",
          },
        ],
      },
      {
        providerName: "AchatMoinsCher",
        products: [{ name: "Tom Clancy's Ghost Recon", platformKey: "xbox" }],
      },
    ]);

    expect(result?.matches[0]?.name).toBe(
      "Tom Clancy's Ghost Recon — Classics",
    );
    expect(result?.platformKey).toBe("xbox");
    expect(result?.matches[0]?.confidence).toBe(0.47);
    expect(result?.matches).toHaveLength(1);
  });

  it("#4005209105378 — short-franchise 'de Blob 2' denied, base leads at full confidence", async () => {
    const result = await compile("4005209105378", [
      {
        providerName: "ScreenScraper",
        products: [{ name: "de Blob 2", platformKey: "wii" }],
      },
      {
        providerName: "PriceCharting",
        products: [{ name: "De Blob Nintendo Wii", platformKey: "wii" }],
      },
      {
        providerName: "AchatMoinsCher",
        products: [{ name: "De Blob", platformKey: "wii" }],
      },
      {
        providerName: "Freakxy",
        products: [{ name: "De Blob Nintendo Wii", platformKey: "wii" }],
      },
      {
        providerName: "PicClick",
        products: [
          { name: "De Blob Nintendo Wii", platformKey: "wii" },
          {
            name: "De Blob Nintendo Wii Edition Fr Pal Complet",
            platformKey: "wii",
          },
          { name: "de BLOB Nintendo Wii Pal neuf", platformKey: "wii" },
        ],
      },
    ]);

    expect(result?.matches[0]?.name).toBe("De Blob");
    expect(result?.platformKey).toBe("wii");
    expect(result?.matches[0]?.confidence).toBe(0.98);
    expect(result?.matches).toHaveLength(1);
  });

  it("#083717120032 — a peer canonical + listings deny the 'III' edition", async () => {
    const result = await compile("083717120032", [
      {
        providerName: "ScreenScraper",
        products: [
          {
            name: "Teenage Mutant Ninja Turtles III : The Manhattan Project",
            platformKey: "nes",
          },
        ],
      },
      {
        providerName: "ScanDex",
        products: [
          { name: "Teenage Mutant Ninja Turtles", platformKey: "nes" },
        ],
      },
      {
        providerName: "PicClick",
        products: [
          {
            name: "Teenage Mutant Ninja Turtles (Nintendo NES, 1989)",
            platformKey: "nes",
          },
          { name: "Teenage Mutant Ninja Turtles NES CIB", platformKey: "nes" },
          { name: "Teenage Mutant Hero Turtles NES", platformKey: "nes" },
        ],
      },
      {
        providerName: "ChasseAuxLivres",
        products: [{ name: "Teenage Mutant Hero Turtles", platformKey: "nes" }],
      },
    ]);

    expect(result?.matches[0]?.name).toBe("Teenage Mutant Ninja Turtles");
    expect(result?.platformKey).toBe("nes");
    expect(result?.matches[0]?.confidence).toBe(0.98);
    expect(result?.matches).toHaveLength(1);
  });

  it("#083717120131 — no anchor: the massively-named 'II Arcade' edition leads", async () => {
    const result = await compile("083717120131", [
      {
        providerName: "PriceCharting",
        products: [
          { name: "Teenage Mutant Ninja Turtles", platformKey: "nes" },
        ],
      },
      {
        providerName: "PicClick",
        products: [
          {
            name: "Teenage Mutant Ninja Turtles II: The Arcade Game (Nintendo NES, 1991 PAL A)",
            platformKey: "nes",
          },
          {
            name: "Teenage Mutant Ninja Turtles II Arcade TMNT NES Complete CIB",
            platformKey: "nes",
          },
          {
            name: "Teenage Mutant Hero Turtles II - The Arcade Game",
            platformKey: "nes",
          },
          {
            name: "Turtles 2 The Arcade Game Nintendo Nes",
            platformKey: "nes",
          },
        ],
      },
      {
        providerName: "ChasseAuxLivres",
        products: [
          {
            name: "Teenage Mutant Hero Turtles II The Arcade Game",
            platformKey: "nes",
          },
        ],
      },
    ]);

    expect(result?.matches[0]?.name).toBe(
      "Teenage Mutant Ninja Turtles II: The Arcade Game",
    );
    expect(result?.platformKey).toBe("nes");
    expect(result?.matches[0]?.confidence).toBe(0.51);
    expect(result?.matches).toHaveLength(1);
  });
});
