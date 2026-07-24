import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploadImage = vi.fn();

vi.mock("@/lib/api/upload", () => ({
  uploadImage: (...args: unknown[]) => uploadImage(...args),
}));

import {
  canonicalRemoteImageUrl,
  localizeImageFieldForSubmit,
  submitFetchUrlForRemoteImage,
} from "./localizeImageForSubmit";

const BOOKNODE =
  "https://cdn1.booknode.com/book_cover/81/full/soul-eater-tome-1-81053.jpg";

describe("localizeImageForSubmit", () => {
  beforeEach(() => {
    uploadImage.mockReset();
    uploadImage.mockResolvedValue("/uploads/localized.jpg");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns local upload paths unchanged", async () => {
    await expect(
      localizeImageFieldForSubmit("/uploads/existing.jpg"),
    ).resolves.toBe("/uploads/existing.jpg");
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("uploads File values directly", async () => {
    const file = new File(["x"], "scan.jpg", { type: "image/jpeg" });
    await expect(localizeImageFieldForSubmit(file)).resolves.toBe(
      "/uploads/localized.jpg",
    );
    expect(uploadImage).toHaveBeenCalledWith(file, {});
  });

  it("passes through remote URLs that do not need the UI proxy", async () => {
    const openLibrary = "https://covers.openlibrary.org/b/id/12345-L.jpg";
    await expect(localizeImageFieldForSubmit(openLibrary)).resolves.toBe(
      openLibrary,
    );
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("fetches referer-protected URLs via the proxy and uploads the blob", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(localizeImageFieldForSubmit(BOOKNODE)).resolves.toBe(
      "/uploads/localized.jpg",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/media/remote?url=${encodeURIComponent(BOOKNODE)}`,
      { credentials: "same-origin" },
    );
    expect(uploadImage).toHaveBeenCalledOnce();
    const uploadedFile = uploadImage.mock.calls[0]?.[0] as File;
    expect(uploadedFile).toBeInstanceOf(File);
    expect(uploadedFile.type).toBe("image/jpeg");
  });

  it("falls back to the original URL when proxy fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(localizeImageFieldForSubmit(BOOKNODE)).resolves.toBe(BOOKNODE);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("localizes proxy display paths back through the proxy", async () => {
    const proxyPath = `/api/media/remote?url=${encodeURIComponent(BOOKNODE)}`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(localizeImageFieldForSubmit(proxyPath)).resolves.toBe(
      "/uploads/localized.jpg",
    );
    expect(fetchMock).toHaveBeenCalledWith(proxyPath, {
      credentials: "same-origin",
    });
  });

  it("extracts canonical remote URLs from proxy paths", () => {
    expect(
      canonicalRemoteImageUrl(
        `/api/media/remote?url=${encodeURIComponent(BOOKNODE)}`,
      ),
    ).toBe(BOOKNODE);
  });

  it("builds submit fetch URLs only for proxy targets", () => {
    expect(submitFetchUrlForRemoteImage(BOOKNODE)).toBe(
      `/api/media/remote?url=${encodeURIComponent(BOOKNODE)}`,
    );
    expect(
      submitFetchUrlForRemoteImage(
        "https://covers.openlibrary.org/b/id/12345-L.jpg",
      ),
    ).toBeNull();
  });
});
