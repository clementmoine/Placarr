import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/http/httpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http/httpClient")>();
  return {
    ...actual,
    httpGet: vi.fn(),
  };
});

import { httpGet } from "@/lib/http/httpClient";
import { mapJikanRawManga, resolveJikanManga, searchJikanManga } from "./fetch";
import { mapJikanMetadata, jikanModule } from "./index";

const httpGetMock = vi.mocked(httpGet);

const SAMPLE_RAW = {
  mal_id: 1,
  url: "https://myanimelist.net/manga/1/Monster",
  title: "Monster",
  title_english: "Monster",
  title_japanese: "モンスター",
  title_synonyms: ["Monsutā"],
  type: "Manga",
  status: "Finished",
  volumes: 18,
  chapters: 162,
  score: 9.15,
  scored_by: 100_000,
  synopsis: "Dr. Tenma faces a former patient.",
  images: {
    jpg: {
      large_image_url: "https://cdn.myanimelist.net/images/manga/3/monster.jpg",
    },
  },
  authors: [{ name: "Urasawa, Naoki" }],
  genres: [{ name: "Mystery" }, { name: "Drama" }],
  demographics: [{ name: "Seinen" }],
  published: {
    from: "1994-12-05T00:00:00+00:00",
    string: "Dec 5, 1994 to Dec 20, 2001",
  },
};

describe("mapJikanRawManga", () => {
  it("maps MAL fields and normalizes author commas", () => {
    const manga = mapJikanRawManga(SAMPLE_RAW);
    expect(manga).toMatchObject({
      malId: 1,
      title: "Monster",
      titleEnglish: "Monster",
      titleJapanese: "モンスター",
      volumes: 18,
      score: 9.15,
      authors: ["Urasawa Naoki"],
      demographics: ["Seinen"],
      publishedFrom: "1994",
    });
    expect(manga?.genres).toEqual(expect.arrayContaining(["Mystery", "Drama"]));
  });

  it("rejects empty titles", () => {
    expect(mapJikanRawManga({ mal_id: 2, title: "  " })).toBeNull();
  });
});

describe("mapJikanMetadata", () => {
  it("builds observations and prefers English display title", () => {
    const meta = mapJikanMetadata(mapJikanRawManga(SAMPLE_RAW));
    expect(meta?.title).toBe("Monster");
    expect(meta?.externalIds?.mal).toBe("1");
    expect(meta?.externalIds?.jikan).toBe("1");
    expect(meta?.observations?.length).toBeGreaterThan(0);
    expect(meta?.facts?.some((f) => f.kind === "rating")).toBe(true);
  });
});

describe("jikan fetch", () => {
  beforeEach(() => {
    httpGetMock.mockReset();
  });

  it("searches and resolves the first hit", async () => {
    httpGetMock.mockResolvedValueOnce({
      data: { data: [SAMPLE_RAW] },
    } as never);
    const hits = await searchJikanManga("Monster");
    expect(hits).toHaveLength(1);
    expect(httpGetMock.mock.calls[0]?.[0]).toContain("/manga?q=Monster");

    httpGetMock.mockResolvedValueOnce({
      data: { data: SAMPLE_RAW },
    } as never);
    const byId = await resolveJikanManga({ malId: 1 });
    expect(byId?.malId).toBe(1);
    expect(httpGetMock.mock.calls[1]?.[0]).toContain("/manga/1/full");
  });
});

describe("jikanModule", () => {
  it("declares books capabilities via defineProvider", () => {
    expect(jikanModule.info.id).toBe("jikan");
    expect(jikanModule.info.types).toEqual(["books"]);
    expect(jikanModule.info.capabilities).toContain("identify");
    expect(jikanModule.createMetadataAdapter).toBeTypeOf("function");
    expect(jikanModule.runMappingProbe).toBeTypeOf("function");
  });
});
