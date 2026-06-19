import { describe, expect, it } from "vitest";
import type { AttachmentType } from "@prisma/client";

import {
  dedupeByPerceptualHash,
  hammingDistance,
  providerOriginalImageUrl,
  retailerOriginalImageUrl,
} from "./metadataStorage";

type Att = { type: AttachmentType; url: string; source?: string };

const att = (url: string, source: string): Att => ({
  type: "cover",
  url,
  source,
});

const bits = (s: string) => s.padEnd(64, "0");

describe("retailerOriginalImageUrl", () => {
  it("strippe le token de taille PrestaShop/Philibert vers l'original", () => {
    expect(
      retailerOriginalImageUrl(
        "https://www.monsieurde.com/11949-large_default/jeu.jpg",
      ),
    ).toBe("https://www.monsieurde.com/11949/jeu.jpg");
    expect(
      retailerOriginalImageUrl(
        "https://archi-chouette.fr/16946-large_default/jeu.webp",
      ),
    ).toBe("https://archi-chouette.fr/16946/jeu.webp");
    expect(
      retailerOriginalImageUrl(
        "https://cdn1.philibertnet.com/545449-thickbox_default/x.jpg",
      ),
    ).toBe("https://cdn1.philibertnet.com/545449/x.jpg");
    expect(
      retailerOriginalImageUrl(
        "https://www.monsieurde.com/11949-large_default/jeu.jpg?width=400&crop=center",
      ),
    ).toBe("https://www.monsieurde.com/11949/jeu.jpg");
  });

  it("ne touche pas les URLs originales ou hors motif (ex. tailles TMDB)", () => {
    expect(
      retailerOriginalImageUrl("https://cdn1.philibertnet.com/545449/x.jpg"),
    ).toBeNull();
    expect(
      retailerOriginalImageUrl("https://image.tmdb.org/t/p/w500/abc.jpg"),
    ).toBeNull();
  });
});

describe("providerOriginalImageUrl", () => {
  it("retire les paramètres de crop/compression/redimensionnement sans supprimer les autres", () => {
    expect(
      providerOriginalImageUrl(
        "https://img.example.com/cover.jpg?width=400&height=400&crop=1&quality=70&token=abc",
      ),
    ).toBe("https://img.example.com/cover.jpg?token=abc");
    expect(
      providerOriginalImageUrl(
        "https://img.example.com/cover.jpg?auto=format&fit=crop&w=300&q=70",
      ),
    ).toBe("https://img.example.com/cover.jpg");
  });

  it("ne touche pas une URL sans signal de transformation", () => {
    expect(
      providerOriginalImageUrl("https://img.example.com/cover.jpg?token=abc"),
    ).toBeNull();
  });
});

describe("hammingDistance", () => {
  it("compte les positions différentes", () => {
    expect(hammingDistance("0000", "0000")).toBe(0);
    expect(hammingDistance("1011", "1110")).toBe(2);
  });
});

describe("dedupeByPerceptualHash", () => {
  it("fusionne les images visuellement proches même à des URLs/tailles différentes", () => {
    const ranked = [
      att("https://philibert.com/box.jpg", "philibert"),
      att("https://monsieurde.com/box.jpg", "monsieurde"),
      att("https://ludifolie.com/box.jpg", "ludifolie"),
      att("https://philibert.com/ambiance.jpg", "philibert"),
    ];
    // Les 3 boîtes ont des empreintes proches (≤8), l'ambiance est très loin.
    const hashes: Record<string, string> = {
      "https://philibert.com/box.jpg": bits("0000"),
      "https://monsieurde.com/box.jpg": bits("0011"), // distance 2
      "https://ludifolie.com/box.jpg": bits("0001"), // distance 1
      "https://philibert.com/ambiance.jpg": bits("1111111111111"), // 13 bits
    };

    const out = dedupeByPerceptualHash(ranked, (url) => hashes[url] ?? null);

    // On garde la meilleure copie de la boîte (1re) + l'ambiance.
    expect(out.map((a) => a.url)).toEqual([
      "https://philibert.com/box.jpg",
      "https://philibert.com/ambiance.jpg",
    ]);
  });

  it("respecte le seuil de distance", () => {
    const ranked = [att("/a.jpg", "a"), att("/b.jpg", "b")];
    const hashes: Record<string, string> = {
      "/a.jpg": bits("0000"),
      "/b.jpg": bits("1111"),
    };
    // distance 4 : fusionnés à maxDistance=8, distincts à maxDistance=2.
    expect(dedupeByPerceptualHash(ranked, (u) => hashes[u], 8)).toHaveLength(1);
    expect(dedupeByPerceptualHash(ranked, (u) => hashes[u], 2)).toHaveLength(2);
  });

  it("conserve les attachments sans empreinte (jamais de perte par défaut)", () => {
    const ranked = [att("/uploads/a.jpg", "a"), att("/uploads/b.jpg", "b")];
    expect(dedupeByPerceptualHash(ranked, () => null)).toHaveLength(2);
  });
});
