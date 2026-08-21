import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetLorcanaSetLogoIndexForTests,
  installLorcanaSetLogos,
  lorcanaLogoUrlForSet,
  LORCANA_CATALOG_URL,
  lorcanaSetIdsInText,
  lorcanaSetLogoAssetUrl,
  lorcanaSetLogoCodes,
  parseLorcanaSetLogosFromCatalog,
  type LorcanaSetLogoIndex,
} from "./setLogos";

const CATALOG = {
  card_sets: [
    {
      id: "set1",
      name: "Premier Chapitre",
      thumbnail_image_url:
        "https://api.lorcana.ravensburger.com/images/fr/set1/thumbnails/aaa.png",
    },
    {
      id: "set12",
      name: "Contrées Inconnues",
      thumbnail_image_url:
        "https://api.lorcana.ravensburger.com/images/fr/set12/thumbnails/ccc.png",
    },
    {
      id: "quest1",
      name: "Menace des profondeurs – Quête des Illumineurs",
      thumbnail_image_url:
        "https://api.lorcana.ravensburger.com/images/fr/quest1/thumbnails/111.png",
    },
    {
      id: "quest2",
      name: "Vol au Palais – Quête des Illumineurs",
      thumbnail_image_url:
        "https://api.lorcana.ravensburger.com/images/fr/quest2/thumbnails/222.png",
    },
    {
      id: "gateway1",
      name: "Prélude",
      thumbnail_image_url:
        "https://api.lorcana.ravensburger.com/images/fr/gateway1/thumbnails/333.png",
    },
    {
      id: "promo",
      name: "Skip",
      thumbnail_image_url: "https://example.test/x.png",
    },
    { id: "set99", name: "No art" },
  ],
};

const FIXTURE: LorcanaSetLogoIndex = {
  version: 2,
  language: "fr",
  source: LORCANA_CATALOG_URL,
  fetchedAt: "2026-08-19T00:00:00.000Z",
  sets: [
    {
      id: "set1",
      name: "Premier Chapitre",
      sourceUrl:
        "https://api.lorcana.ravensburger.com/images/fr/set1/thumbnails/aaa.png",
      logo: "/assets/lorcana/products/sets/set1/logo.png",
    },
    {
      id: "set2",
      name: "L'Ascension des Floodborn",
      sourceUrl:
        "https://api.lorcana.ravensburger.com/images/fr/set2/thumbnails/bbb.png",
      logo: "/assets/lorcana/products/sets/set2/logo.png",
    },
    {
      id: "set12",
      name: "Contrées Inconnues",
      sourceUrl:
        "https://api.lorcana.ravensburger.com/images/fr/set12/thumbnails/ccc.png",
      logo: "/assets/lorcana/products/sets/set12/logo.png",
    },
    {
      id: "quest1",
      name: "Menace des profondeurs – Quête des Illumineurs",
      sourceUrl:
        "https://api.lorcana.ravensburger.com/images/fr/quest1/thumbnails/111.png",
      logo: "/assets/lorcana/products/sets/quest1/logo.png",
    },
    {
      id: "quest2",
      name: "Vol au Palais – Quête des Illumineurs",
      sourceUrl:
        "https://api.lorcana.ravensburger.com/images/fr/quest2/thumbnails/222.png",
      logo: "/assets/lorcana/products/sets/quest2/logo.png",
    },
    {
      id: "gateway1",
      name: "Prélude",
      sourceUrl:
        "https://api.lorcana.ravensburger.com/images/fr/gateway1/thumbnails/333.png",
      logo: "/assets/lorcana/products/sets/gateway1/logo.png",
    },
  ],
};

describe("parseLorcanaSetLogosFromCatalog", () => {
  it("reads card_sets thumbs as chapter / quest / gateway logos", () => {
    const rows = parseLorcanaSetLogosFromCatalog(CATALOG);
    expect(rows.map((row) => row.id)).toEqual([
      "gateway1",
      "quest1",
      "quest2",
      "set1",
      "set12",
    ]);
    expect(rows.find((row) => row.id === "set12")).toEqual({
      id: "set12",
      name: "Contrées Inconnues",
      sourceUrl:
        "https://api.lorcana.ravensburger.com/images/fr/set12/thumbnails/ccc.png",
    });
  });

  it("skips a missing list, a blank thumb, or an id that is not a set", () => {
    expect(parseLorcanaSetLogosFromCatalog({})).toEqual([]);
    expect(parseLorcanaSetLogosFromCatalog(null)).toEqual([]);
  });
});

describe("lorcanaSetIdsInText", () => {
  it("picks set-12 out of a lorcards slug and leaves a collector ref alone", () => {
    expect(
      lorcanaSetIdsInText("booster-set-12-contrees-inconnues-woody"),
    ).toEqual(["set12"]);
    expect(lorcanaSetIdsInText("241-204")).toEqual([]);
    expect(lorcanaSetIdsInText("Chapitre 1")).toEqual(["set1"]);
    expect(lorcanaSetIdsInText("q2")).toEqual(["quest2"]);
    expect(lorcanaSetIdsInText("quete 1")).toEqual(["quest1"]);
    expect(lorcanaSetIdsInText("QU2")).toEqual(["quest2"]);
  });
});

describe("lorcanaSetLogoCodes", () => {
  it("adds the chapter number and quest qN form", () => {
    expect(lorcanaSetLogoCodes({ id: "set12" }).sort()).toEqual([
      "12",
      "set12",
    ]);
    expect(lorcanaSetLogoCodes({ id: "quest1" }).sort()).toEqual([
      "q1",
      "quest1",
    ]);
  });
});

describe("lorcanaLogoUrlForSet", () => {
  it("joins a Woody booster via slug set-12 even when the shop code is WIL", () => {
    expect(
      lorcanaLogoUrlForSet({
        setCode: "WIL",
        slug: "booster-set-12-contrees-inconnues-woody",
        name: "Booster Set 12 Contrées Inconnues - Woody",
        index: FIXTURE,
      }),
    ).toBe("/assets/lorcana/products/sets/set12/logo.png");
  });

  it("matches a numeric setCode and a unique full name", () => {
    expect(
      lorcanaLogoUrlForSet({
        setCode: "12",
        index: FIXTURE,
      }),
    ).toBe("/assets/lorcana/products/sets/set12/logo.png");
    expect(
      lorcanaLogoUrlForSet({
        setCode: "1",
        index: FIXTURE,
      }),
    ).toBe("/assets/lorcana/products/sets/set1/logo.png");
    expect(
      lorcanaLogoUrlForSet({
        slug: "trove-prelude",
        name: "Trove Prélude",
        index: FIXTURE,
      }),
    ).toBe("/assets/lorcana/products/sets/gateway1/logo.png");
  });

  it("joins Rise of the Floodborn via the unique catalog word, even under ROTF", () => {
    expect(
      lorcanaLogoUrlForSet({
        setCode: "ROTF",
        slug: "booster-rise-of-the-floodborn-reine-de-coeur",
        name: "Booster Rise of the Floodborn - La Reine de Cœur",
        index: FIXTURE,
      }),
    ).toBe("/assets/lorcana/products/sets/set2/logo.png");
    expect(
      lorcanaLogoUrlForSet({
        setCode: "ROTF",
        slug: "booster-blister-carton-ascencion-des-floodborn-raya",
        name: "Booster Blister Carton Ascension des Floodborn - Raya",
        index: FIXTURE,
      }),
    ).toBe("/assets/lorcana/products/sets/set2/logo.png");
    expect(
      lorcanaLogoUrlForSet({
        slug: "display-24-boosters-ascension-des-floodborn",
        index: FIXTURE,
      }),
    ).toBe("/assets/lorcana/products/sets/set2/logo.png");
  });

  it("stays empty on a shop abbr, a shared quest subtitle, or a missing index", () => {
    expect(
      lorcanaLogoUrlForSet({
        setCode: "WIL",
        slug: "booster-woody",
        index: FIXTURE,
      }),
    ).toBeNull();
    expect(
      lorcanaLogoUrlForSet({
        name: "Quête des Illumineurs",
        index: FIXTURE,
      }),
    ).toBeNull();
    expect(
      lorcanaLogoUrlForSet({
        slug: "booster-set-12-woody",
        index: null,
      }),
    ).toBeNull();
  });
});

describe("installLorcanaSetLogos", () => {
  let dir: string;

  beforeEach(() => {
    __resetLorcanaSetLogoIndexForTests();
    dir = mkdtempSync(path.join(os.tmpdir(), "lorcana-logos-"));
  });

  afterEach(() => {
    __resetLorcanaSetLogoIndexForTests();
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  it("dumps each catalog thumb next to a staging index", async () => {
    const png = Buffer.from("png");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        arrayBuffer: async () => png,
        status: 200,
        url,
      })),
    );
    const dest = path.join(dir, "set-logos.json");
    const logosDir = path.join(dir, "sets");
    const index = await installLorcanaSetLogos(
      parseLorcanaSetLogosFromCatalog(CATALOG),
      { dest, logosDir },
    );
    expect(index.sets).toHaveLength(5);
    expect(index.source).toBe(LORCANA_CATALOG_URL);
    expect(index.sets.find((row) => row.id === "set12")?.logo).toBe(
      lorcanaSetLogoAssetUrl("set12"),
    );
    expect(readFileSync(path.join(logosDir, "set12", "logo.png"))).toEqual(png);
    const onDisk = JSON.parse(
      readFileSync(dest, "utf8"),
    ) as LorcanaSetLogoIndex;
    expect(onDisk.sets).toHaveLength(5);
  });
});
