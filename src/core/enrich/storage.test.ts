import { describe, expect, it } from "vitest";
import type { AttachmentType } from "@/generated/prisma/browser";
import type { MetadataAttachment } from "@/types/metadataProvider";

import {
  dedupeByPerceptualHash,
  canKeepRemoteImageOnDownloadFailure,
  formatMetadataFromStorage,
  hammingDistance,
  keepSourcelessCoverOnlyWithoutCatalogTwin,
  looksLikeImageBuffer,
  metadataImageAttachmentSemantics,
  pickVisuallyMatchingCatalogCoverUrl,
  planCroppedCoverAttachmentSync,
  providerOriginalImageUrl,
  retailerOriginalImageUrl,
  retargetUserHonorPinIfCatalogTwin,
  selectAttachmentsForLocalization,
} from "./storage";
import { isDegenerateFlatImage } from "@/core/enrich/media/coverPlaceholder";

type Att = { type: AttachmentType; url: string; source?: string };

const att = (url: string, source: string): Att => ({
  type: "cover",
  url,
  source,
});

const bits = (s: string) => s.padEnd(64, "0");

describe("pickVisuallyMatchingCatalogCoverUrl", () => {
  it("remaps an orphan scan upload to the matching catalog provider cover", () => {
    const pinHash = bits("10101010");
    expect(
      pickVisuallyMatchingCatalogCoverUrl(pinHash, [
        {
          url: "/uploads/user-pin.png",
          type: "image",
          source: "user",
          hash: pinHash,
        },
        {
          url: "/uploads/screenscraper-hash.png",
          type: "cover",
          source: "screenscraper",
          hash: pinHash,
        },
      ]),
    ).toBe("/uploads/screenscraper-hash.png");
  });

  it("prefers HDJV over inventing Perso for a UUID re-upload of the same box art", () => {
    const artHash = bits("1100110011001100");
    expect(
      pickVisuallyMatchingCatalogCoverUrl(artHash, [
        {
          url: "/uploads/59441f26fe239fb668cbef240d966de1.jpg",
          type: "cover",
          source: "hdjv",
          hash: artHash,
        },
        {
          url: "/uploads/fadedf0fc669aaefadb2cfc3d4ac65ef.jpg",
          type: "cover",
          source: "screenscraper",
          hash: bits("0011001100110011"),
        },
      ]),
    ).toBe("/uploads/59441f26fe239fb668cbef240d966de1.jpg");
  });

  it("leaves a visually unique personal photo alone", () => {
    expect(
      pickVisuallyMatchingCatalogCoverUrl(bits("1111111111111111"), [
        {
          url: "/uploads/catalog.png",
          type: "cover",
          source: "screenscraper",
          hash: bits("0000000000000000"),
        },
      ]),
    ).toBeNull();
  });
});

describe("retargetUserHonorPinIfCatalogTwin", () => {
  it("retargets a Perso UUID pin onto the Canal BD visual twin", () => {
    const artHash = bits("1010101010101010");
    const gallery = [
      {
        type: "image" as const,
        url: "/uploads/uuid-perso.jpg",
        source: "user",
      },
      {
        type: "cover" as const,
        url: "/uploads/canalbd-naruto.jpg",
        source: "canalbd",
      },
    ];
    const hashByUrl = new Map([
      ["/uploads/uuid-perso.jpg", artHash],
      ["/uploads/canalbd-naruto.jpg", artHash],
    ]);
    expect(
      retargetUserHonorPinIfCatalogTwin(gallery[0], gallery, hashByUrl),
    ).toEqual({
      type: "image",
      url: "/uploads/canalbd-naruto.jpg",
      source: "user",
    });
  });

  it("keeps a real personal photo that does not match catalog art", () => {
    const gallery = [
      {
        type: "image" as const,
        url: "/uploads/my-photo.jpg",
        source: "user",
      },
      {
        type: "cover" as const,
        url: "/uploads/canalbd.jpg",
        source: "canalbd",
      },
    ];
    const hashByUrl = new Map([
      ["/uploads/my-photo.jpg", bits("1111111111111111")],
      ["/uploads/canalbd.jpg", bits("0000000000000000")],
    ]);
    expect(
      retargetUserHonorPinIfCatalogTwin(gallery[0], gallery, hashByUrl),
    ).toEqual(gallery[0]);
  });
});

describe("planCroppedCoverAttachmentSync", () => {
  it("updates the picked provider cover without inventing a Perso pin", () => {
    expect(
      planCroppedCoverAttachmentSync(
        [
          {
            id: "att-a",
            url: "/uploads/cover-a_edited.jpg",
            source: "steamgriddb",
          },
          {
            id: "att-b",
            url: "/uploads/cover-b.jpg",
            source: "steamgriddb",
          },
        ],
        "/uploads/cover-b_edited.jpg",
        "/uploads/cover-a_edited.jpg",
      ),
    ).toEqual([
      {
        action: "update",
        attachmentId: "att-b",
        url: "/uploads/cover-b_edited.jpg",
      },
    ]);
  });

  it("creates a user pin only when a newly localized pick has no gallery twin", () => {
    expect(
      planCroppedCoverAttachmentSync(
        [
          {
            id: "att-a",
            url: "/uploads/cover-a_edited.jpg",
            source: "steamgriddb",
          },
          {
            id: "att-b",
            url: "https://cdn.example.com/cover-b.jpg",
            source: "steamgriddb",
          },
        ],
        "/uploads/new-local_edited.jpg",
        "/uploads/cover-a_edited.jpg",
      ),
    ).toEqual([
      { action: "create-user", url: "/uploads/new-local_edited.jpg" },
    ]);
  });

  it("only updates the matching provider row when re-cropping the same cover", () => {
    expect(
      planCroppedCoverAttachmentSync(
        [
          {
            id: "att-a",
            url: "/uploads/cover-a.jpg",
            source: "steamgriddb",
          },
        ],
        "/uploads/cover-a_edited.jpg",
        "/uploads/cover-a.jpg",
      ),
    ).toEqual([
      {
        action: "update",
        attachmentId: "att-a",
        url: "/uploads/cover-a_edited.jpg",
      },
    ]);
  });

  it("does not invent Perso when the crop already URL-matches a provider row", () => {
    expect(
      planCroppedCoverAttachmentSync(
        [
          {
            id: "att-amc",
            url: "/uploads/amc-switch_edited.jpg",
            source: "achatmoinscher",
          },
        ],
        "/uploads/amc-switch_edited.jpg",
        "/uploads/amc-switch_edited.jpg",
      ),
    ).toEqual([{ action: "noop" }]);
  });

  it("realigns an orphan user pin when re-saving the stored cover", () => {
    expect(
      planCroppedCoverAttachmentSync(
        [
          {
            id: "att-ebay",
            url: "/uploads/ebay_edited.jpg",
            source: "ebay",
          },
          {
            id: "att-merged",
            url: "/uploads/merged.jpg",
            source: "merged",
          },
          {
            id: "att-user",
            url: "/uploads/merged.jpg",
            source: "user",
          },
        ],
        "/uploads/ebay_edited.jpg",
        "/uploads/ebay_edited.jpg",
      ),
    ).toEqual([
      {
        action: "update",
        attachmentId: "att-user",
        url: "/uploads/ebay_edited.jpg",
      },
    ]);
  });

  it("folds a remote PrestaShop jaquette onto its local crop without inventing Perso", () => {
    expect(
      planCroppedCoverAttachmentSync(
        [
          {
            id: "att-ngr",
            url: "https://www.netgamesretro.com/28634-large_default/console-nintendo-gamecube-silver.jpg",
            source: null,
          },
        ],
        "/uploads/81643a5c96dc4d6f01d8dc468a9c6d17_edited.jpg",
        null,
        "https://www.netgamesretro.com/28634-large_default/console-nintendo-gamecube-silver.jpg",
      ),
    ).toEqual([
      {
        action: "update",
        attachmentId: "att-ngr",
        url: "/uploads/81643a5c96dc4d6f01d8dc468a9c6d17_edited.jpg",
      },
    ]);
  });
});

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
          platformKey: null,
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

  it("récupère PriceCharting via coverUrlHost quand la galerie n'a pas l'attachment", () => {
    expect(
      metadataImageAttachmentSemantics(
        {
          imageUrl:
            "https://storage.googleapis.com/images.pricecharting.com/pink/1600.jpg",
        },
        "https://storage.googleapis.com/images.pricecharting.com/pink/1600.jpg",
      ),
    ).toEqual({
      type: "cover",
      role: undefined,
      source: "pricecharting",
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

describe("keepSourcelessCoverOnlyWithoutCatalogTwin", () => {
  it("drops a sourceless orphan when a stamped catalog twin shares the URL", () => {
    const gallery = [
      { type: "cover" as AttachmentType, url: "/uploads/a.jpg", source: null },
      {
        type: "cover" as AttachmentType,
        url: "/uploads/a.jpg",
        source: "pricecharting",
      },
    ];
    const hashByUrl = new Map<string, string>();
    expect(
      gallery.filter((attachment) =>
        keepSourcelessCoverOnlyWithoutCatalogTwin(
          attachment,
          gallery,
          hashByUrl,
        ),
      ),
    ).toEqual([
      {
        type: "cover",
        url: "/uploads/a.jpg",
        source: "pricecharting",
      },
    ]);
  });

  it("keeps a sourceless cover when no catalog twin exists", () => {
    const gallery = [
      {
        type: "cover" as AttachmentType,
        url: "/uploads/only.jpg",
        source: null,
      },
    ];
    expect(
      keepSourcelessCoverOnlyWithoutCatalogTwin(gallery[0], gallery, new Map()),
    ).toBe(true);
  });
});

describe("canKeepRemoteImageOnDownloadFailure", () => {
  it("conserve les images distantes seulement pour les hosts déclarés", () => {
    expect(
      canKeepRemoteImageOnDownloadFailure(
        "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n2-1691462.jpg",
        "booknode",
      ),
    ).toBe(true);
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

describe("selectAttachmentsForLocalization", () => {
  it("prefers covers over screenshot grids and caps the download set", () => {
    const attachments = [
      ...Array.from({ length: 20 }, (_, i) => ({
        type: "screenshot" as const,
        url: `https://cdn.example/shot-${i}.png`,
      })),
      {
        type: "cover" as const,
        url: "https://cdn.example/box.png",
      },
      {
        type: "hero" as const,
        url: "https://cdn.example/hero.png",
      },
    ];

    const selected = selectAttachmentsForLocalization(
      attachments as MetadataAttachment[],
      5,
    );
    expect(selected).toHaveLength(5);
    expect(selected[0]?.url).toBe("https://cdn.example/box.png");
    expect(selected[1]?.url).toBe("https://cdn.example/hero.png");
    expect(selected.some((a) => a.url.includes("shot-"))).toBe(true);
  });

  it("ignores already-local uploads when counting the remote budget", () => {
    const selected = selectAttachmentsForLocalization(
      [
        { type: "cover", url: "/uploads/local.png" },
        { type: "cover", url: "https://cdn.example/a.png" },
      ],
      12,
    );
    expect(selected).toEqual([
      { type: "cover", url: "https://cdn.example/a.png" },
    ]);
  });
});
