import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findCachedRemoteImageUpload,
  persistRemoteImageUpload,
} from "./remoteImageDiskCache";

const tmpRoot = path.join(os.tmpdir(), `placarr-img-cache-${process.pid}`);
const uploads = path.join(tmpRoot, "public", "uploads");

describe("remoteImageDiskCache", () => {
  beforeEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(uploads, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(tmpRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("persists and finds a remote image by URL hash", () => {
    const url =
      "https://cdn1.booknode.com/book_cover/5518/full/example-5517967.jpg";
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    const written = persistRemoteImageUpload(url, buffer, {
      contentType: "image/jpeg",
      sourceUrl: url,
    });

    expect(written.publicPath.startsWith("/uploads/")).toBe(true);
    expect(fs.existsSync(written.absolutePath)).toBe(true);

    const hit = findCachedRemoteImageUpload(url);
    expect(hit?.publicPath).toBe(written.publicPath);
    expect(hit?.buffer.equals(buffer)).toBe(true);
  });

  it("returns null when nothing is cached", () => {
    expect(
      findCachedRemoteImageUpload("https://cdn1.booknode.com/missing.jpg"),
    ).toBeNull();
  });
});
