import { describe, expect, it, vi } from "vitest";

import { compositeOptionalOverlay } from "./layerComposite";

describe("compositeOptionalOverlay", () => {
  it("returns the base when no overlay URL is set", async () => {
    const base = { width: 2, height: 2 } as ImageBitmap;
    await expect(compositeOptionalOverlay(base, null, vi.fn())).resolves.toBe(
      base,
    );
    await expect(
      compositeOptionalOverlay(base, undefined, vi.fn()),
    ).resolves.toBe(base);
  });

  it("returns the base when the overlay fetch fails", async () => {
    const base = { width: 2, height: 2 } as ImageBitmap;
    const fetchBitmap = vi.fn().mockRejectedValue(new Error("404"));
    await expect(
      compositeOptionalOverlay(base, "/missing.webp", fetchBitmap),
    ).resolves.toBe(base);
    expect(fetchBitmap).toHaveBeenCalledWith("/missing.webp");
  });
});
