import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  installCarddasJpMakuFaces,
  loadCarddasJpMakuFaces,
} from "./carddasJpFaces";

const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(64)]);

function seed(root: string): string {
  const curated = path.join(root, "curated");
  mkdirSync(path.join(curated, "sources"), { recursive: true });
  writeFileSync(
    path.join(curated, "sources", "carddas-jp-maku-faces.json"),
    JSON.stringify({
      faces: [
        {
          number: "mju0062",
          timestamp: "20160111072646",
          url: "http://www.carddass.com/naruto/cardgame/product/card_img/ju-062_d3.gif",
        },
      ],
    }),
  );
  return curated;
}

describe("installCarddasJpMakuFaces", () => {
  it("la graine versionnée ne nomme que des tirages 疾風伝", () => {
    const faces = loadCarddasJpMakuFaces();
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(face.number).toMatch(/^(shi|mju|msa)\d{4}$/);
      expect(face.timestamp).toMatch(/^\d{14}$/);
    }
  });

  it("télécharge l'instantané Wayback, pose une face candidate et cite l'instantané", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "shippuden-maku-"));
    const curatedRoot = seed(root);
    const fetched: string[] = [];
    const assets: { printKey: string; art: string; sourceUrl: string }[] = [];
    const res = await installCarddasJpMakuFaces({
      curatedRoot,
      stagingDir: path.join(root, "staging"),
      cardDir: (id) => path.join(root, "cards", id),
      fetchImage: async (url) => {
        fetched.push(url);
        return GIF;
      },
      writeAsset: (row) => assets.push(row),
    });
    expect(res.written).toEqual(["mju0062"]);
    expect(fetched).toEqual([
      "https://web.archive.org/web/20160111072646id_/http://www.carddass.com/naruto/cardgame/product/card_img/ju-062_d3.gif",
    ]);
    expect(
      existsSync(path.join(root, "cards", "mju0062", "art.carddas.gif")),
    ).toBe(true);
    expect(assets).toEqual([
      {
        printKey: "naruto:mju-0062",
        art: "art.carddas.gif",
        sourceUrl:
          "https://web.archive.org/web/20160111072646/http://www.carddass.com/naruto/cardgame/product/card_img/ju-062_d3.gif",
      },
    ]);

    // Hors ligne : relu depuis le staging, sans réseau.
    const again = await installCarddasJpMakuFaces({
      curatedRoot,
      stagingDir: path.join(root, "staging"),
      cardDir: (id) => path.join(root, "cards", id),
      offline: true,
      force: true,
      fetchImage: async () => {
        throw new Error("network");
      },
    });
    expect(again.written).toEqual(["mju0062"]);
  });
});
