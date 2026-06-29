import { describe, expect, it } from "vitest";

const { PROVIDER_MODULES } = await import("@/services/provider/registry");

describe("game metadata provider modules", () => {
  const gameAdapterIds = PROVIDER_MODULES.flatMap((mdl) =>
    mdl.createMetadataAdapter && mdl.info.types.includes("games")
      ? [mdl.info.id]
      : [],
  );

  it("registers each game adapter against a known game provider", () => {
    for (const id of gameAdapterIds) {
      const provider = PROVIDER_MODULES.find((mdl) => mdl.info.id === id);
      expect(provider?.info.types).toContain("games");
    }
  });

  it("keeps stable core game adapter ids", () => {
    expect(gameAdapterIds.sort()).toEqual(
      [
        "achatmoinscher",
        "apriloshop",
        "chipweld",
        "chocobonplan",
        "ebay",
        "geedie",
        "coverproject",
        "howlongtobeat",
        "icollect",
        "igdb",
        "launchbox",
        "picclick",
        "pricecharting",
        "rawg",
        "screenscraper",
        "steam",
        "steamgriddb",
        "thegamesdb",
        "tokyogamestory",
      ].sort(),
    );
  });

  it("registers media URL inference on providers that own CDN URL patterns", () => {
    const screenscraper = PROVIDER_MODULES.find(
      (mdl) => mdl.info.id === "screenscraper",
    );
    expect(screenscraper?.inferImageAttachmentFromMediaUrl).toBeTypeOf(
      "function",
    );
    expect(
      screenscraper?.inferImageAttachmentFromMediaUrl?.(
        "https://api.screenscraper.fr/api2/mediaJeu.php?jeuid=1&media=box-2D(fr)",
      ),
    ).toMatchObject({ type: "cover", source: "screenscraper" });
  });
});
