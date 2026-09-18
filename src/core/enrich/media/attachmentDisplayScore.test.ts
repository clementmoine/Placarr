import { describe, expect, it } from "vitest";

import { parseRegionFromRole } from "@/core/locale/preference";

import {
  deriveAttachmentPlatformKeyFromUrl,
  explainAttachmentScoreForDisplay,
  pickBestBackgroundFromAttachments,
  pickBestCoverFromAttachments,
  rankCoverGalleryAttachments,
  rankAttachmentsForDisplay,
  rankCoversForDisplay,
  reorderAttachmentsCoverFirst,
  resolveStoredMetadataCoverUrl,
  shouldShowCoverAttachmentOnShelf,
} from "./attachmentDisplayScore";

describe("attachmentDisplayScore", () => {
  it("deriveAttachmentPlatformKeyFromUrl resolves HDJV XBox-360 image paths", () => {
    expect(
      deriveAttachmentPlatformKeyFromUrl(
        "https://www.historiquedesjeuxvideo.com/bdd/jeu/img/XBox-360/2734.jpg",
      ),
    ).toBe("xbox360");
    expect(
      deriveAttachmentPlatformKeyFromUrl(
        "https://www.historiquedesjeuxvideo.com/fiches/Xbox%20360/le-parrain-2.html",
      ),
    ).toBe("xbox360");
  });
  it("deriveAttachmentPlatformKeyFromUrl resolves ScreenScraper mediaJeu systemeid", () => {
    expect(
      deriveAttachmentPlatformKeyFromUrl(
        "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=9&jeuid=14825&media=box-2D(fr)",
      ),
    ).toBe("gb");
  });

  it("applique l'ajustement de score image déclaré par le provider", () => {
    const details = explainAttachmentScoreForDisplay({
      type: "cover",
      source: "ebay",
      url: "/uploads/listing.jpg",
      providerImageScoreAdjustment: -280,
    });

    expect(details.signals).toContain("-280 provider image source");
  });

  it("prefere une jaquette lumineuse a un scan Bédéthèque sous-expose a poids egal", () => {
    const darkScan = {
      type: "cover" as const,
      source: "bedetheque",
      role: "fr",
      url: "/uploads/dark-scan.jpg",
    };
    const brightCover = {
      type: "cover" as const,
      source: "booknode",
      role: "fr",
      url: "/uploads/bright-cover.webp",
    };
    const sharedMetrics = {
      width: 850,
      height: 1228,
      format: "jpeg" as const,
    };
    const metrics = new Map([
      [
        darkScan.url,
        {
          ...sharedMetrics,
          meanLuminance: 84,
          darkPixelRatio: 0.52,
        },
      ],
      [
        brightCover.url,
        {
          ...sharedMetrics,
          format: "webp",
          meanLuminance: 147,
          darkPixelRatio: 0.06,
        },
      ],
    ]);

    const darkDetails = explainAttachmentScoreForDisplay(
      darkScan,
      metrics.get(darkScan.url),
    );
    expect(darkDetails.signals).toContain("-360 underexposed scan");
    expect(pickBestCoverFromAttachments([darkScan, brightCover], metrics)).toBe(
      brightCover.url,
    );
  });

  it("garde une jaquette EU sombre devant une jaquette JP quand la locale prefere l'Europe", () => {
    const darkEuCatalog = {
      type: "cover" as const,
      source: "geedie",
      role: "eu",
      url: "/uploads/dark-eu-catalog.jpg",
      coverProvenance: "catalog",
    };
    const brightJpCatalog = {
      type: "cover" as const,
      source: "geedie",
      role: "jp",
      url: "/uploads/bright-jp-catalog.jpg",
      coverProvenance: "catalog",
    };
    const metrics = new Map([
      [
        darkEuCatalog.url,
        {
          width: 1025,
          height: 1302,
          format: "jpeg",
          meanLuminance: 93.6,
          darkPixelRatio: 0.47,
        },
      ],
      [
        brightJpCatalog.url,
        {
          width: 477,
          height: 600,
          format: "jpeg",
          meanLuminance: 123.8,
          darkPixelRatio: 0.22,
        },
      ],
    ]);

    expect(
      pickBestCoverFromAttachments([brightJpCatalog, darkEuCatalog], metrics, {
        uiLocale: "fr",
        requestedPlatformKey: "ps4",
      }),
    ).toBe(darkEuCatalog.url);
  });

  it("ne penalise pas media= dans les URLs ScreenScraper", () => {
    const details = explainAttachmentScoreForDisplay({
      type: "cover",
      source: "screenscraper",
      role: "eu",
      url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14835&media=box-2D(eu)",
    });

    expect(details.signals.some((signal) => signal.includes("back/disc"))).toBe(
      false,
    );
  });

  it("priorise ScreenScraper EU sur TheGamesDB quand les deux sont disponibles", () => {
    const screenScraperCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "eu",
      url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14835&media=box-2D(eu)",
    };
    const theGamesDbCover = {
      type: "cover" as const,
      source: "thegamesdb",
      role: "wor",
      url: "https://cdn.thegamesdb.net/images/original/boxart/front/23520-1.jpg",
    };

    expect(
      pickBestCoverFromAttachments([theGamesDbCover, screenScraperCover]),
    ).toBe(screenScraperCover.url);
  });

  it("traite LaunchBox Europe au même niveau que ScreenScraper eu", () => {
    const launchboxCover = {
      type: "cover" as const,
      source: "launchbox",
      role: "europe",
      url: "https://images.launchbox-app.com/cover-eu.jpg",
    };
    const screenScraperCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "eu",
      url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14835&media=box-2D(eu)",
    };

    expect(parseRegionFromRole("europe")).toBe("eu");
    expect(
      pickBestCoverFromAttachments([launchboxCover, screenScraperCover]),
    ).toBeTruthy();
  });

  it("priorise une cover FR locale même si une cover EU a une meilleure résolution", () => {
    const metrics = new Map([
      ["/uploads/eu-hires.jpg", { width: 754, height: 1355, format: "jpeg" }],
      ["/uploads/fr-small.jpg", { width: 312, height: 822, format: "jpeg" }],
    ]);

    expect(
      pickBestCoverFromAttachments(
        [
          {
            type: "cover",
            source: "bgg",
            role: "eu",
            url: "/uploads/eu-hires.jpg",
          },
          {
            type: "cover",
            source: "bgg",
            role: "fr",
            url: "/uploads/fr-small.jpg",
          },
        ],
        metrics,
      ),
    ).toBe("/uploads/fr-small.jpg");
  });

  it("exclut un dos LaunchBox legacy (role europe + title Box - Back)", () => {
    expect(
      pickBestCoverFromAttachments([
        {
          type: "cover",
          source: "launchbox",
          role: "eu",
          title: "Box - Front",
          url: "https://images.launchbox-app.com/front-eu.jpg",
        },
        {
          type: "image",
          source: "launchbox",
          role: "europe",
          title: "Box - Back",
          url: "https://images.launchbox-app.com/back-eu.jpg",
        },
      ]),
    ).toBe("https://images.launchbox-app.com/front-eu.jpg");
  });

  it("ignore le disque ScreenScraper quand aucune jaquette boîte FR n'existe", () => {
    const metrics = new Map([
      ["/uploads/disc.jpg", { width: 1200, height: 1200, format: "jpeg" }],
      ["/uploads/box-eu.jpg", { width: 754, height: 1355, format: "jpeg" }],
    ]);

    expect(
      pickBestCoverFromAttachments(
        [
          {
            type: "image",
            source: "screenscraper",
            role: "disc-fr",
            url: "/uploads/disc.jpg",
          },
          {
            type: "cover",
            source: "screenscraper",
            role: "eu",
            url: "/uploads/box-eu.jpg",
          },
        ],
        metrics,
      ),
    ).toBe("/uploads/box-eu.jpg");
  });

  it("priorise le disque quand preferDiscCover (jeu loose)", () => {
    const metrics = new Map([
      ["/uploads/disc.jpg", { width: 1200, height: 1200, format: "jpeg" }],
      ["/uploads/box-eu.jpg", { width: 754, height: 1355, format: "jpeg" }],
    ]);

    expect(
      pickBestCoverFromAttachments(
        [
          {
            type: "image",
            source: "screenscraper",
            role: "disc-fr",
            url: "/uploads/disc.jpg",
          },
          {
            type: "cover",
            source: "screenscraper",
            role: "eu",
            url: "/uploads/box-eu.jpg",
          },
        ],
        metrics,
        { preferDiscCover: true },
      ),
    ).toBe("/uploads/disc.jpg");
  });

  it("priorise System Only quand preferSystemOnlyCover (console loose)", () => {
    const metrics = new Map([
      [
        "/uploads/system-only.jpg",
        { width: 1200, height: 900, format: "jpeg" },
      ],
      ["/uploads/box.jpg", { width: 800, height: 1100, format: "jpeg" }],
    ]);

    expect(
      pickBestCoverFromAttachments(
        [
          {
            type: "cover",
            source: "pricecharting",
            role: "us",
            title: "Main Image",
            url: "/uploads/box.jpg",
          },
          {
            type: "image",
            source: "pricecharting",
            role: "us",
            title: "System Only",
            url: "/uploads/system-only.jpg",
          },
        ],
        metrics,
        { preferSystemOnlyCover: true },
      ),
    ).toBe("/uploads/system-only.jpg");
  });

  it("priorise une cover 2D Europe sur une cover 3D France", () => {
    const eu2dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "eu",
      url: "/uploads/eu-2d.jpg",
    };
    const fr3dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "3d-fr",
      url: "/uploads/fr-3d.jpg",
    };

    expect(pickBestCoverFromAttachments([eu2dCover, fr3dCover])).toBe(
      eu2dCover.url,
    );
  });

  it("priorise une cover 3D France ou une cover 2D classique sur une jaquette complète (full wrap) CoverProject", () => {
    const coverProjectCover = {
      type: "cover" as const,
      source: "coverproject",
      role: "eu",
      url: "/uploads/coverproject.jpg",
      // A real CoverProject attachment is stamped full-wrap by the server; that
      // flag is what de-ranks it below 2D/3D fronts.
      isFullWrapCoverSource: true,
    };
    const fr3dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "3d-fr",
      url: "/uploads/fr-3d.jpg",
    };
    const us2dCover = {
      type: "cover" as const,
      source: "thegamesdb",
      role: "us",
      url: "/uploads/us-2d.jpg",
    };

    // La cover 3D France (localeRank: 0 + 2 = 2) doit battre la cover complète de CoverProject (localeRank: 1)
    // car CoverProject est pénalisé par son format double cover
    expect(pickBestCoverFromAttachments([coverProjectCover, fr3dCover])).toBe(
      fr3dCover.url,
    );

    // Une cover 2D classique USA (localeRank: 2) doit également battre la jaquette complète de CoverProject (localeRank: 1)
    expect(pickBestCoverFromAttachments([coverProjectCover, us2dCover])).toBe(
      us2dCover.url,
    );
  });

  it("fusionne les métadonnées (comme le rôle) en cas de doublons d'URL", () => {
    const withRole = {
      type: "cover" as const,
      source: "launchbox",
      role: "us",
      url: "/uploads/duplicate.jpg",
    };
    const withoutRole = {
      type: "cover" as const,
      source: "launchbox",
      url: "/uploads/duplicate.jpg",
      role: undefined as string | undefined,
    };

    const ranked = rankAttachmentsForDisplay([withRole, withoutRole]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].role).toBe("us");
  });

  it("priorise une cover 2D USA sur une cover 3D France", () => {
    const us2dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "us",
      url: "/uploads/us-2d.jpg",
    };
    const fr3dCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "3d-fr",
      url: "/uploads/fr-3d.jpg",
    };

    expect(pickBestCoverFromAttachments([us2dCover, fr3dCover])).toBe(
      us2dCover.url,
    );
  });

  it("sorts back covers (and other non-front covers) at the very bottom, even with preferred regions", () => {
    const usBackCover = {
      type: "cover" as const,
      source: "thegamesdb",
      role: "back-us",
      url: "/uploads/us-back.jpg",
    };
    const jpFrontCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "jp",
      url: "/uploads/jp-front.jpg",
    };
    const fr3dFrontCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "3d-fr",
      url: "/uploads/fr-3d.jpg",
    };
    const fr2dFrontCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "fr",
      url: "/uploads/fr-2d.jpg",
    };

    const ranked = rankCoversForDisplay([
      usBackCover,
      jpFrontCover,
      fr3dFrontCover,
      fr2dFrontCover,
    ]);

    // Expected order:
    // 1. fr2dFrontCover (typeRank = 0, regionRankValue = 0)
    // 2. jpFrontCover (typeRank = 0, regionRankValue = 6)
    // 3. fr3dFrontCover (typeRank = 1, regionRankValue = 0)
    // 4. usBackCover (typeRank = 3, regionRankValue = 5)
    expect(ranked[0]).toBe(fr2dFrontCover);
    expect(ranked[1]).toBe(jpFrontCover);
    expect(ranked[2]).toBe(fr3dFrontCover);
    expect(ranked[3]).toBe(usBackCover);
  });

  it("favorise une image identique partagée par plusieurs sources (consensus)", () => {
    const shared = (source: string) => ({
      type: "screenshot" as const,
      source,
      url: "/shots/same.jpg",
    });
    const solo = {
      type: "screenshot" as const,
      source: "steam",
      url: "/shots/solo.jpg",
    };

    // `solo` est en tête de liste (index 0) : sans consensus il gagnerait le
    // départage à score égal. Les 3 sources distinctes le font passer derrière.
    const ranked = rankAttachmentsForDisplay([
      solo,
      shared("igdb"),
      shared("rawg"),
      shared("screenscraper"),
    ]);

    expect(ranked).toHaveLength(2); // l'image partagée est dédupliquée
    expect(ranked[0].url).toBe("/shots/same.jpg");
  });

  it("ne compte pas deux fois la même source dans le consensus", () => {
    const ranked = rankAttachmentsForDisplay([
      { type: "screenshot" as const, source: "rawg", url: "/shots/b.jpg" },
      { type: "screenshot" as const, source: "igdb", url: "/shots/a.jpg" },
      { type: "screenshot" as const, source: "igdb", url: "/shots/a.jpg" },
      { type: "screenshot" as const, source: "igdb", url: "/shots/a.jpg" },
    ]);

    // a.jpg vient 3x de la même source => 1 source distincte => aucun bonus,
    // donc b.jpg (index 0) reste devant à score égal.
    expect(ranked[0].url).toBe("/shots/b.jpg");
  });

  it("départage des covers comparables par consensus multi-sources", () => {
    const shared = (source: string) => ({
      type: "cover" as const,
      source,
      role: "eu",
      url: "/c/shared.jpg",
    });
    const solo = {
      type: "cover" as const,
      source: "launchbox",
      role: "eu",
      url: "/c/solo.jpg",
    };

    // Même type (2D front) et même région => seul le consensus les départage.
    const ranked = rankCoversForDisplay([
      solo,
      shared("screenscraper"),
      shared("thegamesdb"),
    ]);

    expect(ranked[0].url).toBe("/c/shared.jpg");
  });

  it("garde la région la plus valuable quand une même URL est vue Monde puis France", () => {
    // La même image arrive d'abord taguée "wor" puis "fr" : la fusion par URL
    // doit conserver le tag France (le plus valuable), pas le premier vu.
    const ranked = rankAttachmentsForDisplay([
      {
        type: "cover" as const,
        source: "thegamesdb",
        role: "wor",
        url: "/x.jpg",
      },
      {
        type: "cover" as const,
        source: "screenscraper",
        role: "fr",
        url: "/x.jpg",
      },
    ]);

    expect(ranked).toHaveLength(1);
    expect(parseRegionFromRole(ranked[0].role)).toBe("fr");
  });

  it("pénalise et déclasse une cover full wrap signalée par le flag", () => {
    const fullWrap = {
      type: "cover" as const,
      role: "eu",
      url: "/uploads/wrap.jpg",
      isFullWrapCoverSource: true,
    };
    const standard = {
      type: "cover" as const,
      role: "eu",
      url: "/uploads/standard.jpg",
    };

    expect(explainAttachmentScoreForDisplay(fullWrap).signals).toContain(
      "-250 full wrap cover penalty",
    );

    // Le flag full wrap déclasse la cover (typeRank 2) sous une 2D standard (0).
    const ranked = rankCoversForDisplay([fullWrap, standard]);
    expect(ranked[0]).toBe(standard);
  });

  it("ordonne catalog > photo de listing > photo utilisateur dans une même région", () => {
    const catalog = {
      type: "cover" as const,
      role: "eu",
      url: "/uploads/catalog.jpg",
      coverProvenance: "catalog",
    };
    // The provenance tier is lexicographic and outranks the score: a photographed
    // copy always sorts below the catalogue render of the same region.
    const listingPhoto = {
      type: "cover" as const,
      role: "eu",
      url: "/uploads/listing.jpg",
      coverProvenance: "listing_photo",
    };
    const userPhoto = {
      type: "cover" as const,
      role: "eu",
      url: "/uploads/user.jpg",
      coverProvenance: "user_photo",
    };

    expect(
      rankCoversForDisplay([userPhoto, listingPhoto, catalog]).map(
        (a) => a.url,
      ),
    ).toEqual([
      "/uploads/catalog.jpg",
      "/uploads/listing.jpg",
      "/uploads/user.jpg",
    ]);
  });

  it("laisse la région primer sur la provenance (photo FR au-dessus d'un catalogue EU)", () => {
    const catalogEu = {
      type: "cover" as const,
      role: "eu",
      url: "/uploads/cat-eu.jpg",
      coverProvenance: "catalog",
    };
    const userPhotoFr = {
      type: "cover" as const,
      role: "fr",
      url: "/uploads/photo-fr.jpg",
      coverProvenance: "user_photo",
    };

    expect(rankCoversForDisplay([catalogEu, userPhotoFr])[0].url).toBe(
      "/uploads/photo-fr.jpg",
    );
  });

  it("garde une jaquette FR devant une photo marketplace plus nette", () => {
    const frCover = {
      type: "cover" as const,
      source: "bdovore",
      role: "fr",
      url: "/uploads/bdovore-small.jpg",
      width: 320,
      height: 480,
    };
    const marketplaceCover = {
      type: "cover" as const,
      source: "ebay",
      role: "marketplace",
      url: "/uploads/ebay-hd.jpg",
      width: 1600,
      height: 2400,
    };
    const metrics = new Map([
      [frCover.url, { width: 320, height: 480, format: "jpeg" as const }],
      [
        marketplaceCover.url,
        { width: 1600, height: 2400, format: "jpeg" as const },
      ],
    ]);

    expect(
      rankCoverGalleryAttachments([marketplaceCover, frCover], metrics).map(
        (attachment) => attachment.url,
      ),
    ).toEqual([frCover.url, marketplaceCover.url]);
  });

  it("garde une jaquette FR remote plutôt qu'une photo marketplace localisée", () => {
    const frRemote = {
      type: "cover" as const,
      source: "booknode",
      role: "fr",
      url: "https://cdn1.booknode.com/book_cover/1691/full/cover.jpg",
    };
    const marketplaceLocal = {
      type: "cover" as const,
      source: "ebay",
      role: "marketplace",
      url: "/uploads/ebay-listing.jpg",
      width: 1600,
      height: 2400,
    };

    expect(
      resolveStoredMetadataCoverUrl(
        frRemote.url,
        [marketplaceLocal, frRemote],
        new Map([
          [
            marketplaceLocal.url,
            { width: 1600, height: 2400, format: "jpeg" as const },
          ],
        ]),
      ),
    ).toBe(frRemote.url);
  });

  describe("pickBestBackgroundFromAttachments", () => {
    it("préfère la photo paysage haute-résolution à la cover portrait", () => {
      const attachments = [
        { type: "cover" as const, source: "bgg", url: "/cover.jpg" },
        { type: "image" as const, source: "philibert", url: "/photo.jpg" },
        { type: "image" as const, source: "archichouette", url: "/small.jpg" },
      ];
      const metrics = new Map([
        ["/cover.jpg", { width: 470, height: 475 }], // portrait, exclu (cover)
        ["/photo.jpg", { width: 5184, height: 3456 }], // paysage HD
        ["/small.jpg", { width: 800, height: 800 }], // ok mais carré + petit
      ]);

      expect(pickBestBackgroundFromAttachments(attachments, metrics)).toBe(
        "/photo.jpg",
      );
    });

    it("retourne null si aucune image n'atteint la résolution minimale", () => {
      const attachments = [
        { type: "image" as const, source: "x", url: "/tiny.jpg" },
      ];
      const metrics = new Map([["/tiny.jpg", { width: 400, height: 300 }]]);

      expect(
        pickBestBackgroundFromAttachments(attachments, metrics),
      ).toBeNull();
    });

    it("ignore les covers et les médias physiques (dos/disque)", () => {
      const attachments = [
        { type: "cover" as const, source: "x", role: "fr", url: "/c.jpg" },
        {
          type: "image" as const,
          source: "x",
          role: "back-fr",
          url: "/back.jpg",
        },
      ];
      const metrics = new Map([
        ["/c.jpg", { width: 2000, height: 3000 }],
        ["/back.jpg", { width: 2000, height: 2000 }],
      ]);

      expect(
        pickBestBackgroundFromAttachments(attachments, metrics),
      ).toBeNull();
    });
  });

  it("uses the same ordering for default cover pick and gallery rank", () => {
    const pricecharting = {
      type: "cover" as const,
      source: "pricecharting",
      role: "eu",
      url: "/pc.jpg",
      providerImageScoreAdjustment: 160,
    };
    const steamGrid = {
      type: "cover" as const,
      source: "steamgriddb",
      role: "wor",
      url: "/sg.jpg",
    };
    const metrics = new Map([
      [pricecharting.url, { width: 500, height: 700, format: "jpg" }],
      [steamGrid.url, { width: 600, height: 900, format: "png" }],
    ]);

    const ranked = rankCoverGalleryAttachments(
      [steamGrid, pricecharting],
      metrics,
      { requestedPlatformKey: "ps4" },
    );
    const picked = pickBestCoverFromAttachments(
      [steamGrid, pricecharting],
      metrics,
      { requestedPlatformKey: "ps4" },
    );

    expect(ranked[0]).toBe(pricecharting);
    expect(picked).toBe(pricecharting.url);
  });

  it("keeps retailer gallery photos when cover candidates are present", () => {
    const cover = {
      type: "cover" as const,
      source: "monsieurde",
      role: "fr",
      url: "/cover.jpg",
    };
    const ambiance = {
      type: "image" as const,
      source: "monsieurde",
      role: "fr",
      url: "/ambiance.jpg",
    };
    const metrics = new Map([
      [cover.url, { width: 800, height: 800, format: "jpg" }],
      [ambiance.url, { width: 1600, height: 900, format: "jpg" }],
    ]);

    const ranked = rankCoverGalleryAttachments([cover, ambiance], metrics);

    expect(ranked.map((attachment) => attachment.url)).toEqual([
      cover.url,
      ambiance.url,
    ]);
  });

  it("prefers PS4 covers over PS3-tagged art on a PS4 shelf", () => {
    const ps3Cover = {
      type: "cover" as const,
      source: "ebay",
      role: "uk",
      url: "https://example.com/God-Of-War-III-PS3-PLAYSTATION-3.webp",
    };
    const ps4Cover = {
      type: "cover" as const,
      source: "pricecharting",
      role: "uk",
      url: "https://example.com/god-of-war-iii-remastered-ps4.webp",
      providerImageScoreAdjustment: 160,
    };
    const metrics = new Map([
      [ps3Cover.url, { width: 500, height: 700, format: "webp" }],
      [ps4Cover.url, { width: 500, height: 700, format: "webp" }],
    ]);

    const ranked = rankCoverGalleryAttachments([ps3Cover, ps4Cover], metrics, {
      requestedPlatformKey: "ps4",
    });
    expect(ranked[0]).toBe(ps4Cover);
  });

  it("prefers PS4 covers over Switch-tagged FR art on a PS4 shelf", () => {
    const switchCover = {
      type: "cover" as const,
      source: "chocobonplan",
      role: "fr",
      url: "https://example.com/ace-attorney-switch.jpg",
      title: "the great ace attorney switch visuel produit",
    };
    const ps4Cover = {
      type: "cover" as const,
      source: "geedie",
      role: "eu",
      url: "https://example.com/ace-attorney-ps4.jpg",
      title: "PS4 The Great Ace Attorney Chronicles",
    };
    const metrics = new Map([
      [switchCover.url, { width: 800, height: 1200, format: "png" }],
      [ps4Cover.url, { width: 600, height: 900, format: "jpg" }],
    ]);

    const ranked = rankCoverGalleryAttachments(
      [switchCover, ps4Cover],
      metrics,
      { requestedPlatformKey: "ps4" },
    );
    expect(ranked[0]).toBe(ps4Cover);
  });

  it("keeps platform-ambiguous covers visible but ranks them below matching box art", () => {
    const marketplaceCover = {
      type: "cover" as const,
      source: "achatmoinscher",
      role: "fr",
      url: "/uploads/amc.jpg",
    };
    const ps3Cover = {
      type: "cover" as const,
      source: "geedie",
      role: "eu",
      url: "/uploads/ps3.jpg",
      title: "PS3 The Elder Scrolls IV: Oblivion 5th Anniversary Edition",
    };

    // Rule: an unidentified-platform cover is never hidden — with or without
    // shelf-aligned box art present — it only sinks in the ranking.
    expect(
      shouldShowCoverAttachmentOnShelf(marketplaceCover, "ps3", [
        marketplaceCover,
        ps3Cover,
      ]),
    ).toBe(true);
    expect(
      shouldShowCoverAttachmentOnShelf(marketplaceCover, "ps3", [
        marketplaceCover,
      ]),
    ).toBe(true);

    const ranked = rankCoverGalleryAttachments(
      [marketplaceCover, ps3Cover],
      undefined,
      { requestedPlatformKey: "ps3" },
    );
    expect(ranked[0]).toBe(ps3Cover);
    expect(ranked).toContain(marketplaceCover);
  });

  it("drops a cover positively identified on another console", () => {
    const xboxCover = {
      type: "cover" as const,
      source: "geedie",
      role: "eu",
      url: "/uploads/xbox.jpg",
      platformKey: "xbox-360",
    };
    expect(
      shouldShowCoverAttachmentOnShelf(xboxCover, "ps3", [xboxCover]),
    ).toBe(false);
  });

  it("keeps strict retail covers without a platform tag in the gallery", () => {
    const geedieCover = {
      type: "cover" as const,
      source: "geedie",
      role: "eu",
      url: "/uploads/78e2afc0409d9fdb969fd5acb2b9f3de.webp",
      strictShelfPlatformCoverSource: true,
    };
    const ps4Cover = {
      type: "cover" as const,
      source: "icollect",
      url: "/uploads/icollect-ps4.jpg",
      title: "PS4 Metal Gear Solid Master Collection Vol. 1",
    };

    expect(
      shouldShowCoverAttachmentOnShelf(geedieCover, "ps4", [
        geedieCover,
        ps4Cover,
      ]),
    ).toBe(true);
  });

  it("ranks a shelf-platform 2D cover ahead of a higher-scoring ambiguous FR box", () => {
    const marketplaceCover = {
      type: "cover" as const,
      source: "netgamesretro",
      role: "fr",
      url: "/uploads/marketplace-2d.jpg",
      width: 1200,
      height: 1600,
    };
    const vitaCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "us",
      url: "/uploads/vita-2d.jpg",
      platformKey: "psvita",
      width: 800,
      height: 1200,
    };

    const ranked = rankCoverGalleryAttachments(
      [marketplaceCover, vitaCover],
      new Map([
        [marketplaceCover.url, { width: 1200, height: 1600 }],
        [vitaCover.url, { width: 800, height: 1200 }],
      ]),
      { requestedPlatformKey: "psvita", uiLocale: "fr" },
    );

    expect(ranked[0]).toBe(vitaCover);
  });

  it("prefers a platform-matched 2D cover over a platform-matched 3D cover", () => {
    const vita3d = {
      type: "cover" as const,
      source: "screenscraper",
      role: "3d-us",
      url: "/uploads/vita-3d.jpg",
      platformKey: "psvita",
    };
    const vita2d = {
      type: "cover" as const,
      source: "screenscraper",
      role: "us",
      url: "/uploads/vita-2d.jpg",
      platformKey: "psvita",
    };

    const ranked = rankCoverGalleryAttachments([vita3d, vita2d], undefined, {
      requestedPlatformKey: "psvita",
      uiLocale: "fr",
    });

    expect(ranked[0]).toBe(vita2d);
  });

  it("ranks localized ScreenScraper FR with platformKey alongside Launchbox FR on a GB shelf", () => {
    const launchboxFr = {
      type: "cover" as const,
      source: "launchbox",
      role: "fr",
      url: "/uploads/lb-fr.jpg",
      title: "Box - Front",
      platformKey: "gb",
    };
    const screenScraperFr = {
      type: "cover" as const,
      source: "screenscraper",
      role: "fr",
      url: "/uploads/ss-fr.jpg",
      platformKey: "gb",
    };
    const launchboxEu = {
      type: "cover" as const,
      source: "launchbox",
      role: "eu",
      url: "/uploads/lb-eu.jpg",
      title: "Box - Front",
      platformKey: "gb",
    };

    const ranked = rankCoverGalleryAttachments(
      [launchboxEu, screenScraperFr, launchboxFr],
      undefined,
      { requestedPlatformKey: "gb", uiLocale: "fr" },
    );

    expect(
      ranked.slice(0, 2).every((attachment) => attachment.role === "fr"),
    ).toBe(true);
    expect(ranked[2]?.url).toBe("/uploads/lb-eu.jpg");
  });

  it("does not infer platform from localized upload filenames", () => {
    const cover = {
      type: "cover" as const,
      source: "geedie",
      role: "eu",
      url: "/uploads/vita.jpg",
      title: "Angry Birds Star Wars",
      strictShelfPlatformCoverSource: true,
    };
    expect(shouldShowCoverAttachmentOnShelf(cover, "psvita", [cover])).toBe(
      true,
    );
    expect(
      rankCoverGalleryAttachments([cover], undefined, {
        requestedPlatformKey: "psvita",
      }),
    ).toContain(cover);
  });

  it("drops Xbox One box art on an Xbox Series shelf", () => {
    const xboxOneBox = {
      type: "cover" as const,
      source: "screenscraper",
      role: "eu",
      url: "/uploads/xboxone-box.jpg",
      platformKey: "xboxone",
    };
    const xboxSeriesGrid = {
      type: "cover" as const,
      source: "steamgriddb",
      role: "grid-vertical",
      url: "/uploads/grid.jpg",
      platformKey: "xboxseries",
    };
    const metrics = new Map([
      [xboxOneBox.url, { width: 800, height: 1200, format: "jpeg" }],
      [xboxSeriesGrid.url, { width: 900, height: 1200, format: "png" }],
    ]);

    expect(
      shouldShowCoverAttachmentOnShelf(xboxOneBox, "xboxseries", [
        xboxOneBox,
        xboxSeriesGrid,
      ]),
    ).toBe(false);

    expect(
      pickBestCoverFromAttachments([xboxSeriesGrid, xboxOneBox], metrics, {
        requestedPlatformKey: "xboxseries",
      }),
    ).toBe(xboxSeriesGrid.url);
  });

  it("keeps game-media gallery covers when a marketplace listing anchors the shelf platform", () => {
    const icollectCover = {
      type: "cover" as const,
      source: "icollect",
      role: "marketplace",
      url: "/uploads/icollect-xbox360.jpg",
      title:
        "Alice: Retour Au Pays De La Folie - Microsoft Xbox 360 (Boite Et Notice) - Main Image 1",
    };
    const screenScraperCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "eu",
      url: "/uploads/ss-eu.jpg",
      isGameMediaGallerySource: true,
    };

    expect(
      shouldShowCoverAttachmentOnShelf(screenScraperCover, "xbox360", [
        icollectCover,
        screenScraperCover,
      ]),
    ).toBe(true);
  });

  it("keeps LaunchBox disc/back/spine when reordering for persist", () => {
    // rankCoverGalleryAttachments omits backs/spines from the cover-picker
    // order; persist must still keep them (same trailing recovery as merge).
    const front = {
      type: "cover" as const,
      source: "launchbox",
      role: "us",
      title: "Box - Front",
      url: "/uploads/lb-front.jpg",
    };
    const back = {
      type: "image" as const,
      source: "launchbox",
      role: "back-us",
      title: "Box - Back",
      url: "/uploads/lb-back.jpg",
    };
    const spine = {
      type: "image" as const,
      source: "launchbox",
      role: "spine-us",
      title: "Box - Spine",
      url: "/uploads/lb-spine.jpg",
    };
    const disc = {
      type: "image" as const,
      source: "launchbox",
      role: "disc-us",
      title: "Disc",
      url: "/uploads/lb-disc.png",
    };
    const logo = {
      type: "logo" as const,
      source: "launchbox",
      title: "Clear Logo",
      url: "/uploads/lb-logo.png",
    };

    const ordered = reorderAttachmentsCoverFirst([
      front,
      back,
      spine,
      disc,
      logo,
    ]);
    const urls = ordered.map((attachment) => attachment.url);

    expect(urls).toContain(front.url);
    expect(urls).toContain(disc.url);
    expect(urls).toContain(back.url);
    expect(urls).toContain(spine.url);
    expect(urls).toContain(logo.url);
    expect(urls.indexOf(front.url)).toBeLessThan(urls.indexOf(back.url));
  });
});
