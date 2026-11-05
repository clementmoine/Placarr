import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  filesListFingerprint,
  localArtifactUnchanged,
  localFileFingerprint,
  recordLocalArtifactMeta,
  remoteArtifactUnchanged,
  validatorsFromResponseHeaders,
} from "./remoteArtifactFreshness";

describe("remoteArtifactFreshness", () => {
  let tmp: string;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmp) await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  });

  it("matches remote validators by etag first", () => {
    expect(
      remoteArtifactUnchanged(
        { url: "https://ex/a.zip", etag: '"v1"', lastModified: "Mon, 1 Jan 2024" },
        { url: "https://ex/a.zip", etag: '"v1"', lastModified: "Tue, 2 Jan 2024" },
      ),
    ).toBe(true);
    expect(
      remoteArtifactUnchanged(
        { url: "https://ex/a.zip", etag: '"v1"' },
        { url: "https://ex/a.zip", etag: '"v2"' },
      ),
    ).toBe(false);
  });

  it("falls back to last-modified + content-length", () => {
    expect(
      remoteArtifactUnchanged(
        {
          url: "https://ex/a.zip",
          lastModified: "Mon, 1 Jan 2024",
          contentLength: 10,
        },
        {
          url: "https://ex/a.zip",
          lastModified: "Mon, 1 Jan 2024",
          contentLength: 10,
        },
      ),
    ).toBe(true);
    expect(
      remoteArtifactUnchanged(
        {
          url: "https://ex/a.zip",
          lastModified: "Mon, 1 Jan 2024",
          contentLength: 10,
        },
        {
          url: "https://ex/a.zip",
          lastModified: "Mon, 1 Jan 2024",
          contentLength: 11,
        },
      ),
    ).toBe(false);
  });

  it("treats url change as changed", () => {
    expect(
      remoteArtifactUnchanged(
        { url: "https://ex/a.zip", etag: '"v1"' },
        { url: "https://ex/b.zip", etag: '"v1"' },
      ),
    ).toBe(false);
  });

  it("parses response headers case-insensitively", () => {
    const v = validatorsFromResponseHeaders("https://ex/a.zip", {
      ETag: '"abc"',
      "Last-Modified": "Mon, 1 Jan 2024",
      "Content-Length": "42",
    });
    expect(v).toEqual({
      url: "https://ex/a.zip",
      etag: '"abc"',
      lastModified: "Mon, 1 Jan 2024",
      contentLength: 42,
    });
  });

  it("fingerprints local files and records meta", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "placarr-artifact-"));
    const file = path.join(tmp, "pack.zip");
    await fs.writeFile(file, "hello");
    const fp = localFileFingerprint(file);
    expect(fp).toMatch(/^\d+:\d+$/);

    const metaPath = path.join(tmp, "meta.json");
    const meta = await recordLocalArtifactMeta({ absPath: file, metaPath });
    expect(meta?.kind).toBe("local");
    expect(meta?.localFp).toBe(fp);
    expect(await localArtifactUnchanged(file, meta)).toBe(true);

    await fs.writeFile(file, "hello!");
    expect(await localArtifactUnchanged(file, meta)).toBe(false);
  });

  it("fingerprints a sorted file list", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "placarr-artifact-list-"));
    const a = path.join(tmp, "a.dat");
    const b = path.join(tmp, "b.dat");
    await fs.writeFile(a, "one");
    await fs.writeFile(b, "two");
    const fp1 = await filesListFingerprint([b, a]);
    const fp2 = await filesListFingerprint([a, b]);
    expect(fp1).toBe(fp2);
    await fs.writeFile(a, "ONE");
    expect(await filesListFingerprint([a, b])).not.toBe(fp1);
  });
});
