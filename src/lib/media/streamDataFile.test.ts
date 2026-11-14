import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync, brotliDecompressSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  negotiateTransferEncoding,
  shouldCompressFile,
  streamFileResponse,
} from "@/lib/media/streamDataFile";

describe("negotiateTransferEncoding", () => {
  it("prefers brotli over gzip", () => {
    expect(negotiateTransferEncoding("gzip, deflate, br")).toBe("br");
    expect(negotiateTransferEncoding("gzip")).toBe("gzip");
    expect(negotiateTransferEncoding("identity")).toBeNull();
    expect(negotiateTransferEncoding("br;q=0, gzip;q=1")).toBe("gzip");
  });
});

describe("shouldCompressFile", () => {
  it("skips images and compresses shards / onnx", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-stream-"));
    const json = path.join(dir, "x.json");
    const f16 = path.join(dir, "x.f16");
    const onnx = path.join(dir, "x.onnx");
    const webp = path.join(dir, "x.webp");
    writeFileSync(json, '{"a":1}');
    writeFileSync(f16, Buffer.alloc(32, 1));
    writeFileSync(onnx, Buffer.alloc(64, 2));
    // Minimal RIFF/WEBP so sniff treats it as an image.
    const webpBuf = Buffer.alloc(16, 0);
    webpBuf.write("RIFF", 0);
    webpBuf.write("WEBP", 8);
    writeFileSync(webp, webpBuf);
    expect(shouldCompressFile(json)).toBe(true);
    expect(shouldCompressFile(f16)).toBe(true);
    expect(shouldCompressFile(onnx)).toBe(true);
    expect(shouldCompressFile(webp)).toBe(false);
  });
});

describe("streamFileResponse compression", () => {
  async function readBody(res: Response): Promise<Buffer> {
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  it("gzips JSON when Accept-Encoding asks for it", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-stream-"));
    const file = path.join(dir, "meta.json");
    const payload = JSON.stringify({ hello: "world", n: 42 }).repeat(20);
    writeFileSync(file, payload);
    const res = streamFileResponse(file, {
      request: new Request("http://localhost/x", {
        headers: { "accept-encoding": "gzip" },
      }),
      cache: "revalidate",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("content-length")).toBeNull();
    expect(res.headers.get("vary")).toMatch(/Accept-Encoding/i);
    const raw = await readBody(res);
    expect(gunzipSync(raw).toString("utf8")).toBe(payload);
  });

  it("brotli-compresses f16 shards", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-stream-"));
    const file = path.join(dir, "card-embedding-index.f16");
    const payload = Buffer.alloc(4096, 7);
    writeFileSync(file, payload);
    const res = streamFileResponse(file, {
      request: new Request("http://localhost/x", {
        headers: { "accept-encoding": "br, gzip" },
      }),
    });
    expect(res.headers.get("content-encoding")).toBe("br");
    const raw = await readBody(res);
    expect(Buffer.compare(brotliDecompressSync(raw), payload)).toBe(0);
  });

  it("leaves identity when the client does not ask", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-stream-"));
    const file = path.join(dir, "meta.json");
    writeFileSync(file, '{"x":1}');
    const res = streamFileResponse(file, {
      request: new Request("http://localhost/x"),
      cache: "revalidate",
    });
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("content-length")).toBe("7");
  });
});
