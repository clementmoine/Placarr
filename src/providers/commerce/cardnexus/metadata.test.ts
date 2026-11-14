import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchCardnexusCardForPrintKey, cardnexusApiKey } = vi.hoisted(() => ({
  fetchCardnexusCardForPrintKey: vi.fn(),
  cardnexusApiKey: vi.fn(() => "test-key"),
}));

vi.mock("./match", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./match")>();
  return {
    ...actual,
    fetchCardnexusCardForPrintKey: (...args: unknown[]) =>
      fetchCardnexusCardForPrintKey(...args),
  };
});

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    cardnexusApiKey: (...args: unknown[]) => cardnexusApiKey(...args),
  };
});

import { PROVIDER_MODULES } from "@/core/catalog/catalog";

const cardnexusModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "cardnexus",
)!;

describe("cardnexus createMetadataAdapter", () => {
  beforeEach(() => {
    fetchCardnexusCardForPrintKey.mockReset();
    cardnexusApiKey.mockReset();
    cardnexusApiKey.mockReturnValue("test-key");
  });

  it("exposes cover + SKU facts from a printKey hit", async () => {
    fetchCardnexusCardForPrintKey.mockResolvedValue({
      id: 42,
      name: "Jessie, Lively Cowgirl",
      gameId: "lorcana",
      printNumber: "223",
      expansionCode: "12",
      sourceUrl: "https://cardnexus.com/product/42",
      newCents: 199,
      foilCents: null,
      imageUrl: "https://img.cardnexus.com/lorcana/j.jpg/p1200.png",
      productType: "card",
      productCategory: null,
      externalIds: { cardmarket: [{ id: 99, finish: "NonFoil" }] },
    });

    const adapter = cardnexusModule.createMetadataAdapter!();
    const meta = await adapter.resolve({
      name: "Jessie, Lively Cowgirl",
      type: "tcg",
      printKey: "lorcana:12-223",
    });

    expect(fetchCardnexusCardForPrintKey).toHaveBeenCalledWith(
      "lorcana:12-223",
      expect.objectContaining({ requirePrices: false }),
    );
    expect(meta?.imageUrl).toContain("img.cardnexus.com");
    expect(meta?.attachments?.[0]?.source).toBe("cardnexus");
    expect(meta?.externalIds?.cardnexus).toBe("42");
    expect(meta?.facts?.some((fact) => fact.label === "Cardmarket")).toBe(
      true,
    );
    expect(meta?.facts?.some((fact) => fact.kind === "external-link")).toBe(
      true,
    );
  });

  it("returns null without an API key", async () => {
    cardnexusApiKey.mockReturnValue("");
    const adapter = cardnexusModule.createMetadataAdapter!();
    const meta = await adapter.resolve({
      name: "Jessie",
      type: "tcg",
      printKey: "lorcana:12-223",
    });
    expect(meta).toBeNull();
    expect(fetchCardnexusCardForPrintKey).not.toHaveBeenCalled();
  });
});
