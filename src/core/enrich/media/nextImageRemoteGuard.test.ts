import { describe, expect, it } from "vitest";

import { isAllowedNextImageRemoteUrl } from "./nextImageRemoteGuard";

describe("nextImageRemoteGuard", () => {
  it("allows known provider CDN hosts", () => {
    const samples = [
      "https://cdn1.booknode.com/book_cover/1/full.jpg",
      "https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg",
      "https://imagedelivery.net/account/image/public",
      "https://storage.googleapis.com/images.pricecharting.com/abc/1600.jpg",
      "https://media.senscritique.com/media/0/picture.jpg",
      "https://www.monsieurde.com/1218-large_default/black-stories.jpg",
    ];
    for (const url of samples) {
      expect(isAllowedNextImageRemoteUrl(url), url).toBe(true);
    }
  });

  it("allows local uploads served through the optimizer", () => {
    expect(isAllowedNextImageRemoteUrl("/uploads/covers/foo.webp")).toBe(true);
  });

  it("blocks private and loopback hosts", () => {
    const blocked = [
      "https://127.0.0.1/secret.jpg",
      "https://localhost/admin.jpg",
      "https://192.168.1.1/router.jpg",
      "https://10.0.0.5/internal.jpg",
      "https://169.254.169.254/latest/meta-data/",
    ];
    for (const url of blocked) {
      expect(isAllowedNextImageRemoteUrl(url), url).toBe(false);
    }
  });

  it("blocks hosts outside the registry allowlist", () => {
    expect(
      isAllowedNextImageRemoteUrl("https://evil.example.com/payload.jpg"),
    ).toBe(false);
    expect(isAllowedNextImageRemoteUrl("https://example.com/image.jpg")).toBe(
      false,
    );
  });

  it("rejects non-https remote URLs", () => {
    expect(isAllowedNextImageRemoteUrl("http://cdn1.booknode.com/x.jpg")).toBe(
      false,
    );
  });
});
