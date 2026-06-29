import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./fetch", () => ({
  fetchFromPicClick: vi.fn(),
  fetchPicClickProductsByQuery: vi.fn(),
  fetchPricesFromPicClick: vi.fn(),
}));

import { fetchFromPicClick } from "./fetch";
import { picclickModule } from "./index";

describe("picclickModule runMappingProbe", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns blocked when the marketplace scrape times out", async () => {
    vi.mocked(fetchFromPicClick).mockRejectedValue(
      new Error("Request timeout after 6000ms"),
    );

    const result = await picclickModule.runMappingProbe?.();

    expect(result?.statusHint).toBe("blocked");
    expect(result?.reason).toContain("timed out");
    expect(fetchFromPicClick).toHaveBeenCalledTimes(2);
  });

  it("returns empty when the sample barcode has no listings", async () => {
    vi.mocked(fetchFromPicClick).mockResolvedValue([]);

    const result = await picclickModule.runMappingProbe?.();

    expect(result?.statusHint).toBe("empty");
    expect(result?.reason).toContain("No PicClick listings");
  });
});
