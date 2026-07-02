import { describe, expect, it } from "vitest";
import type { AttachmentType } from "@prisma/client";

import {
  dedupeByPerceptualHash,
  canKeepRemoteImageOnDownloadFailure,
  formatMetadataFromStorage,
  hammingDistance,
  looksLikeImageBuffer,
  metadataImageAttachmentSemantics,
  providerOriginalImageUrl,
  retailerOriginalImageUrl,
} from "./storage";
import { isDegenerateFlatImage } from "@/lib/media/coverPlaceholder";

type Att = { type: AttachmentType; url: string; source?: string };

const att = (url: string, source: string): Att => ({
  type: "cover",
  url,
  source,
});

const bits = (s: string) => s.padEnd(64, "0");

describe("formatMetadataFromStorage attachment traits", () => {
  it("re-derives provider gallery and cover traits when loading from storage", () => {
    const metadata = formatMetadataFromStorage({
      id: "meta-1",
      title: "Album",
      description: null,
      duration: null,
      pageCount: null,
      tracksCount: null,
      releaseDate: null,
      imageUrl: null,
      heroImageUrl: null,
      aliases: null,
      facts: null,
      sourceType: "musics",
      sourceQuery: "",
      lastFetched: new Date("2026-06-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      attachments: [
        {
          id: "att-1",
          metadataId: "meta-1",
          type: "cover",
          url: "https://example.com/cover.jpg",
          source: "discogs",
          title: null,
          duration: null,
          role: null,
          coverProvenance: null,
          width: null,
          height: null,
          meanLuminance: null,
          darkPixelRatio: null,
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
    });

    expect(metadata.attachments?.[0]).toMatchObject({
      source: "discogs",
      isMusicGallerySource: true,
      isCanonicalCoverSource: true,
      isGameMediaGallerySource: false,
      providerLabel: "Discogs",
    });
  });
});

describe("formatMetadataFromStorage fact traits", () => {
  it("re-derives provider fact traits when loading from storage", () => {
    const metadata = formatMetadataFromStorage({
      id: "meta-2",
      title: "Catan",
      description: null,
      duration: null,
      pageCount: null,
      tracksCount: null,
      releaseDate: null,
      imageUrl: null,
      heroImageUrl: null,
      aliases: null,
      facts: JSON.stringify([
        {
          kind: "rating",
          label: "BGG",
          value: "7.4",
          source: "bgg",
        },
      ]),
      sourceType: "boardgames",
      sourceQuery: "",
      lastFetched: new Date("2026-06-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      attachments: [],
    });

    expect(metadata.facts?.[0]).toMatchObject({
      isBoardGameRatingSource: true,
      isPcSpecificFact: false,
      providerLabel: "BoardGameGeek",
      sourceNames: ["BoardGameGeek"],
    });
  });
});

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

  it("peut limiter la déduplication à un groupe (ex. source provider)", () => {
    const ranked = [
      att("https://philibert.com/box.jpg", "philibert"),
      att("https://geedie.lt/box.jpg", "geedie"),
    ];
    const hashes: Record<string, string> = {
      "https://philibert.com/box.jpg": bits("0000"),
      "https://geedie.lt/box.jpg": bits("0001"),
    };

    expect(
      dedupeByPerceptualHash(
        ranked,
        (url) => hashes[url] ?? null,
        8,
        undefined,
        (item) => item.source ?? "merged",
      ).map((entry) => entry.source),
    ).toEqual(["philibert", "geedie"]);
  });

  it("garde la région la plus valuable parmi des visuels identiques", () => {
    // Même boîte servie en "Monde" (mieux scorée, vue en premier) et en
    // "France" : on doit conserver la version France.
    const ranked = [
      { type: "cover" as AttachmentType, url: "/wor.jpg", role: "wor" },
      { type: "cover" as AttachmentType, url: "/fr.jpg", role: "fr" },
    ];
    const hashes: Record<string, string> = {
      "/wor.jpg": bits("0000"),
      "/fr.jpg": bits("0001"), // distance 1 → même visuel
    };
    const regionRankOf = (item: { role?: string | null }) =>
      ({ fr: 0, eu: 1, wor: 2 })[item.role ?? ""] ?? 6;

    const out = dedupeByPerceptualHash(
      ranked,
      (u) => hashes[u],
      8,
      regionRankOf,
    );

    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("/fr.jpg");
    expect(out[0].role).toBe("fr");
  });
});

describe("metadataImageAttachmentSemantics", () => {
  it("préserve source et région depuis une URL média ScreenScraper", () => {
    expect(
      metadataImageAttachmentSemantics(
        {
          imageUrl:
            "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14774&media=box-2D(fr)",
        },
        "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14774&media=box-2D(fr)",
      ),
    ).toEqual({
      type: "cover",
      role: "fr",
      source: "screenscraper",
      title: undefined,
    });
  });

  it("garde les métadonnées d'attachment explicites quand elles existent", () => {
    expect(
      metadataImageAttachmentSemantics(
        {
          imageUrl: "https://example.com/cover.jpg",
          attachments: [
            {
              type: "cover",
              role: "eu",
              source: "bgg",
              title: "Box front",
              url: "https://example.com/cover.jpg",
            },
          ],
        },
        "https://example.com/cover.jpg",
      ),
    ).toEqual({
      type: "cover",
      role: "eu",
      source: "bgg",
      title: "Box front",
    });
  });
});

describe("canKeepRemoteImageOnDownloadFailure", () => {
  it("conserve les images distantes seulement pour les hosts déclarés", () => {
    expect(
      canKeepRemoteImageOnDownloadFailure(
        "https://cdn1.booknode.com/book_cover/1691/super-picsou.webp",
        "booknode",
      ),
    ).toBe(false);
    expect(
      canKeepRemoteImageOnDownloadFailure(
        "https://img.chasse-aux-livres.fr/covers/super-picsou.jpg",
        "chasseauxlivres",
      ),
    ).toBe(true);
    expect(
      canKeepRemoteImageOnDownloadFailure(
        "https://i.ebayimg.com/item.jpg",
        "ebay",
      ),
    ).toBe(true);
    expect(
      canKeepRemoteImageOnDownloadFailure(
        "https://img.example.com/item.jpg",
        "ebay",
      ),
    ).toBe(false);
    expect(canKeepRemoteImageOnDownloadFailure("/uploads/local.jpg")).toBe(
      false,
    );
  });
});

describe("isDegenerateFlatImage", () => {
  it("rejette une image unicolore (entropie et écart-type nuls)", () => {
    // Cas réel : placeholder vert plein renvoyé par ScreenScraper.
    expect(isDegenerateFlatImage({ entropy: 0, maxColorStdev: 0 })).toBe(true);
  });

  it("rejette un placeholder quasi uniforme", () => {
    expect(isDegenerateFlatImage({ entropy: 0.4, maxColorStdev: 3 })).toBe(
      true,
    );
    expect(isDegenerateFlatImage({ entropy: 0.66, maxColorStdev: 6.49 })).toBe(
      true,
    );
  });

  it("conserve une vraie jaquette (entropie et contraste élevés)", () => {
    expect(isDegenerateFlatImage({ entropy: 6.2, maxColorStdev: 70 })).toBe(
      false,
    );
  });

  it("conserve une image à faible entropie mais avec du contraste (logo)", () => {
    // Exige les DEUX conditions : un visuel contrasté n'est jamais supprimé.
    expect(isDegenerateFlatImage({ entropy: 0.5, maxColorStdev: 40 })).toBe(
      false,
    );
  });
});

describe("looksLikeImageBuffer", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  ]);
  const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
  const webp = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP"),
  ]);
  const avif = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x1c]),
    Buffer.from("ftyp"),
    Buffer.from("avif"),
  ]);

  it("reconnaît les formats image par leurs magic bytes", () => {
    expect(looksLikeImageBuffer(jpeg)).toBe(true);
    expect(looksLikeImageBuffer(png)).toBe(true);
    expect(looksLikeImageBuffer(gif)).toBe(true);
    expect(looksLikeImageBuffer(webp)).toBe(true);
    expect(looksLikeImageBuffer(avif)).toBe(true);
  });

  it("reconnaît un SVG (texte) via la racine ou le content-type", () => {
    expect(looksLikeImageBuffer(Buffer.from('<svg xmlns="...">'))).toBe(true);
    expect(looksLikeImageBuffer(Buffer.from("<?xml ?><svg></svg>"))).toBe(true);
    expect(
      looksLikeImageBuffer(
        Buffer.from("<!-- generated -->\n<svg width='1'></svg>"),
        "image/svg+xml",
      ),
    ).toBe(true);
  });

  it("rejette une réponse texte HTTP 200 (erreur déguisée en .jpg)", () => {
    // Cas réel : ScreenScraper renvoie ce texte de 59 octets en 200 quand le
    // quota/login échoue, jadis sauvé tel quel en image.
    expect(
      looksLikeImageBuffer(
        Buffer.from(
          "Erreur de login : Vérifier vos identifiants développeur !",
        ),
        "text/html",
      ),
    ).toBe(false);
    expect(looksLikeImageBuffer(Buffer.from("<!DOCTYPE html>"))).toBe(false);
    expect(looksLikeImageBuffer(Buffer.from([]))).toBe(false);
  });
});
