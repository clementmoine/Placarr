import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/httpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http/httpClient")>();
  return { ...actual, httpGet: vi.fn() };
});

import { httpGet } from "@/lib/http/httpClient";
import {
  mapBricksetRawSet,
  resolveBricksetSet,
  searchBricksetSets,
} from "./fetch";
import { bricksetModule, mapBricksetMetadata } from "./index";

const httpGetMock = vi.mocked(httpGet);

const SAMPLE_RAW = {
  setID: 22727,
  number: "75192",
  numberVariant: 1,
  name: "Millennium Falcon",
  year: 2017,
  theme: "Star Wars",
  subtheme: "Ultimate Collector Series",
  pieces: 7541,
  minifigs: 8,
  bricksetURL: "https://brickset.com/sets/75192-1",
  rating: 4.6,
  ratingCount: 120,
  image: {
    imageURL: "https://images.brickset.com/sets/large/75192-1.jpg",
  },
  ageRange: { min: 16, max: 99 },
  barcode: { EAN: "5702015867531", UPC: "673419265158" },
  extendedData: { description: "The ultimate Millennium Falcon." },
  LEGOCom: { DE: { retailPrice: 799.99 } },
};

describe("mapBricksetRawSet", () => {
  it("maps set number, barcodes and EUR retail cents", () => {
    const set = mapBricksetRawSet(SAMPLE_RAW);
    expect(set).toMatchObject({
      setId: 22727,
      setNumber: "75192-1",
      name: "Millennium Falcon",
      barcodeEan: "5702015867531",
      pieces: 7541,
      retailPriceEur: 79999,
    });
  });
});

describe("mapBricksetMetadata", () => {
  it("emits barcode observations for a set fiche", () => {
    const meta = mapBricksetMetadata(mapBricksetRawSet(SAMPLE_RAW));
    expect(meta?.barcode).toBe("5702015867531");
    expect(meta?.externalIds?.legoSet).toBe("75192-1");
    expect(meta?.observations?.length).toBeGreaterThan(0);
  });
});

describe("brickset fetch", () => {
  const saved = process.env.BRICKSET_API_KEY;

  beforeEach(() => {
    httpGetMock.mockReset();
    process.env.BRICKSET_API_KEY = "test-key";
  });

  afterEach(() => {
    if (saved !== undefined) process.env.BRICKSET_API_KEY = saved;
    else delete process.env.BRICKSET_API_KEY;
  });

  it("searches and prefers barcode match", async () => {
    httpGetMock.mockResolvedValue({
      data: { status: "success", sets: [SAMPLE_RAW] },
    } as never);
    const hits = await searchBricksetSets("Millennium Falcon");
    expect(hits).toHaveLength(1);

    const resolved = await resolveBricksetSet({
      barcode: "5702015867531",
      name: "other",
    });
    expect(resolved?.setNumber).toBe("75192-1");
  });

  it("returns null without an API key", async () => {
    delete process.env.BRICKSET_API_KEY;
    expect(await resolveBricksetSet({ name: "75192-1" })).toBeNull();
  });
});

describe("bricksetModule", () => {
  it("declares toys capabilities via defineProvider", () => {
    expect(bricksetModule.info.id).toBe("brickset");
    expect(bricksetModule.info.types).toEqual(["toys"]);
    expect(bricksetModule.info.capabilities).toContain("identify");
    expect(bricksetModule.createMetadataAdapter).toBeTypeOf("function");
  });
});
