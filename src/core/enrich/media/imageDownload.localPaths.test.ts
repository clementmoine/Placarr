import { describe, expect, it, vi } from "vitest";

/**
 * `downloadRemoteImage` localizes remote covers, but it is also the gate every
 * already-local path goes through on item creation. A card picked from a local
 * pack arrives as `/assets/<pack>/…`; dropping it there left the item with no
 * image at all, since a closed corpus has no remote URL to fall back on.
 */
vi.mock("@/core/catalog/catalog", () => ({
  PROVIDERS: [],
  providerModuleForCoverDownload: () => null,
}));

describe("downloadRemoteImage — already-local paths", () => {
  it("keeps a pack asset served from disk", async () => {
    const { downloadRemoteImage } = await import("./imageDownload");
    await expect(
      downloadRemoteImage("/assets/naruto/carddass/cards/s5/fr/ni253/art.webp"),
    ).resolves.toBe("/assets/naruto/carddass/cards/s5/fr/ni253/art.webp");
  });

  it("keeps a previously localized upload", async () => {
    const { downloadRemoteImage } = await import("./imageDownload");
    await expect(downloadRemoteImage("/uploads/abc123.webp")).resolves.toBe(
      "/uploads/abc123.webp",
    );
  });

  it("still refuses any other absolute path", async () => {
    const { downloadRemoteImage } = await import("./imageDownload");
    // Not a served location: storing it would point the item at nothing.
    await expect(downloadRemoteImage("/etc/passwd")).resolves.toBeNull();
    await expect(downloadRemoteImage("/random/cover.png")).resolves.toBeNull();
  });

  it("does not mistake a lookalike prefix for the assets root", async () => {
    const { downloadRemoteImage } = await import("./imageDownload");
    await expect(
      downloadRemoteImage("/assetsomething/x.webp"),
    ).resolves.toBeNull();
  });
});
