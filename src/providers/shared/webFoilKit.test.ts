import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { downloadWebFoilAssets, writeWebFoilSourceLedger } from "./webFoilKit";

describe("webFoilKit", () => {
  it("télécharge chaque asset sous son nom stable, transforme, trace l'URL", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "webfoil-"));
    const res = await downloadWebFoilAssets(
      [
        { name: "glitter.webp", url: "https://example.test/a/glitter.png" },
        { name: "grain.webp", url: "https://example.test/a/grain.webp" },
        { name: "missing.webp", url: "https://example.test/a/missing.png" },
      ],
      dir,
      {
        fetchBytes: async (url) => {
          if (url.endsWith("missing.png")) throw new Error("404");
          return Buffer.from(`raw:${url}`);
        },
        transform: async (bytes, entry) =>
          entry.url.endsWith(".png") ? Buffer.from(`webp(${bytes})`) : bytes,
        log: () => {},
      },
    );
    expect(res.written).toEqual(["glitter.webp", "grain.webp"]);
    expect(res.failed).toEqual(["missing.webp"]);
    expect(res.sources).toEqual({
      "glitter.webp": "https://example.test/a/glitter.png",
      "grain.webp": "https://example.test/a/grain.webp",
    });
    expect(readFileSync(path.join(dir, "glitter.webp"), "utf8")).toBe(
      "webp(raw:https://example.test/a/glitter.png)",
    );

    writeWebFoilSourceLedger(dir, "web-source.json", { b: 1, a: { z: 1 } });
    expect(readFileSync(path.join(dir, "web-source.json"), "utf8")).toBe(
      '{\n  "a": {\n    "z": 1\n  },\n  "b": 1\n}\n',
    );
  });
});
