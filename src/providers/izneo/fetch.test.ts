import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const readIzneoSearchEvidence = vi.fn();
const promoteIzneoSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  izneoSearchEvidenceUrl: (query: string) => {
    const url = new URL("https://www.izneo.com/search");
    url.searchParams.set("q", query.trim());
    return url.toString();
  },
  readIzneoSearchEvidence: (...args: unknown[]) =>
    readIzneoSearchEvidence(...args),
  promoteIzneoSearchEvidence: (...args: unknown[]) =>
    promoteIzneoSearchEvidence(...args),
}));

import axios from "axios";

import {
  izneoAlbumCoverUrl,
  isCandidateAligned,
  mapIzneoAlbumPayload,
  parseIzneoSearchPayload,
  parseIzneoVolumesPayload,
  pickVolume,
  searchIzneoSeries,
} from "./fetch";
import { mapIzneoMetadata } from "./index";

const mockedGet = vi.mocked(axios.get);

describe("izneo", () => {
  it("parse la recherche series", () => {
    const hits = parseIzneoSearchPayload({
      series: [
        {
          id: "5841",
          title: "Astérix",
          rate: "4.2",
          rateAmount: "1226",
          genreName: "Humour",
          shelf: "bd",
          slug: "asterix",
        },
      ],
    });
    expect(hits[0]).toMatchObject({
      id: "5841",
      title: "Astérix",
      ratingValue: 4.2,
      ratingCount: 1226,
    });
  });

  it("parse les volumes de série", () => {
    const volumes = parseIzneoVolumesPayload({
      albums: [
        {
          id: "5255",
          title: "Astérix - Astérix et Cléopâtre - n°6",
          volume: "6",
          ean: "9782012101388",
        },
      ],
    });
    expect(volumes[0]).toMatchObject({
      id: "5255",
      volume: "6",
      ean: "9782012101388",
    });
  });

  it("mappe une fiche album", () => {
    const album = mapIzneoAlbumPayload({
      id: "5255",
      title: "Astérix - Astérix et Cléopâtre - n°6",
      displayTitle: "T6 - Astérix",
      synopsis: "Astérix en Égypte.",
      ean: "9782012101388",
      volume: "6",
      serieName: "Astérix",
      serieUrl: "/fr/bd/humour/asterix-5841",
      url: "/fr/bd/humour/asterix-5841/asterix-asterix-et-cleopatre-n-6-5255",
      rate: 4,
      rateAmount: 29,
      totalPages: "60",
      publicationDate: "2013-04-15",
      price: "7.99",
      authors: [{ name: "Goscinny" }, { name: "Albert Uderzo" }],
      publishers: [{ name: "Hachette Astérix" }],
      genres: [{ name: "Humour" }],
    });
    expect(album).toMatchObject({
      id: "5255",
      barcode: "9782012101388",
      pageCount: 60,
      priceCents: 799,
      seriesName: "Astérix",
      imageUrl: izneoAlbumCoverUrl("5255"),
    });
    const metadata = mapIzneoMetadata(album);
    expect(metadata?.facts?.find((f) => f.kind === "rating")?.value).toBe(
      "4/5 (29 notes)",
    );
    expect(metadata?.externalIds).toEqual({ izneo: "5255" });
  });

  it("refuse un tome Wakfu au mauvais sous-titre", () => {
    const query = "WAKFU 3 Les Mines de Lamororia";
    expect(
      isCandidateAligned(query, "Wakfu - Les mines de Lamororia - n°3"),
    ).toBe(true);
    expect(isCandidateAligned(query, "Wakfu - Shak Shaka - n°3")).toBe(false);
    expect(isCandidateAligned(query, "Wakfu Tome 3")).toBe(false);

    const picked = pickVolume(
      [
        {
          id: "wrong",
          title: "Wakfu - Shak Shaka - n°3",
          volume: "3",
        },
        {
          id: "right",
          title: "Wakfu - Les mines de Lamororia - n°3",
          volume: "3",
        },
      ],
      query,
    );
    expect(picked?.id).toBe("right");
  });
});

describe("searchIzneoSeries", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readIzneoSearchEvidence.mockReset();
    promoteIzneoSearchEvidence.mockReset();
    readIzneoSearchEvidence.mockResolvedValue(null);
    promoteIzneoSearchEvidence.mockResolvedValue(undefined);
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        id: "5841",
        title: "Astérix",
        ratingValue: 4.2,
        ratingCount: 1226,
      },
    ];
    readIzneoSearchEvidence.mockResolvedValueOnce(hits);

    await expect(searchIzneoSeries("Astérix")).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteIzneoSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: {
        series: [
          {
            id: "5841",
            title: "Astérix",
            rate: "4.2",
            rateAmount: "1226",
          },
        ],
      },
    } as never);

    const hits = await searchIzneoSeries("Astérix");
    expect(hits[0]?.id).toBe("5841");
    expect(promoteIzneoSearchEvidence).toHaveBeenCalledWith(
      "https://www.izneo.com/search?q=Ast%C3%A9rix",
      expect.arrayContaining([
        expect.objectContaining({ id: "5841" }),
      ]),
    );
  });
});
