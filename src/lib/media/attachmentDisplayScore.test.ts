import { describe, expect, it } from "vitest";

import { parseRegionFromRole } from "@/lib/locale/preference";

import {
  explainAttachmentScoreForDisplay,
  pickBestBackgroundFromAttachments,
  pickBestCoverFromAttachments,
  rankCoverGalleryAttachments,
  rankAttachmentsForDisplay,
  rankCoversForDisplay,
} from "./attachmentDisplayScore";

describe("attachmentDisplayScore", () => {
  it("priorise les covers ScreenScraper, qui sont des scans de vraies boîtes", () => {
    const steamGridCover = {
      type: "cover" as const,
      source: "steamgriddb",
      role: "grid-vertical",
      url: "/uploads/steamgrid.png",
    };
    const screenScraperCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "uk",
      url: "/uploads/screenscraper.jpg",
      isRealBoxCoverSource: true,
    };
    const metrics = new Map([
      [steamGridCover.url, { width: 600, height: 900, format: "png" }],
      [screenScraperCover.url, { width: 486, height: 606, format: "jpg" }],
    ]);

    expect(
      rankAttachmentsForDisplay(
        [steamGridCover, screenScraperCover],
        metrics,
      )[0],
    ).toBe(screenScraperCover);
  });

  it("documente le bonus de source vraie boîte via le flag stampé serveur", () => {
    const details = explainAttachmentScoreForDisplay({
      type: "cover",
      source: "screenscraper",
      url: "/uploads/cover.jpg",
      isRealBoxCoverSource: true,
    });

    expect(details.signals).toContain("+220 real box cover source");
  });

  it("applique l'ajustement de score image déclaré par le provider", () => {
    const details = explainAttachmentScoreForDisplay({
      type: "cover",
      source: "picclick",
      url: "/uploads/listing.jpg",
      providerImageScoreAdjustment: -280,
    });

    expect(details.signals).toContain("-280 provider image source");
  });

  it("prefere une jaquette lumineuse a un scan Bédéthèque sous-expose", () => {
    const darkScan = {
      type: "cover" as const,
      source: "bedetheque",
      role: "fr",
      url: "/uploads/dark-scan.jpg",
      isRealBoxCoverSource: true,
    };
    const brightCover = {
      type: "cover" as const,
      source: "booknode",
      role: "fr",
      url: "/uploads/bright-cover.webp",
      isRealBoxCoverSource: true,
    };
    const metrics = new Map([
      [
        darkScan.url,
        {
          width: 850,
          height: 1228,
          format: "jpeg",
          meanLuminance: 84,
          darkPixelRatio: 0.52,
        },
      ],
      [
        brightCover.url,
        {
          width: 264,
          height: 400,
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
    expect(
      pickBestCoverFromAttachments([darkScan, brightCover], metrics),
    ).toBe(brightCover.url);
  });

  it("n'ecarte pas une jaquette catalogue marquee a tort en photo listing", () => {
    const catalogCover = {
      type: "cover" as const,
      source: "bedetheque",
      role: "fr",
      url: "/uploads/catalog-scan.jpg",
      isRealBoxCoverSource: true,
    };
    const metrics = new Map([
      [
        catalogCover.url,
        {
          width: 400,
          height: 570,
          format: "jpeg",
          isListingPhoto: true,
        },
      ],
    ]);

    expect(
      pickBestCoverFromAttachments([catalogCover], metrics),
    ).toBe(catalogCover.url);
    expect(
      explainAttachmentScoreForDisplay(
        catalogCover,
        metrics.get(catalogCover.url),
      ).signals,
    ).not.toContain("-480 seller listing photo");
  });

  it("penalise fortement les photos listing vendeur et les exclut du cover par defaut", () => {
    const listingPhoto = {
      type: "cover" as const,
      source: "picclick",
      role: "wor",
      url: "/uploads/seller-photo.jpg",
    };
    const cleanCover = {
      type: "cover" as const,
      source: "picclick",
      role: "wor",
      url: "/uploads/clean-render.jpg",
    };
    const metrics = new Map([
      [
        listingPhoto.url,
        { width: 480, height: 640, format: "webp", isListingPhoto: true },
      ],
      [
        cleanCover.url,
        { width: 512, height: 640, format: "webp", isListingPhoto: false },
      ],
    ]);

    const listingDetails = explainAttachmentScoreForDisplay(
      listingPhoto,
      metrics.get(listingPhoto.url),
    );
    const cleanDetails = explainAttachmentScoreForDisplay(
      cleanCover,
      metrics.get(cleanCover.url),
    );

    expect(listingDetails.signals).toContain("-480 seller listing photo");
    expect(cleanDetails.score).toBeGreaterThan(listingDetails.score);
    expect(
      pickBestCoverFromAttachments([listingPhoto, cleanCover], metrics),
    ).toBe(cleanCover.url);
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
      isRealBoxCoverSource: true,
    };
    const screenScraperCover = {
      type: "cover" as const,
      source: "screenscraper",
      role: "eu",
      url: "https://api.screenscraper.fr/api2/mediaJeu.php?systemeid=32&jeuid=14835&media=box-2D(eu)",
    };

    expect(parseRegionFromRole("europe")).toBe("eu");
    expect(explainAttachmentScoreForDisplay(launchboxCover).signals).toContain(
      "+220 real box cover source",
    );
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
      // A real CoverProject attachment is stamped both real-box and full-wrap by
      // the server; the full-wrap flag is what de-ranks it below 2D/3D fronts.
      isRealBoxCoverSource: true,
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

  it("classe une cover marquée vraie boîte au-dessus d'une cover identique sans le flag", () => {
    const flagged = {
      type: "cover" as const,
      role: "eu",
      url: "/uploads/flagged.jpg",
      isRealBoxCoverSource: true,
    };
    const plain = {
      type: "cover" as const,
      role: "eu",
      url: "/uploads/plain.jpg",
    };

    // Même type (2D front) et même région : seul le bonus +220 départage, même si
    // `plain` est en tête de liste (index 0).
    const ranked = rankCoversForDisplay([plain, flagged]);
    expect(ranked[0]).toBe(flagged);

    expect(explainAttachmentScoreForDisplay(flagged).signals).toContain(
      "+220 real box cover source",
    );
    expect(explainAttachmentScoreForDisplay(plain).signals).not.toContain(
      "+220 real box cover source",
    );
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
      isRealBoxCoverSource: true,
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

  it("prefers PS4 covers over PS3-tagged art on a PS4 shelf", () => {
    const ps3Cover = {
      type: "cover" as const,
      source: "picclick",
      role: "uk",
      url: "https://example.com/God-Of-War-III-PS3-PLAYSTATION-3.webp",
      isRealBoxCoverSource: true,
    };
    const ps4Cover = {
      type: "cover" as const,
      source: "pricecharting",
      role: "uk",
      url: "https://example.com/god-of-war-iii-remastered-ps4.webp",
      isRealBoxCoverSource: true,
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
      isRealBoxCoverSource: true,
    };
    const ps4Cover = {
      type: "cover" as const,
      source: "geedie",
      role: "eu",
      url: "https://example.com/ace-attorney-ps4.jpg",
      title: "PS4 The Great Ace Attorney Chronicles",
      isRealBoxCoverSource: true,
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
});
