import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { SIMEY_TREES, syncSimeyWebAssets } from "./simeyWeb";

const SHA = "a".repeat(40);

async function png(): Promise<Buffer> {
  return sharp({
    create: { width: 4, height: 4, channels: 4, background: "#f00" },
  })
    .png()
    .toBuffer();
}

function fakeNet(log: string[]) {
  return {
    fetchJson: async (url: string): Promise<unknown> => {
      log.push(url);
      if (url.includes("/commits/")) return { sha: SHA };
      if (url.includes("/contents/")) {
        return [
          { name: "basic.css", type: "file" },
          { name: "notes.md", type: "file" },
        ];
      }
      if (url.includes("/repos/") && !url.includes("/contents/")) {
        return { license: { spdx_id: "GPL-3.0" } };
      }
      throw new Error(`json inattendu ${url}`);
    },
    fetchBytes: async (url: string): Promise<Buffer> => {
      log.push(url);
      if (url.endsWith(".css")) return Buffer.from(".card{}");
      if (/LICENSE|README/.test(url)) return Buffer.from("text");
      return png();
    },
  };
}

describe("syncSimeyWebAssets", () => {
  it("pose CSS + textures simey_*.webp au commit amont, trace chaque URL, puis saute", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "simey-"));
    const foilDir = path.join(root, "foil");
    const logsDir = path.join(root, "logs");
    const calls: string[] = [];
    const res = await syncSimeyWebAssets({
      foilDir,
      logsDir,
      ...fakeNet(calls),
      log: () => {},
    });

    expect(res.refreshed).toEqual(SIMEY_TREES.map((t) => t.id));
    const glitter = path.join(foilDir, "textures", "simey_glitter.webp");
    expect(existsSync(glitter)).toBe(true);
    expect((await sharp(glitter).metadata()).format).toBe("webp");
    expect(
      existsSync(
        path.join(
          foilDir,
          "simey",
          "poke-holo",
          "public",
          "css",
          "cards",
          "basic.css",
        ),
      ),
    ).toBe(true);
    expect(
      readFileSync(
        path.join(foilDir, "simey", "poke-holo", "UPSTREAM_COMMIT"),
        "utf8",
      ).trim(),
    ).toBe(SHA);
    // Fichiers bruts lus au commit figé, jamais sur une branche mouvante.
    expect(
      calls
        .filter((u) => u.includes("raw.githubusercontent.com"))
        .every((u) => u.includes(`/${SHA}/`)),
    ).toBe(true);

    const ledger = JSON.parse(
      readFileSync(path.join(logsDir, "simey-source.json"), "utf8"),
    );
    expect(ledger.trees["poke-holo"].commit).toBe(SHA);
    expect(ledger.trees["poke-holo"].license).toBe("GPL-3.0");
    expect(ledger.trees["poke-holo"].files["simey_glitter.webp"]).toBe(
      `https://raw.githubusercontent.com/simeydotme/pokemon-cards-css/${SHA}/public/img/glitter.png`,
    );

    // Même commit, tout présent : aucun téléchargement.
    const again: string[] = [];
    const second = await syncSimeyWebAssets({
      foilDir,
      logsDir,
      ...fakeNet(again),
      log: () => {},
    });
    expect(second.refreshed).toEqual([]);
    expect(again.some((u) => u.includes("raw.githubusercontent.com"))).toBe(
      false,
    );
  });
});
